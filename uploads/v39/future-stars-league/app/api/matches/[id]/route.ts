import { getChatGPTUser } from "../../../chatgpt-auth";
import { appendAudit, rawDb } from "../../../../db/fsl";
export const dynamic = "force-dynamic";
async function access(id: string) {
  const current = await getChatGPTUser();
  if (!current) throw new Error("UNAUTHENTICATED");
  const db = rawDb();
  const match = await db
    .prepare(
      "SELECT m.*,t.organization_id AS organizationId,t.name AS tournamentName,t.edition AS tournamentEdition,t.field_count AS fieldCount,c.name AS competitionName,h.name AS home,h.short_name AS homeShort,h.primary_color AS homeColor,h.crest_key AS homeCrestKey,a.name AS away,a.short_name AS awayShort,a.primary_color AS awayColor,a.crest_key AS awayCrestKey FROM matches m JOIN tournaments t ON t.id=m.tournament_id LEFT JOIN competition_settings c ON c.id=m.competition_id JOIN teams h ON h.id=m.home_team_id JOIN teams a ON a.id=m.away_team_id WHERE m.id=?",
    )
    .bind(id)
    .first<any>();
  if (!match) throw new Error("NOT_FOUND");
  if (!match.competition_id) {
    const competitions = await db
      .prepare(
        "SELECT id,name FROM competition_settings WHERE tournament_id=? AND enabled=1 AND lower(trim(category))=lower(trim(?)) AND lower(trim(division))=lower(trim(?)) ORDER BY created_at",
      )
      .bind(match.tournament_id, match.category, match.division)
      .all<{ id: string; name: string }>();
    if (competitions.results.length === 1) {
      const competition = competitions.results[0];
      await db
        .prepare("UPDATE matches SET competition_id=? WHERE id=? AND competition_id IS NULL")
        .bind(competition.id, match.id)
        .run();
      match.competition_id = competition.id;
      match.competitionName = competition.name;
    }
  }
  const membership = await db
    .prepare(
      "SELECT role FROM memberships WHERE user_id=? AND organization_id=? AND status='active' AND (tournament_id IS NULL OR tournament_id=?) ORDER BY CASE role WHEN 'SUPER_ADMIN' THEN 1 WHEN 'TOURNAMENT_DIRECTOR' THEN 2 ELSE 3 END LIMIT 1",
    )
    .bind(current.userId, match.organizationId, match.tournament_id)
    .first<{ role: string }>();
  if (!membership) throw new Error("FORBIDDEN");
  if (membership.role === "REFEREE") {
    const identities = [current.displayName, current.email]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase());
    if (!identities.includes(String(match.referee_name || "").trim().toLowerCase()))
      throw new Error("FORBIDDEN");
  }
  if (membership.role === "CLUB_MANAGER") {
    const managed = await db
      .prepare(
        "SELECT t.id FROM teams t LEFT JOIN clubs c ON c.id=t.club_id WHERE COALESCE(c.club_manager_user_id,t.club_manager_user_id)=? AND t.id IN (?,?) LIMIT 1",
      )
      .bind(current.userId, match.home_team_id, match.away_team_id)
      .first();
    if (!managed) throw new Error("FORBIDDEN");
  }
  return { current, match, role: membership.role };
}
function err(error: unknown) {
  const m = error instanceof Error ? error.message : "";
  return Response.json(
    {
      error:
        m === "UNAUTHENTICATED"
          ? "Autenticazione richiesta"
          : m === "NOT_FOUND"
            ? "Partita non trovata"
            : m === "FORBIDDEN"
              ? "Operazione non autorizzata"
              : "Operazione non riuscita",
    },
    {
      status:
        m === "UNAUTHENTICATED"
          ? 401
          : m === "NOT_FOUND"
            ? 404
            : m === "FORBIDDEN"
              ? 403
              : 500,
    },
  );
}
function weekendKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getUTCDay();
  if (day !== 0 && day !== 6) return null;
  const saturday = new Date(date);
  saturday.setUTCDate(date.getUTCDate() + (day === 0 ? -1 : 0));
  return saturday.toISOString().slice(0, 10);
}
async function scheduleConflict(db: ReturnType<typeof rawDb>, match: any, startsAt: string, venue: string, field: string, refereeName: string) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return "Inserisci una data e un orario validi";
  const config=await db.prepare("SELECT match_minutes AS matchMinutes,buffer_minutes AS bufferMinutes FROM tournament_configs WHERE tournament_id=?").bind(match.tournament_id).first<any>();
  const slotDuration=Math.max(5,Number(config?.matchMinutes||30)+Number(config?.bufferMinutes||10));
  const rows = await db.prepare("SELECT home_team_id AS homeTeamId,away_team_id AS awayTeamId,starts_at AS startsAt,venue,field,referee_name AS refereeName FROM matches WHERE tournament_id=? AND id!=? AND status NOT IN ('postponed','cancelled')").bind(match.tournament_id,match.id).all<any>();
  const key=weekendKey(startsAt);
  for(const row of rows.results){
    const minutes=Math.abs(start.getTime()-new Date(row.startsAt).getTime())/60000;
    if(row.venue===venue&&row.field===field&&minutes<slotDuration)return `${field} è già occupato in questa fascia oraria`;
    if(refereeName&&row.refereeName&&refereeName.toLowerCase()===row.refereeName.toLowerCase()&&minutes<slotDuration)return `${refereeName} è già assegnato a un’altra gara`;
    if(key&&weekendKey(row.startsAt)===key&&[match.home_team_id,match.away_team_id].some(teamId=>teamId===row.homeTeamId||teamId===row.awayTeamId))return "Una delle squadre ha già un impegno nello stesso weekend";
  }
  return null;
}

async function knockoutPenaltyError(db:ReturnType<typeof rawDb>,match:any,matchId:string,homeScore:number,awayScore:number,homePenaltyScore:number|null,awayPenaltyScore:number|null){
  if(!["finals","knockout","placement","playout"].includes(String(match.stage||"")))return null;
  let tied=homeScore===awayScore,complete=true,hasDecision=homePenaltyScore!==null&&awayPenaltyScore!==null&&homePenaltyScore!==awayPenaltyScore;
  if(match.bracket_tie_id){
    const rows=await db.prepare("SELECT m.id,m.home_team_id AS homeTeamId,m.away_team_id AS awayTeamId,m.status,r.home_score AS homeScore,r.away_score AS awayScore,r.home_penalty_score AS homePenaltyScore,r.away_penalty_score AS awayPenaltyScore FROM matches m LEFT JOIN match_reports r ON r.match_id=m.id WHERE m.bracket_tie_id=? AND m.status!='cancelled'").bind(match.bracket_tie_id).all<any>();
    const totals=new Map<string,number>();
    for(const row of rows.results){
      if(row.id===matchId){totals.set(row.homeTeamId,(totals.get(row.homeTeamId)||0)+homeScore);totals.set(row.awayTeamId,(totals.get(row.awayTeamId)||0)+awayScore);continue}
      if(!["official","rectified"].includes(row.status)){complete=false;continue}
      if(row.homePenaltyScore!=null&&row.awayPenaltyScore!=null&&Number(row.homePenaltyScore)!==Number(row.awayPenaltyScore))hasDecision=true;
      totals.set(row.homeTeamId,(totals.get(row.homeTeamId)||0)+Number(row.homeScore||0));totals.set(row.awayTeamId,(totals.get(row.awayTeamId)||0)+Number(row.awayScore||0));
    }
    const values=[...totals.values()];tied=values.length===2&&values[0]===values[1];
  }
  if(complete&&tied&&!hasDecision)return "La sfida a eliminazione diretta è in parità: inserisci un risultato valido ai rigori";
  return null;
}

async function rebuildPlayerStats(db: ReturnType<typeof rawDb>, tournamentId: string, now: string) {
  const config = await db.prepare("SELECT match_minutes AS matchMinutes FROM tournament_configs WHERE tournament_id=?").bind(tournamentId).first<{matchMinutes:number}>();
  const minutes = Math.max(1, Number(config?.matchMinutes || 30));
  await db.batch([
    db.prepare("DELETE FROM player_tournament_stats WHERE tournament_id=?").bind(tournamentId),
    db.prepare(`INSERT INTO player_tournament_stats (id,player_id,tournament_id,appearances,goals,assists,clean_sheets,mvp_awards,yellow_cards,red_cards,minutes_played,updated_at)
      SELECT 'pts_' || p.id || '_' || ?,p.id,?,
      (SELECT COUNT(*) FROM match_callups mc JOIN matches m ON m.id=mc.match_id WHERE mc.player_id=p.id AND mc.status IN ('starter','present') AND m.tournament_id=? AND m.status IN ('official','rectified')),
      (SELECT COUNT(*) FROM match_events e JOIN matches m ON m.id=e.match_id WHERE e.player_id=p.id AND e.type='goal' AND m.tournament_id=? AND m.status IN ('official','rectified') AND NOT EXISTS (SELECT 1 FROM match_player_ratings mr WHERE mr.match_id=e.match_id AND mr.player_id=p.id)) + (SELECT COUNT(*) FROM match_player_ratings mr JOIN matches m ON m.id=mr.match_id, json_each(mr.modifiers_json) j WHERE mr.player_id=p.id AND j.value='goal' AND m.tournament_id=? AND m.status IN ('official','rectified')),
      (SELECT COUNT(*) FROM match_events e JOIN matches m ON m.id=e.match_id WHERE e.assist_player_id=p.id AND e.type='goal' AND m.tournament_id=? AND m.status IN ('official','rectified') AND NOT EXISTS (SELECT 1 FROM match_player_ratings mr WHERE mr.match_id=e.match_id AND mr.player_id=p.id)) + (SELECT COUNT(*) FROM match_player_ratings mr JOIN matches m ON m.id=mr.match_id, json_each(mr.modifiers_json) j WHERE mr.player_id=p.id AND j.value='assist' AND m.tournament_id=? AND m.status IN ('official','rectified')),
      (SELECT COUNT(*) FROM match_callups mc JOIN matches m ON m.id=mc.match_id JOIN match_reports r ON r.match_id=m.id WHERE mc.player_id=p.id AND mc.status IN ('starter','present') AND (lower(COALESCE(p.role,'')) LIKE '%port%' OR lower(COALESCE(p.role,'')) LIKE '%goal%') AND m.tournament_id=? AND m.status IN ('official','rectified') AND ((m.home_team_id=p.team_id AND r.away_score=0) OR (m.away_team_id=p.team_id AND r.home_score=0)) AND NOT EXISTS (SELECT 1 FROM match_player_ratings mr WHERE mr.match_id=m.id AND mr.player_id=p.id)) + (SELECT COUNT(*) FROM match_player_ratings mr JOIN matches m ON m.id=mr.match_id, json_each(mr.modifiers_json) j WHERE mr.player_id=p.id AND j.value='clean_sheet' AND m.tournament_id=? AND m.status IN ('official','rectified')),
      (SELECT COUNT(*) FROM match_events e JOIN matches m ON m.id=e.match_id WHERE e.player_id=p.id AND e.type='mvp' AND m.tournament_id=? AND m.status IN ('official','rectified') AND NOT EXISTS (SELECT 1 FROM match_player_ratings mr WHERE mr.match_id=e.match_id AND mr.player_id=p.id)) + (SELECT COUNT(*) FROM match_player_ratings mr JOIN matches m ON m.id=mr.match_id, json_each(mr.modifiers_json) j WHERE mr.player_id=p.id AND j.value='mvp' AND m.tournament_id=? AND m.status IN ('official','rectified')),
      (SELECT COUNT(*) FROM match_events e JOIN matches m ON m.id=e.match_id WHERE e.player_id=p.id AND e.type='yellow_card' AND m.tournament_id=? AND m.status IN ('official','rectified') AND NOT EXISTS (SELECT 1 FROM match_player_ratings mr WHERE mr.match_id=e.match_id AND mr.player_id=p.id)) + (SELECT COUNT(*) FROM match_player_ratings mr JOIN matches m ON m.id=mr.match_id, json_each(mr.modifiers_json) j WHERE mr.player_id=p.id AND j.value='yellow_card' AND m.tournament_id=? AND m.status IN ('official','rectified')),
      (SELECT COUNT(*) FROM match_events e JOIN matches m ON m.id=e.match_id WHERE e.player_id=p.id AND e.type='red_card' AND m.tournament_id=? AND m.status IN ('official','rectified') AND NOT EXISTS (SELECT 1 FROM match_player_ratings mr WHERE mr.match_id=e.match_id AND mr.player_id=p.id)) + (SELECT COUNT(*) FROM match_player_ratings mr JOIN matches m ON m.id=mr.match_id, json_each(mr.modifiers_json) j WHERE mr.player_id=p.id AND j.value='red_card' AND m.tournament_id=? AND m.status IN ('official','rectified')),
      (SELECT COUNT(*) FROM match_callups mc JOIN matches m ON m.id=mc.match_id WHERE mc.player_id=p.id AND mc.status IN ('starter','present') AND m.tournament_id=? AND m.status IN ('official','rectified')) * ?,?
      FROM players p WHERE EXISTS (SELECT 1 FROM tournament_teams tt WHERE tt.team_id=p.team_id AND tt.tournament_id=?)`)
      .bind(tournamentId,tournamentId,tournamentId,tournamentId,tournamentId,tournamentId,tournamentId,tournamentId,tournamentId,tournamentId,tournamentId,tournamentId,tournamentId,tournamentId,tournamentId,tournamentId,minutes,now,tournamentId),
  ]);
}

type AutomaticBadge = {
  id: string;
  matchId: string;
  teamId: string;
  playerId: string;
  scope: "match" | "tournament";
  type: string;
  title: string;
  recipientName: string;
  note: string;
  awardedAt: string;
};

async function rebuildAutomaticBadges(db: ReturnType<typeof rawDb>, tournamentId: string, actorId: string, now: string) {
  const rows = await db.prepare(`SELECT mr.player_id AS playerId,mr.team_id AS teamId,mr.match_id AS matchId,
    mr.final_rating_tenths AS finalRatingTenths,mr.modifiers_json AS modifiersJson,m.starts_at AS startsAt,
    p.first_name AS firstName,p.last_name AS lastName
    FROM match_player_ratings mr
    JOIN matches m ON m.id=mr.match_id
    JOIN players p ON p.id=mr.player_id
    WHERE mr.tournament_id=? AND m.status IN ('official','rectified')
    ORDER BY datetime(m.starts_at),m.id,mr.player_id`).bind(tournamentId).all<any>();
  const badges:AutomaticBadge[]=[];
  const states=new Map<string,{appearances:number;goals:number;assists:number;cleanSheets:number;cards:number;ratingsTotal:number;ratedMatches:number;mvpStreak:number;seen:Set<string>}>();
  const add=(row:any,type:string,title:string,note:string,scope:"match"|"tournament"="tournament")=>{
    const state=states.get(row.playerId)!;
    if(state.seen.has(type))return;
    state.seen.add(type);
    badges.push({id:`auto_${tournamentId}_${row.playerId}_${type}`,matchId:row.matchId,teamId:row.teamId,playerId:row.playerId,scope,type,title,recipientName:`${row.firstName} ${row.lastName}`,note,awardedAt:row.startsAt||now});
  };
  for(const row of rows.results){
    const state=states.get(row.playerId)||{appearances:0,goals:0,assists:0,cleanSheets:0,cards:0,ratingsTotal:0,ratedMatches:0,mvpStreak:0,seen:new Set<string>()};
    states.set(row.playerId,state);
    let modifiers:string[]=[];
    try{modifiers=JSON.parse(row.modifiersJson||"[]")}catch{}
    const count=(key:string)=>modifiers.filter(value=>value===key).length;
    const goals=count("goal"),assists=count("assist"),cleanSheets=count("clean_sheet"),mvp=count("mvp"),cards=count("yellow_card")+count("red_card");
    state.appearances+=1;state.goals+=goals;state.assists+=assists;state.cleanSheets+=cleanSheets;state.cards+=cards;state.ratingsTotal+=Number(row.finalRatingTenths||60);state.ratedMatches+=1;state.mvpStreak=mvp?state.mvpStreak+1:0;
    if(state.appearances===1)add(row,"badge_debut","Esordio","Prima presenza ufficiale Future Stars League","match");
    if(goals>0&&state.goals===goals)add(row,"badge_first_goal","Primo gol","Primo gol ufficiale nel torneo","match");
    if(goals>=2)add(row,"badge_double","Doppietta","Due gol nella stessa partita","match");
    if(goals>=3)add(row,"badge_triple","Tripletta","Tre gol nella stessa partita","match");
    if(cleanSheets>0)add(row,"badge_clean_sheet","Porta inviolata","Nessun gol subito nella partita","match");
    if(count("saved_penalty")>0)add(row,"badge_penalty_saver","Para-rigori","Rigore parato nel tabellino ufficiale","match");
    if(state.appearances>=5)add(row,"badge_streak_5","Sempre presente","Cinque presenze ufficiali nel torneo");
    if(state.goals>=5)add(row,"badge_bomber_5","Bomber 5","Cinque gol ufficiali nel torneo");
    if(state.goals>=10)add(row,"badge_bomber_10","Bomber 10","Dieci gol ufficiali nel torneo");
    if(state.goals>=20)add(row,"badge_bomber_20","Bomber 20","Venti gol ufficiali nel torneo");
    if(state.assists>=3)add(row,"badge_assist_3","Assist King","Tre assist ufficiali nel torneo");
    if(state.assists>=5)add(row,"badge_assist_5","Assist King 5","Cinque assist ufficiali nel torneo");
    if(state.assists>=10)add(row,"badge_assist_10","Assist King 10","Dieci assist ufficiali nel torneo");
    if(state.cleanSheets>=3)add(row,"badge_wall_3","Muro","Tre porte inviolate nel torneo");
    if(state.mvpStreak>=2)add(row,"badge_mvp_streak_2","MVP seriale","MVP in due presenze consecutive");
    const average=state.ratingsTotal/state.ratedMatches;
    if(state.ratedMatches>=3&&average>=75)add(row,"badge_average_75","Fuoriclasse 7,5","Media fantasy di almeno 7,5 dopo tre gare");
    if(state.ratedMatches>=3&&average>=80)add(row,"badge_average_80","Elite 8","Media fantasy di almeno 8 dopo tre gare");
    if(state.appearances>=5&&state.cards===0)add(row,"badge_fair_play_5","Fair Play","Cinque presenze senza ammonizioni o espulsioni");
  }
  await db.prepare("DELETE FROM awards WHERE tournament_id=? AND type LIKE 'badge_%'").bind(tournamentId).run();
  for(let index=0;index<badges.length;index+=60){
    await db.batch(badges.slice(index,index+60).map(badge=>db.prepare("INSERT INTO awards (id,tournament_id,match_id,team_id,player_id,scope,type,title,recipient_name,note,status,awarded_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'published',?,?,?,?)").bind(badge.id,tournamentId,badge.matchId,badge.teamId,badge.playerId,badge.scope,badge.type,badge.title,badge.recipientName,badge.note,badge.awardedAt,actorId,now,now)));
  }
}

async function rebuildRecognition(db: ReturnType<typeof rawDb>, tournamentId: string, actorId: string, now: string) {
  await rebuildPlayerStats(db,tournamentId,now);
  await rebuildAutomaticBadges(db,tournamentId,actorId,now);
}
async function eventScoreError(db: ReturnType<typeof rawDb>, matchId:string, homeTeamId:string, awayTeamId:string, homeScore:number, awayScore:number){
  const rows=await db.prepare("SELECT team_id AS teamId,type FROM match_events WHERE match_id=? AND type IN ('goal','own_goal')").bind(matchId).all<{teamId:string;type:string}>();
  if(!rows.results.length)return null;
  const home=rows.results.filter(row=>(row.type==='goal'&&row.teamId===homeTeamId)||(row.type==='own_goal'&&row.teamId===awayTeamId)).length;
  const away=rows.results.filter(row=>(row.type==='goal'&&row.teamId===awayTeamId)||(row.type==='own_goal'&&row.teamId===homeTeamId)).length;
  return home===homeScore&&away===awayScore?null:`Il tabellino contiene ${home}–${away}, mentre il risultato è ${homeScore}–${awayScore}`;
}
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { current, match, role } = await access(id);
    const db = rawDb();
    let editableTeamIds: string[] = [];
    if (
      ["SUPER_ADMIN", "TOURNAMENT_DIRECTOR", "SECRETARIAT"].includes(role)
    ) {
      editableTeamIds = [match.home_team_id, match.away_team_id];
    } else if (role === "CLUB_MANAGER") {
      const managedTeams = await db
        .prepare(
          "SELECT t.id FROM teams t LEFT JOIN clubs c ON c.id=t.club_id WHERE COALESCE(c.club_manager_user_id,t.club_manager_user_id)=? AND t.id IN (?,?)",
        )
        .bind(current.userId, match.home_team_id, match.away_team_id)
        .all<{ id: string }>();
      editableTeamIds = managedTeams.results.map((team) => team.id);
    }
    const [homePlayers, awayPlayers, callups, report, errors, referees, history, fields, matchAwards, finance, matchEvents, playerRatings, competitionTeams] =
      await Promise.all([
        db
          .prepare(
            "SELECT id,first_name AS firstName,last_name AS lastName,public_name AS publicName,birth_year AS birthYear,shirt_number AS shirtNumber,role,photo_key AS photoKey FROM players WHERE team_id=? AND status='active' ORDER BY shirt_number,last_name",
          )
          .bind(match.home_team_id)
          .all(),
        db
          .prepare(
            "SELECT id,first_name AS firstName,last_name AS lastName,public_name AS publicName,birth_year AS birthYear,shirt_number AS shirtNumber,role,photo_key AS photoKey FROM players WHERE team_id=? AND status='active' ORDER BY shirt_number,last_name",
          )
          .bind(match.away_team_id)
          .all(),
        db
          .prepare(
            "SELECT player_id AS playerId,team_id AS teamId,status FROM match_callups WHERE match_id=?",
          )
          .bind(id)
          .all(),
        db
          .prepare(
            "SELECT home_score AS homeScore,away_score AS awayScore,home_penalty_score AS homePenaltyScore,away_penalty_score AS awayPenaltyScore,referee_notes AS refereeNotes,director_notes AS directorNotes,submitted_at AS submittedAt,officialized_at AS officializedAt,version FROM match_reports WHERE match_id=?",
          )
          .bind(id)
          .first(),
        db
          .prepare(
            "SELECT id,subject,description,status,created_at AS createdAt,resolution FROM error_reports WHERE match_id=? ORDER BY created_at DESC",
          )
          .bind(id)
          .all(),
        db
          .prepare("SELECT DISTINCT COALESCE(u.full_name,u.email) AS name,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tournament_id=? AND m.role='REFEREE' AND m.status='active' UNION SELECT email AS name,email FROM invitations WHERE tournament_id=? AND role='REFEREE' AND status!='revoked' ORDER BY name")
          .bind(match.tournament_id,match.tournament_id)
          .all(),
        db
          .prepare("SELECT a.id,a.action,a.actor_role AS actorRole,a.payload,a.created_at AS createdAt,COALESCE(u.full_name,u.email) AS actorName FROM audit_events a LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.entity_type='match' AND a.entity_id=? ORDER BY a.created_at DESC LIMIT 30")
          .bind(id)
          .all(),
        db
          .prepare("SELECT id,venue_name AS venueName,field_name AS fieldName,field_number AS fieldNumber FROM tournament_fields WHERE tournament_id=? AND active=1 ORDER BY sort_order")
          .bind(match.tournament_id)
          .all(),
        db
          .prepare("SELECT id,match_id AS matchId,team_id AS teamId,player_id AS playerId,scope,type,title,recipient_name AS recipientName,note,media_key AS mediaKey,status,awarded_at AS awardedAt FROM awards WHERE match_id=? AND status='published' ORDER BY awarded_at DESC")
          .bind(id)
          .all(),
        db
          .prepare("WITH charges AS (SELECT team_id AS teamId,COUNT(*) AS callups,SUM(amount_cents) AS dueCents FROM payment_charges WHERE match_id=? GROUP BY team_id), paid AS (SELECT team_id AS teamId,SUM(amount_cents) AS paidCents FROM payment_entries WHERE match_id=? GROUP BY team_id) SELECT c.teamId,c.callups,c.dueCents,COALESCE(p.paidCents,0) AS paidCents FROM charges c LEFT JOIN paid p ON p.teamId=c.teamId")
          .bind(id,id)
          .all(),
        db.prepare("SELECT e.id,e.team_id AS teamId,e.player_id AS playerId,e.assist_player_id AS assistPlayerId,e.type,e.minute,e.note,p.first_name || ' ' || p.last_name AS playerName,ap.first_name || ' ' || ap.last_name AS assistPlayerName FROM match_events e LEFT JOIN players p ON p.id=e.player_id LEFT JOIN players ap ON ap.id=e.assist_player_id WHERE e.match_id=? ORDER BY e.minute,e.created_at")
          .bind(id).all(),
        db.prepare("SELECT player_id AS playerId,team_id AS teamId,base_rating_tenths AS baseRatingTenths,manual_delta_tenths AS manualDeltaTenths,modifiers_json AS modifiersJson,final_rating_tenths AS finalRatingTenths FROM match_player_ratings WHERE match_id=?")
          .bind(id).all(),
        match.competition_id?db.prepare("SELECT DISTINCT t.id,t.name FROM teams t JOIN tournament_teams tt ON tt.team_id=t.id AND tt.tournament_id=? AND tt.status!='withdrawn' WHERE (EXISTS (SELECT 1 FROM competition_team_entries x WHERE x.competition_id=? AND x.team_id=t.id AND x.status!='withdrawn')) OR (NOT EXISTS (SELECT 1 FROM competition_team_entries x WHERE x.competition_id=?) AND tt.category=? AND tt.division=?) ORDER BY t.name").bind(match.tournament_id,match.competition_id,match.competition_id,match.category,match.division).all():db.prepare("SELECT DISTINCT t.id,t.name FROM teams t JOIN tournament_teams tt ON tt.team_id=t.id WHERE tt.tournament_id=? AND tt.category=? AND tt.division=? AND tt.status!='withdrawn' ORDER BY t.name").bind(match.tournament_id,match.category,match.division).all(),
      ]);
    return Response.json({
      match: {
        id: match.id,
        tournamentId: match.tournament_id,
        tournamentName: match.tournamentName,
        tournamentEdition: match.tournamentEdition,
        homeTeamId: match.home_team_id,
        awayTeamId: match.away_team_id,
        home: match.home,
        homeShort: match.homeShort,
        homeColor: match.homeColor,
        homeCrestKey: match.homeCrestKey,
        away: match.away,
        awayShort: match.awayShort,
        awayColor: match.awayColor,
        awayCrestKey: match.awayCrestKey,
        category: match.category,
        division: match.division,
        matchDay: match.match_day,
        startsAt: match.starts_at,
        venue: match.venue,
        field: match.field,
        refereeName: match.referee_name,
        status: match.status,
        competitionId: match.competition_id,
        competitionName: match.competitionName,
        stage: match.stage,
        roundName: match.round_name,
        bracketRound: match.bracket_round,
        bracketTieId: match.bracket_tie_id,
        bracketLeg: match.bracket_leg,
      },
      homePlayers: homePlayers.results,
      awayPlayers: awayPlayers.results,
      callups: callups.results,
      report: report || {
        homeScore: 0,
        awayScore: 0,
        homePenaltyScore: null,
        awayPenaltyScore: null,
        refereeNotes: "",
        directorNotes: "",
      },
      errors: errors.results,
      referees: referees.results,
      fields: fields.results.length ? fields.results : Array.from({length:Number(match.fieldCount||0)},(_,index)=>({id:`legacy-${index}`,venueName:match.venue||"Future Arena",fieldName:`Campo ${index+1}`,fieldNumber:String(index+1)})),
      history: history.results,
      matchAwards: matchAwards.results,
      finance: role==="REFEREE"?[]:finance.results,
      events: matchEvents.results,
      playerRatings: playerRatings.results.map((row:any)=>{let modifiers:string[]=[];try{modifiers=JSON.parse(row.modifiersJson||"[]")}catch{}return {...row,modifiers,modifiersJson:undefined}}),
      competitionTeams: competitionTeams.results,
      viewerRole: role,
      editableTeamIds,
    });
  } catch (error) {
    return err(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { current, match, role } = await access(id);
    const body = (await request.json()) as any,
      db = rawDb(),
      now = new Date().toISOString();
    if (body.action === "update_match") {
      if (!["SUPER_ADMIN", "TOURNAMENT_DIRECTOR"].includes(role)) throw new Error("FORBIDDEN");
      const startsAt=String(body.startsAt||""),venue=String(body.venue||"").trim(),field=String(body.field||"").trim(),refereeName=String(body.refereeName||"").trim();
      const homeTeamId=String(body.homeTeamId||match.home_team_id),awayTeamId=String(body.awayTeamId||match.away_team_id);
      const status=["scheduled","confirmed","live","played","report_submitted","reviewing","official","rectified","postponed","recovery","cancelled"].includes(body.status)?String(body.status):"scheduled";
      const matchDay=Math.max(1,Number(body.matchDay)||match.match_day);
      if(!startsAt||!venue||!field)return Response.json({error:"Completa data, sede e campo"},{status:400});
      if(homeTeamId===awayTeamId)return Response.json({error:"Seleziona due squadre diverse"},{status:400});
      if(homeTeamId!==match.home_team_id||awayTeamId!==match.away_team_id){
        if(["official","rectified","report_submitted"].includes(match.status))return Response.json({error:"Prima di cambiare le squadre devi riaprire il referto della gara"},{status:409});
        const eligible=await db.prepare("SELECT COUNT(DISTINCT t.id) AS total FROM teams t JOIN tournament_teams tt ON tt.team_id=t.id AND tt.tournament_id=? AND tt.status!='withdrawn' WHERE t.id IN (?,?) AND ((EXISTS (SELECT 1 FROM competition_team_entries x WHERE x.competition_id=? AND x.team_id=t.id AND x.status!='withdrawn')) OR (NOT EXISTS (SELECT 1 FROM competition_team_entries x WHERE x.competition_id=?) AND tt.category=? AND tt.division=?))").bind(match.tournament_id,homeTeamId,awayTeamId,match.competition_id,match.competition_id,match.category,match.division).first<{total:number}>();
        if(Number(eligible?.total)!==2)return Response.json({error:"Le squadre selezionate non partecipano a questa competizione"},{status:409});
      }
      if(!["postponed","cancelled"].includes(status)){
        const conflict=await scheduleConflict(db,{...match,home_team_id:homeTeamId,away_team_id:awayTeamId},startsAt,venue,field,refereeName);
        if(conflict)return Response.json({error:conflict},{status:409});
      }
      if(homeTeamId!==match.home_team_id||awayTeamId!==match.away_team_id)await db.batch([
        db.prepare("DELETE FROM payment_charges WHERE match_id=?").bind(id),db.prepare("DELETE FROM match_callups WHERE match_id=?").bind(id),db.prepare("DELETE FROM match_player_ratings WHERE match_id=?").bind(id),db.prepare("DELETE FROM match_events WHERE match_id=?").bind(id),db.prepare("DELETE FROM awards WHERE match_id=?").bind(id),db.prepare("DELETE FROM match_reports WHERE match_id=?").bind(id),
      ]);
      await db.prepare("UPDATE matches SET home_team_id=?,away_team_id=?,starts_at=?,venue=?,field=?,referee_name=?,match_day=?,status=?,updated_at=? WHERE id=?").bind(homeTeamId,awayTeamId,startsAt,venue,field,refereeName||null,matchDay,status,now,id).run();
      await appendAudit({tournamentId:match.tournament_id,userId:current.userId,role,action:"match.updated",entityType:"match",entityId:id,payload:{homeTeamId,awayTeamId,startsAt,venue,field,refereeName,status,matchDay}});
      return Response.json({ok:true});
    }
    if (body.action === "create_match_award") {
      if (!["SUPER_ADMIN", "TOURNAMENT_DIRECTOR"].includes(role)) throw new Error("FORBIDDEN");
      const playerId=String(body.playerId||""),type=String(body.type||"mvp"),note=String(body.note||"").trim().slice(0,500);
      const titles:Record<string,string>={mvp:"MVP della partita",top_goal:"Top Goal",top_save:"Top Save",fair_play:"Fair Play",best_defender:"Miglior difensore",rising_star:"Rising Star",special:"Premio speciale"};
      if(!titles[type])return Response.json({error:"Premio non valido"},{status:400});
      const player=await db.prepare("SELECT p.id,p.team_id AS teamId,p.first_name AS firstName,p.last_name AS lastName,mc.status AS attendance FROM players p JOIN match_callups mc ON mc.player_id=p.id AND mc.match_id=? WHERE p.id=? AND p.team_id IN (?,?)").bind(id,playerId,match.home_team_id,match.away_team_id).first<any>();
      if(!player||!["starter","present"].includes(player.attendance))return Response.json({error:"Seleziona un giocatore presente nella distinta finale"},{status:409});
      if(type==="mvp"){
        const existing=await db.prepare("SELECT id FROM awards WHERE match_id=? AND type='mvp' AND status='published' LIMIT 1").bind(id).first();
        if(existing)return Response.json({error:"L’MVP della partita è già stato assegnato"},{status:409});
      }
      const awardId=crypto.randomUUID(),recipientName=`${player.firstName} ${player.lastName}`;
      const statements=[db.prepare("INSERT INTO awards (id,tournament_id,match_id,team_id,player_id,scope,type,title,recipient_name,note,status,awarded_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(awardId,match.tournament_id,id,player.teamId,playerId,"match",type,titles[type],recipientName,note||null,"published",now,current.userId,now,now)];
      if(type==="mvp")statements.push(db.prepare("INSERT INTO match_events (id,match_id,tournament_id,team_id,player_id,type,minute,note,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'mvp',0,?,?,?,?)").bind(crypto.randomUUID(),id,match.tournament_id,player.teamId,playerId,note||null,current.userId,now,now));
      await db.batch(statements);
      if(["official","rectified"].includes(match.status))await rebuildRecognition(db,match.tournament_id,current.userId,now);
      await appendAudit({tournamentId:match.tournament_id,userId:current.userId,role,action:"match.award_created",entityType:"match",entityId:id,payload:{awardId,type,playerId}});
      return Response.json({ok:true,id:awardId},{status:201});
    }
    if (body.action === "save_callups") {
      const allowed = [
        "SUPER_ADMIN",
        "TOURNAMENT_DIRECTOR",
        "SECRETARIAT",
        "CLUB_MANAGER",
      ];
      if (!allowed.includes(role)) throw new Error("FORBIDDEN");
      const playerIds = Array.isArray(body.playerIds) ? body.playerIds : [];
      const teamId = String(body.teamId || "");
      if (teamId !== match.home_team_id && teamId !== match.away_team_id)
        return Response.json({ error: "Squadra non valida" }, { status: 400 });
      if (role === "CLUB_MANAGER") {
        const managed = await db
          .prepare(
            "SELECT t.id FROM teams t LEFT JOIN clubs c ON c.id=t.club_id WHERE t.id=? AND COALESCE(c.club_manager_user_id,t.club_manager_user_id)=? LIMIT 1",
          )
          .bind(teamId, current.userId)
          .first();
        if (!managed) throw new Error("FORBIDDEN");
      }
      await db
        .prepare("DELETE FROM match_callups WHERE match_id=? AND team_id=?")
        .bind(id, teamId)
        .run();
      await db.prepare("DELETE FROM payment_charges WHERE match_id=? AND team_id=?").bind(id,teamId).run();
      const fee=await db.prepare("SELECT match_fee_cents AS matchFeeCents FROM tournament_configs WHERE tournament_id=?").bind(match.tournament_id).first<{matchFeeCents:number}>();
      const matchFeeCents=Math.max(0,Number(fee?.matchFeeCents||0));
      for (const playerId of playerIds)
        await db.batch([
          db.prepare("INSERT INTO match_callups (id,match_id,team_id,player_id,status,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM players WHERE id=? AND team_id=?)").bind(crypto.randomUUID(),id,teamId,playerId,"called",now,playerId,teamId),
          db.prepare("INSERT INTO payment_charges (id,tournament_id,match_id,team_id,player_id,amount_cents,description,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM players WHERE id=? AND team_id=?)").bind(crypto.randomUUID(),match.tournament_id,id,teamId,playerId,matchFeeCents,`Quota convocazione · Giornata ${match.match_day}`,now,now,playerId,teamId),
        ]);
      await appendAudit({
        tournamentId: match.tournament_id,
        userId: current.userId,
        role,
        action: "callups.saved",
        entityType: "match",
        entityId: id,
        payload: { teamId, count: playerIds.length, matchFeeCents },
      });
      return Response.json({ ok: true });
    }
    if (body.action === "save_events") {
      if (!["SUPER_ADMIN", "TOURNAMENT_DIRECTOR", "REFEREE"].includes(role)) throw new Error("FORBIDDEN");
      if (role === "REFEREE" && ["official","rectified"].includes(match.status)) return Response.json({error:"Il referto ufficiale può essere rettificato soltanto dal Direttore"},{status:409});
      const events = Array.isArray(body.events) ? body.events.slice(0, 100) : [];
      const players = await db.prepare("SELECT id,team_id AS teamId FROM players WHERE team_id IN (?,?)").bind(match.home_team_id,match.away_team_id).all<{id:string;teamId:string}>();
      const playerTeams = new Map(players.results.map(player=>[player.id,player.teamId]));
      const allowedTypes = new Set(["goal","own_goal","yellow_card","red_card","mvp"]);
      const normalized = events.map((event:any)=>({
        id:String(event.id||crypto.randomUUID()), type:String(event.type||""), teamId:String(event.teamId||""),
        playerId:event.playerId?String(event.playerId):null, assistPlayerId:event.assistPlayerId?String(event.assistPlayerId):null,
        minute:Math.max(0,Math.min(240,Number(event.minute)||0)), note:String(event.note||"").slice(0,300),
      }));
      if (normalized.some(event=>!allowedTypes.has(event.type)||![match.home_team_id,match.away_team_id].includes(event.teamId)||!event.playerId||playerTeams.get(event.playerId)!==event.teamId||event.assistPlayerId&&(playerTeams.get(event.assistPlayerId)!==event.teamId||event.assistPlayerId===event.playerId))) return Response.json({error:"Controlla giocatori, squadra e tipo degli eventi"},{status:400});
      if (normalized.filter(event=>event.type==="mvp").length>1) return Response.json({error:"Puoi indicare un solo MVP per partita"},{status:400});
      const statements = [db.prepare("DELETE FROM match_events WHERE match_id=?").bind(id), ...normalized.map(event=>db.prepare("INSERT INTO match_events (id,match_id,tournament_id,team_id,player_id,assist_player_id,type,minute,note,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(event.id,id,match.tournament_id,event.teamId,event.playerId,event.assistPlayerId,event.type,event.minute,event.note||null,current.userId,now,now))];
      await db.batch(statements);
      if (["official","rectified"].includes(match.status)) await rebuildRecognition(db,match.tournament_id,current.userId,now);
      await appendAudit({tournamentId:match.tournament_id,userId:current.userId,role,action:"match.events_saved",entityType:"match",entityId:id,payload:{count:normalized.length}});
      return Response.json({ok:true});
    }
    if (body.action === "save_attendance") {
      if (!["SUPER_ADMIN","TOURNAMENT_DIRECTOR","REFEREE"].includes(role)) throw new Error("FORBIDDEN");
      if (role === "REFEREE" && ["official","rectified"].includes(match.status)) return Response.json({error:"Le presenze ufficiali possono essere rettificate soltanto dal Direttore"},{status:409});
      const entries=Array.isArray(body.entries)?body.entries.slice(0,100):[];
      const allowed=new Set(["starter","present","absent"]);
      if(entries.some((entry:any)=>!entry.playerId||!allowed.has(String(entry.status))))return Response.json({error:"Presenze non valide"},{status:400});
      const existing=await db.prepare("SELECT player_id AS playerId FROM match_callups WHERE match_id=?").bind(id).all<{playerId:string}>();
      const ids=new Set(existing.results.map(row=>row.playerId));
      if(entries.some((entry:any)=>!ids.has(String(entry.playerId))))return Response.json({error:"Puoi confermare soltanto giocatori presenti in distinta"},{status:400});
      if(entries.length)await db.batch(entries.map((entry:any)=>db.prepare("UPDATE match_callups SET status=? WHERE match_id=? AND player_id=?").bind(String(entry.status),id,String(entry.playerId))));
      if (["official","rectified"].includes(match.status)) await rebuildRecognition(db,match.tournament_id,current.userId,now);
      await appendAudit({tournamentId:match.tournament_id,userId:current.userId,role,action:"match.attendance_saved",entityType:"match",entityId:id,payload:{confirmed:entries.filter((entry:any)=>entry.status!=="absent").length,absent:entries.filter((entry:any)=>entry.status==="absent").length}});
      return Response.json({ok:true});
    }
    if (body.action === "save_match_ratings") {
      if (!["SUPER_ADMIN","TOURNAMENT_DIRECTOR","REFEREE"].includes(role)) throw new Error("FORBIDDEN");
      if (role === "REFEREE" && ["official","rectified"].includes(match.status)) return Response.json({error:"Il tabellino ufficiale può essere rettificato soltanto dal Direttore"},{status:409});
      const values:Record<string,number>={goal:30,assist:10,clean_sheet:30,missed_penalty:-30,saved_penalty:30,yellow_card:-5,red_card:-10,mvp:10,own_goal:-20,conceded_goal:-10};
      const entries=Array.isArray(body.entries)?body.entries.slice(0,100):[];
      const callups=await db.prepare("SELECT mc.player_id AS playerId,mc.team_id AS teamId,mc.status,p.role,p.first_name AS firstName,p.last_name AS lastName FROM match_callups mc JOIN players p ON p.id=mc.player_id WHERE mc.match_id=?").bind(id).all<{playerId:string;teamId:string;status:string;role:string;firstName:string;lastName:string}>();
      const eligible=new Map(callups.results.filter(row=>["starter","present"].includes(row.status)).map(row=>[row.playerId,{teamId:row.teamId,isKeeper:/port|goal/i.test(row.role||""),name:`${row.firstName} ${row.lastName}`}]));
      const normalized=entries.map((entry:any)=>{const playerId=String(entry.playerId||""),player=eligible.get(playerId),manualDeltaTenths=Math.max(-30,Math.min(40,Math.round(Number(entry.manualDeltaTenths)||0))),modifiers=(Array.isArray(entry.modifiers)?entry.modifiers:[]).map(String).slice(0,30);return {playerId,teamId:player?.teamId,isKeeper:player?.isKeeper,manualDeltaTenths,modifiers,finalRatingTenths:60+manualDeltaTenths+modifiers.reduce((sum:number,key:string)=>sum+(values[key]??0),0)}});
      if(normalized.some(row=>!row.teamId||row.manualDeltaTenths%5!==0||row.modifiers.some(key=>values[key]===undefined)||row.modifiers.some(key=>["clean_sheet","saved_penalty","conceded_goal"].includes(key)&&!row.isKeeper)))return Response.json({error:"Controlla voti, giocatori e bonus del tabellino"},{status:400});
      if(normalized.reduce((total,row)=>total+row.modifiers.filter(key=>key==="mvp").length,0)>1)return Response.json({error:"Puoi assegnare un solo bonus MVP per partita"},{status:400});
      const mvp=normalized.find(row=>row.modifiers.includes("mvp"));
      const derivedEventTypes=new Set(["goal","own_goal","yellow_card","red_card","mvp"]);
      const derivedEvents=normalized.flatMap(row=>row.modifiers.filter(type=>derivedEventTypes.has(type)).map(type=>({row,type})));
      const statements=[db.prepare("DELETE FROM match_player_ratings WHERE match_id=?").bind(id),db.prepare("DELETE FROM awards WHERE match_id=? AND type='mvp'").bind(id),db.prepare("DELETE FROM match_events WHERE match_id=?").bind(id),...normalized.map(row=>db.prepare("INSERT INTO match_player_ratings (id,match_id,tournament_id,team_id,player_id,base_rating_tenths,manual_delta_tenths,modifiers_json,final_rating_tenths,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),id,match.tournament_id,row.teamId,row.playerId,60,row.manualDeltaTenths,JSON.stringify(row.modifiers),row.finalRatingTenths,current.userId,now,now)),...derivedEvents.map(({row,type})=>db.prepare("INSERT INTO match_events (id,match_id,tournament_id,team_id,player_id,type,minute,note,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?,?,?)").bind(crypto.randomUUID(),id,match.tournament_id,row.teamId,row.playerId,type,"Generato dal tabellino gara",current.userId,now,now))];
      if(mvp)statements.push(db.prepare("INSERT INTO awards (id,tournament_id,match_id,team_id,player_id,scope,type,title,recipient_name,status,awarded_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'match','mvp','MVP della partita',?,'published',?,?,?,?)").bind(crypto.randomUUID(),match.tournament_id,id,mvp.teamId,mvp.playerId,eligible.get(mvp.playerId)?.name||"Giocatore",now,current.userId,now,now));
      await db.batch(statements);
      if(["official","rectified"].includes(match.status))await rebuildRecognition(db,match.tournament_id,current.userId,now);
      await appendAudit({tournamentId:match.tournament_id,userId:current.userId,role,action:"match.ratings_saved",entityType:"match",entityId:id,payload:{players:normalized.length}});
      return Response.json({ok:true});
    }
    if (body.action === "submit_report") {
      if (!["SUPER_ADMIN", "TOURNAMENT_DIRECTOR", "REFEREE"].includes(role))
        throw new Error("FORBIDDEN");
      if (
        role === "REFEREE" &&
        ["report_submitted", "official", "rectified"].includes(match.status)
      )
        return Response.json(
          { error: "Il referto è già stato inviato e deve essere riaperto dal Direttore" },
          { status: 409 },
        );
      const homeScore = Math.max(0, Number(body.homeScore) || 0),
        awayScore = Math.max(0, Number(body.awayScore) || 0),
        homePenaltyScore=body.homePenaltyScore===""||body.homePenaltyScore==null?null:Math.max(0,Number(body.homePenaltyScore)||0),
        awayPenaltyScore=body.awayPenaltyScore===""||body.awayPenaltyScore==null?null:Math.max(0,Number(body.awayPenaltyScore)||0);
      const scoreError=await eventScoreError(db,id,match.home_team_id,match.away_team_id,homeScore,awayScore);
      if(scoreError)return Response.json({error:scoreError},{status:409});
      const penaltyError=await knockoutPenaltyError(db,match,id,homeScore,awayScore,homePenaltyScore,awayPenaltyScore);
      if(penaltyError)return Response.json({error:penaltyError},{status:409});
      await db.batch([
        db
          .prepare(
            "INSERT INTO match_reports (id,match_id,home_score,away_score,home_penalty_score,away_penalty_score,referee_notes,submitted_by,submitted_at,officialized_by,officialized_at,version,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(match_id) DO UPDATE SET home_score=excluded.home_score,away_score=excluded.away_score,home_penalty_score=excluded.home_penalty_score,away_penalty_score=excluded.away_penalty_score,referee_notes=excluded.referee_notes,submitted_by=excluded.submitted_by,submitted_at=excluded.submitted_at,officialized_by=excluded.officialized_by,officialized_at=excluded.officialized_at,version=match_reports.version+1,updated_at=excluded.updated_at",
          )
          .bind(
            crypto.randomUUID(),
            id,
            homeScore,
            awayScore,
            homePenaltyScore,
            awayPenaltyScore,
            String(body.notes || ""),
            current.userId,
            now,
            current.userId,
            now,
            1,
            now,
          ),
        db
          .prepare(
            "UPDATE matches SET status='official',updated_at=? WHERE id=?",
          )
          .bind(now, id),
      ]);
      await appendAudit({
        tournamentId: match.tournament_id,
        userId: current.userId,
        role,
        action: "report.submitted",
        entityType: "match",
        entityId: id,
        payload: { homeScore, awayScore },
      });
      await appendAudit({
        tournamentId: match.tournament_id,
        userId: current.userId,
        role,
        action: "result.officialized",
        entityType: "match",
        entityId: id,
        payload: { homeScore, awayScore, source: "referee_report" },
      });
      await rebuildRecognition(db,match.tournament_id,current.userId,now);
      return Response.json({ ok: true });
    }
    if (body.action === "officialize") {
      if (!["SUPER_ADMIN", "TOURNAMENT_DIRECTOR"].includes(role))
        throw new Error("FORBIDDEN");
      const homeScore = Math.max(0, Number(body.homeScore) || 0),
        awayScore = Math.max(0, Number(body.awayScore) || 0),
        homePenaltyScore=body.homePenaltyScore===""||body.homePenaltyScore==null?null:Math.max(0,Number(body.homePenaltyScore)||0),
        awayPenaltyScore=body.awayPenaltyScore===""||body.awayPenaltyScore==null?null:Math.max(0,Number(body.awayPenaltyScore)||0),
        notes = String(body.notes || "");
      const scoreError=await eventScoreError(db,id,match.home_team_id,match.away_team_id,homeScore,awayScore);
      if(scoreError)return Response.json({error:scoreError},{status:409});
      const penaltyError=await knockoutPenaltyError(db,match,id,homeScore,awayScore,homePenaltyScore,awayPenaltyScore);
      if(penaltyError)return Response.json({error:penaltyError},{status:409});
      await db.batch([
        db
          .prepare(
            "INSERT INTO match_reports (id,match_id,home_score,away_score,home_penalty_score,away_penalty_score,director_notes,officialized_by,officialized_at,version,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(match_id) DO UPDATE SET home_score=excluded.home_score,away_score=excluded.away_score,home_penalty_score=excluded.home_penalty_score,away_penalty_score=excluded.away_penalty_score,director_notes=excluded.director_notes,officialized_by=excluded.officialized_by,officialized_at=excluded.officialized_at,version=match_reports.version+1,updated_at=excluded.updated_at",
          )
          .bind(
            crypto.randomUUID(),
            id,
            homeScore,
            awayScore,
            homePenaltyScore,
            awayPenaltyScore,
            notes,
            current.userId,
            now,
            1,
            now,
          ),
        db
          .prepare("UPDATE matches SET status=?,updated_at=? WHERE id=?")
          .bind(
            ["official", "rectified"].includes(match.status) ? "rectified" : "official",
            now,
            id,
          ),
      ]);
      await appendAudit({
        tournamentId: match.tournament_id,
        userId: current.userId,
        role,
        action:
          ["official", "rectified"].includes(match.status)
            ? "result.rectified"
            : "result.officialized",
        entityType: "match",
        entityId: id,
        payload: { homeScore, awayScore, notes },
      });
      await rebuildRecognition(db,match.tournament_id,current.userId,now);
      return Response.json({ ok: true });
    }
    if (body.action === "report_error") {
      const subject = String(body.subject || "").trim(),
        description = String(body.description || "").trim();
      if (!subject || description.length < 5)
        return Response.json(
          { error: "Descrivi l’errore da verificare" },
          { status: 400 },
        );
      const ticketId = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO error_reports (id,tournament_id,match_id,reporter_user_id,subject,description,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          ticketId,
          match.tournament_id,
          id,
          current.userId,
          subject,
          description,
          "open",
          now,
          now,
        )
        .run();
      await appendAudit({
        tournamentId: match.tournament_id,
        userId: current.userId,
        role,
        action: "error.reported",
        entityType: "error_report",
        entityId: ticketId,
        payload: { matchId: id },
      });
      return Response.json({ ok: true }, { status: 201 });
    }
    return Response.json({ error: "Operazione non valida" }, { status: 400 });
  } catch (error) {
    return err(error);
  }
}
