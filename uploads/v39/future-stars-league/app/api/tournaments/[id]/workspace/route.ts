import { getChatGPTUser } from "../../../../chatgpt-auth";
import {
  appendAudit,
  ensureWorkspace,
  rawDb,
} from "../../../../../db/fsl";
export const dynamic = "force-dynamic";
async function context(id: string) {
  const current = await getChatGPTUser();
  if (!current) throw new Error("UNAUTHENTICATED");
  const workspace = await ensureWorkspace({
    userId: current.userId,
    email: current.email,
    displayName: current.displayName,
  });
  const tournament = await rawDb()
    .prepare(
      "SELECT id,name,edition,status,team_count AS plannedTeams,field_count AS fieldCount,COALESCE(is_public,CASE WHEN status IN ('active','completed') THEN 1 ELSE 0 END) AS isPublic,published_at AS publishedAt,closed_at AS closedAt FROM tournaments WHERE id=? AND organization_id=?",
    )
    .bind(id, workspace.organizationId)
    .first();
  if (!tournament) throw new Error("NOT_FOUND");
  if (workspace.role !== "SUPER_ADMIN") {
    const scoped = await rawDb()
      .prepare(
        "SELECT role FROM memberships WHERE user_id=? AND tournament_id=? AND status='active' LIMIT 1",
      )
      .bind(current.userId, id)
      .first<{ role: string }>();
    if (!scoped) throw new Error("FORBIDDEN");
    workspace.role = scoped.role;
  }
  return { current, workspace, tournament };
}
function responseError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("UNIQUE"))
    return Response.json(
      { error: "Una delle squadre è già presente nella categoria selezionata" },
      { status: 409 },
    );
  return Response.json(
    {
      error:
        message === "UNAUTHENTICATED"
          ? "Autenticazione richiesta"
          : message === "NOT_FOUND"
            ? "Torneo non trovato"
            : message === "FORBIDDEN"
              ? "Operazione non autorizzata"
              : "Operazione non riuscita",
    },
    {
      status:
        message === "UNAUTHENTICATED"
          ? 401
          : message === "NOT_FOUND"
            ? 404
            : message === "FORBIDDEN"
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

async function scheduleConflict(db: ReturnType<typeof rawDb>, input: { tournamentId: string; matchId?: string; startsAt: string; venue: string; field: string; homeTeamId: string; awayTeamId: string; refereeName?: string }) {
  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime())) return "Inserisci una data e un orario validi";
  const config=await db.prepare("SELECT match_minutes AS matchMinutes,buffer_minutes AS bufferMinutes FROM tournament_configs WHERE tournament_id=?").bind(input.tournamentId).first<any>();
  const slotDuration=Math.max(5,Number(config?.matchMinutes||30)+Number(config?.bufferMinutes||10));
  const rows = await db.prepare("SELECT id,home_team_id AS homeTeamId,away_team_id AS awayTeamId,starts_at AS startsAt,venue,field,referee_name AS refereeName,status FROM matches WHERE tournament_id=? AND id!=? AND status NOT IN ('postponed','cancelled')").bind(input.tournamentId,input.matchId||"").all<any>();
  const key = weekendKey(input.startsAt);
  for (const row of rows.results) {
    const other = new Date(row.startsAt);
    const minutes = Math.abs(start.getTime() - other.getTime()) / 60000;
    if (row.venue === input.venue && row.field === input.field && minutes < slotDuration) return `${input.field} è già occupato in questa fascia oraria`;
    if (input.refereeName && row.refereeName && input.refereeName.toLowerCase() === row.refereeName.toLowerCase() && minutes < slotDuration) return `${input.refereeName} è già assegnato a un’altra gara`;
    if (key && weekendKey(row.startsAt) === key && [input.homeTeamId,input.awayTeamId].some(teamId => teamId === row.homeTeamId || teamId === row.awayTeamId)) return "Una delle squadre ha già un impegno nello stesso weekend";
  }
  return null;
}

async function rankedCompetitionTeams(db:ReturnType<typeof rawDb>,tournamentId:string,competition:any){
  return (await db.prepare("SELECT t.id,t.name,COUNT(m.id) AS played,COALESCE(SUM(CASE WHEN m.home_team_id=t.id THEN r.home_score ELSE r.away_score END),0) AS gf,COALESCE(SUM(CASE WHEN m.home_team_id=t.id THEN r.away_score ELSE r.home_score END),0) AS ga,COALESCE(SUM(CASE WHEN (m.home_team_id=t.id AND r.home_score>r.away_score) OR (m.away_team_id=t.id AND r.away_score>r.home_score) THEN 3 WHEN r.home_score=r.away_score THEN 1 ELSE 0 END),0) AS points FROM tournament_teams tt JOIN teams t ON t.id=tt.team_id LEFT JOIN competition_team_entries cte ON cte.competition_id=? AND cte.team_id=t.id LEFT JOIN matches m ON m.competition_id=? AND m.stage='qualification' AND (m.home_team_id=t.id OR m.away_team_id=t.id) AND m.status IN ('official','rectified') LEFT JOIN match_reports r ON r.match_id=m.id WHERE tt.tournament_id=? AND tt.status!='withdrawn' AND ((EXISTS (SELECT 1 FROM competition_team_entries x WHERE x.competition_id=?) AND cte.id IS NOT NULL AND cte.status!='withdrawn') OR (NOT EXISTS (SELECT 1 FROM competition_team_entries x WHERE x.competition_id=?) AND tt.category=? AND tt.division=?)) GROUP BY t.id,t.name ORDER BY points DESC,(gf-ga) DESC,gf DESC,t.name").bind(competition.id,competition.id,tournamentId,competition.id,competition.id,competition.category,competition.division).all<any>()).results;
}

async function availableCompetitionSlots(db:ReturnType<typeof rawDb>,tournamentId:string,competitionId:string){
  const [fields,config,last]=await Promise.all([
    db.prepare("SELECT venue_name AS venueName,field_name AS fieldName FROM tournament_fields WHERE tournament_id=? AND active=1 ORDER BY sort_order").bind(tournamentId).all<any>(),
    db.prepare("SELECT start_date AS startDate,end_date AS endDate,start_time AS startTime,end_time AS endTime,match_minutes AS matchMinutes,buffer_minutes AS bufferMinutes,active_days AS activeDays FROM tournament_configs WHERE tournament_id=?").bind(tournamentId).first<any>(),
    db.prepare("SELECT MAX(starts_at) AS startsAt FROM matches WHERE competition_id=?").bind(competitionId).first<any>(),
  ]);
  if(!fields.results.length||!config)return [];
  const minutes=(value:string)=>{const [h,m]=value.split(":").map(Number);return h*60+m},clock=(value:number)=>`${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`;
  const times:string[]=[];for(let value=minutes(config.startTime);value+Number(config.matchMinutes)<=minutes(config.endTime);value+=Math.max(5,Number(config.matchMinutes)+Number(config.bufferMinutes)))times.push(clock(value));
  const days:number[]=JSON.parse(config.activeDays||"[6,0]"),minimum=new Date(last?.startsAt||`${config.startDate}T00:00:00Z`),slots:{startsAt:string;venue:string;field:string}[]=[];
  for(let date=new Date(`${config.startDate}T12:00:00Z`);date<=new Date(`${config.endDate}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+1)){if(date.getTime()<=minimum.getTime()||!days.includes(date.getUTCDay()))continue;for(const time of times)for(const field of fields.results)slots.push({startsAt:`${date.toISOString().slice(0,10)}T${time}:00+02:00`,venue:field.venueName,field:field.fieldName})}
  return slots;
}

async function createBracketRound(db:ReturnType<typeof rawDb>,input:{tournamentId:string;competition:any;teams:string[];stage:string;round:number;roundName:string;now:string}){
  const slots=await availableCompetitionSlots(db,input.tournamentId,input.competition.id);let created=0;
  for(let index=0;index<input.teams.length/2;index++){
    const homeTeamId=input.teams[index],awayTeamId=input.teams[input.teams.length-1-index];let selected:any;
    for(const slot of slots){if(!await scheduleConflict(db,{tournamentId:input.tournamentId,startsAt:slot.startsAt,venue:slot.venue,field:slot.field,homeTeamId,awayTeamId})){selected=slot;break}}
    if(!selected)throw new Error("NO_BRACKET_SLOTS");
    await db.prepare("INSERT INTO matches (id,tournament_id,home_team_id,away_team_id,category,division,match_day,starts_at,venue,field,status,callups_json,competition_id,stage,round_name,bracket_round,bracket_tie_id,bracket_leg,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),input.tournamentId,homeTeamId,awayTeamId,input.competition.category,input.competition.division,input.round,selected.startsAt,selected.venue,selected.field,"scheduled",JSON.stringify({home:[],away:[]}),input.competition.id,input.stage,input.roundName,input.round,crypto.randomUUID(),1,input.now,input.now).run();created++;
  }
  return created;
}

function bracketDecisions(rows:any[]){
  const ties=new Map<string,any[]>();for(const match of rows){const key=match.tieId||match.id;ties.set(key,[...(ties.get(key)||[]),match])}
  const winners:string[]=[],losers:string[]=[];
  for(const games of ties.values()){
    const totals=new Map<string,number>();for(const game of games){totals.set(game.homeTeamId,(totals.get(game.homeTeamId)||0)+Number(game.homeScore||0));totals.set(game.awayTeamId,(totals.get(game.awayTeamId)||0)+Number(game.awayScore||0))}
    const teams=[...totals.keys()];let winner:string|undefined;if(teams.length!==2)throw new Error("INVALID_TIE");
    if(totals.get(teams[0])!==totals.get(teams[1]))winner=(totals.get(teams[0])||0)>(totals.get(teams[1])||0)?teams[0]:teams[1];else{const penalties=[...games].reverse().find(game=>game.homePenaltyScore!=null&&game.awayPenaltyScore!=null&&Number(game.homePenaltyScore)!==Number(game.awayPenaltyScore));if(penalties)winner=Number(penalties.homePenaltyScore)>Number(penalties.awayPenaltyScore)?penalties.homeTeamId:penalties.awayTeamId}
    if(!winner)throw new Error("TIE_NEEDS_PENALTIES");winners.push(winner);losers.push(teams.find(team=>team!==winner)!);
  }
  return {winners,losers};
}

const summerDemoRosters:Record<string,Array<[number,string,string,string]>>={
  "Tor Tre Teste":[[1,"Tommaso","Leoni","Portiere"],[12,"Edoardo","Riva","Portiere"],[2,"Riccardo","Morelli","Difensore"],[3,"Lorenzo","Valenti","Difensore"],[4,"Samuele","Costa","Difensore"],[5,"Gabriele","Serra","Difensore"],[6,"Andrea","Marini","Centrocampista"],[8,"Mattia","De Luca","Centrocampista"],[10,"Jacopo","Fabbri","Trequartista"],[7,"Filippo","Neri","Esterno"],[11,"Christian","Gallo","Esterno"],[9,"Leonardo","Mancini","Attaccante"],[13,"Alessio","Romano","Attaccante"],[14,"Davide","Fontana","Jolly"]],
  "Atletico Prenestino":[[1,"Nicolò","Barone","Portiere"],[12,"Pietro","Villa","Portiere"],[2,"Manuel","Santini","Difensore"],[3,"Federico","Rizzi","Difensore"],[4,"Giacomo","Monti","Difensore"],[5,"Cristian","Fiore","Difensore"],[6,"Daniele","Greco","Centrocampista"],[8,"Michele","Rossi","Centrocampista"],[10,"Flavio","Bruni","Trequartista"],[7,"Marco","Sanna","Esterno"],[11,"Emanuele","Conti","Esterno"],[9,"Alessandro","Ricci","Attaccante"],[13,"Gioele","Marchetti","Attaccante"],[14,"Diego","Ferri","Jolly"]],
  "Sporting EUR":[[1,"Simone","Caruso","Portiere"],[12,"Elia","Benedetti","Portiere"],[2,"Valerio","Martini","Difensore"],[3,"Giorgio","Rinaldi","Difensore"],[4,"Luca","Pellegrini","Difensore"],[5,"Damiano","Parisi","Difensore"],[6,"Francesco","Testa","Centrocampista"],[8,"Matteo","Grassi","Centrocampista"],[10,"Gabriel","Lombardi","Trequartista"],[7,"Mirko","Basile","Esterno"],[11,"Nathan","Colombo","Esterno"],[9,"Antonio","De Angelis","Attaccante"],[13,"Dario","Marino","Attaccante"],[14,"Raffaele","Pagano","Jolly"]],
  "Academy Tuscolana":[[1,"Salvatore","Esposito","Portiere"],[12,"Alberto","Ferrara","Portiere"],[2,"Gianmarco","D'Amico","Difensore"],[3,"Kevin","Gentile","Difensore"],[4,"Nicola","Messina","Difensore"],[5,"Ivan","Bellini","Difensore"],[6,"Gabriele","Coppola","Centrocampista"],[8,"Thomas","Palmieri","Centrocampista"],[10,"Manuel","Vitale","Trequartista"],[7,"Edoardo","Longo","Esterno"],[11,"Samuele","Orlando","Esterno"],[9,"Lorenzo","Gatti","Attaccante"],[13,"Riccardo","Leone","Attaccante"],[14,"Alessio","Amato","Jolly"]],
};
const summerDemoRosterByShortName:Record<string,string>={
  TTT:"Tor Tre Teste",
  AP:"Atletico Prenestino",
  SE:"Sporting EUR",
  AT:"Academy Tuscolana",
};

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { current, workspace, tournament } = await context(id);
    const db = rawDb();
    const [entered, directory, matchRows, settings, fieldRows, scheduleConfig, invites, referees, standings, errors, editorial, awards, nominations, awardCandidates, seasonOutcomes] =
      await Promise.all([
        db
          .prepare(
            "SELECT tt.id AS entryId,t.id,t.club_id AS clubId,t.name,t.short_name AS shortName,t.city,t.primary_color AS primaryColor,COALESCE(c.name,t.name) AS clubName,COALESCE(t.squad_name,tt.category) AS squadName,t.birth_year AS birthYear,t.coach_name AS coachName,tt.category,tt.division,tt.status,(SELECT COUNT(*) FROM players p WHERE p.team_id=t.id AND p.status='active') AS rosterCount FROM tournament_teams tt JOIN teams t ON t.id=tt.team_id LEFT JOIN clubs c ON c.id=t.club_id WHERE tt.tournament_id=? AND tt.status!='withdrawn' ORDER BY tt.category,tt.division,COALESCE(c.name,t.name),COALESCE(t.squad_name,'')",
          )
          .bind(id)
          .all(),
        db
          .prepare(
            "SELECT t.id,t.club_id AS clubId,t.name,t.short_name AS shortName,t.city,t.primary_color AS primaryColor,COALESCE(c.name,t.name) AS clubName,COALESCE(t.squad_name,'Squadra principale') AS squadName,t.birth_year AS birthYear,t.coach_name AS coachName FROM teams t LEFT JOIN clubs c ON c.id=t.club_id WHERE t.organization_id=? AND NOT EXISTS (SELECT 1 FROM tournament_teams tt WHERE tt.tournament_id=? AND tt.team_id=t.id AND tt.status!='withdrawn') ORDER BY COALESCE(c.name,t.name),COALESCE(t.birth_year,9999),COALESCE(t.squad_name,'')",
          )
          .bind(workspace.organizationId, id)
          .all(),
        db
          .prepare(
            "SELECT m.id,m.home_team_id AS homeTeamId,m.away_team_id AS awayTeamId,m.category,m.division,m.match_day AS matchDay,m.starts_at AS startsAt,m.venue,m.field,m.referee_name AS refereeName,m.status,m.callups_json AS callupsJson,m.competition_id AS competitionId,m.stage,m.round_name AS roundName,m.bracket_round AS bracketRound,m.bracket_tie_id AS bracketTieId,m.bracket_leg AS bracketLeg,c.name AS competitionName,h.name AS home,h.short_name AS homeShort,a.name AS away,a.short_name AS awayShort,r.home_score AS homeScore,r.away_score AS awayScore,r.home_penalty_score AS homePenaltyScore,r.away_penalty_score AS awayPenaltyScore FROM matches m JOIN teams h ON h.id=m.home_team_id JOIN teams a ON a.id=m.away_team_id LEFT JOIN competition_settings c ON c.id=m.competition_id LEFT JOIN match_reports r ON r.match_id=m.id WHERE m.tournament_id=? ORDER BY m.starts_at",
          )
          .bind(id)
          .all(),
        db
          .prepare(
            "SELECT cs.id,cs.category,cs.division,cs.max_teams AS maxTeams,cs.format,cs.finals,cs.enabled,cs.name,cs.kind,cs.finals_json AS finalsJson,COALESCE(NULLIF((SELECT GROUP_CONCAT(cte.team_id) FROM competition_team_entries cte WHERE cte.competition_id=cs.id AND cte.status!='withdrawn'),''),(SELECT GROUP_CONCAT(tt.team_id) FROM tournament_teams tt WHERE tt.tournament_id=cs.tournament_id AND tt.category=cs.category AND tt.division=cs.division AND tt.status!='withdrawn')) AS participantIdsCsv FROM competition_settings cs WHERE cs.tournament_id=? ORDER BY cs.category,cs.division,cs.name",
          )
          .bind(id)
          .all(),
        db
          .prepare(
            "SELECT id,venue_name AS venueName,address,field_name AS fieldName,field_number AS fieldNumber,active,sort_order AS sortOrder FROM tournament_fields WHERE tournament_id=? ORDER BY sort_order,venue_name,field_name",
          )
          .bind(id)
          .all(),
        db
          .prepare(
            "SELECT start_date AS startDate,end_date AS endDate,start_time AS startTime,end_time AS endTime,match_minutes AS matchMinutes,buffer_minutes AS bufferMinutes,match_fee_cents AS matchFeeCents,active_days AS activeDays FROM tournament_configs WHERE tournament_id=?",
          )
          .bind(id)
          .first(),
        db
          .prepare(
            "SELECT i.id,i.email,i.role,i.status,i.created_at AS createdAt,t.name AS teamName FROM invitations i LEFT JOIN teams t ON t.id=i.team_id WHERE i.tournament_id=? ORDER BY i.created_at DESC",
          )
          .bind(id)
          .all(),
        db
          .prepare(
            "SELECT DISTINCT COALESCE(u.full_name,u.email) AS name,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tournament_id=? AND m.role='REFEREE' AND m.status='active' UNION SELECT email AS name,email FROM invitations WHERE tournament_id=? AND role='REFEREE' AND status!='revoked' ORDER BY name",
          )
          .bind(id, id)
          .all(),
        db
          .prepare(
            "SELECT cs.id AS competitionId,cs.name AS competitionName,cs.category,cs.division,t.id,t.name,t.short_name AS shortName,COUNT(m.id) AS played,COALESCE(SUM(CASE WHEN m.home_team_id=t.id THEN r.home_score ELSE r.away_score END),0) AS gf,COALESCE(SUM(CASE WHEN m.home_team_id=t.id THEN r.away_score ELSE r.home_score END),0) AS ga,COALESCE(SUM(CASE WHEN (m.home_team_id=t.id AND r.home_score>r.away_score) OR (m.away_team_id=t.id AND r.away_score>r.home_score) THEN 3 WHEN r.home_score=r.away_score THEN 1 ELSE 0 END),0) AS points FROM competition_settings cs JOIN tournament_teams tt ON tt.tournament_id=cs.tournament_id JOIN teams t ON t.id=tt.team_id LEFT JOIN matches m ON m.competition_id=cs.id AND (m.home_team_id=t.id OR m.away_team_id=t.id) AND m.stage='qualification' AND m.status IN ('official','rectified') LEFT JOIN match_reports r ON r.match_id=m.id WHERE cs.tournament_id=? AND cs.enabled=1 AND tt.status!='withdrawn' AND ((EXISTS (SELECT 1 FROM competition_team_entries x WHERE x.competition_id=cs.id) AND EXISTS (SELECT 1 FROM competition_team_entries x WHERE x.competition_id=cs.id AND x.team_id=t.id AND x.status!='withdrawn')) OR (NOT EXISTS (SELECT 1 FROM competition_team_entries x WHERE x.competition_id=cs.id) AND tt.category=cs.category AND tt.division=cs.division)) GROUP BY cs.id,cs.name,cs.category,cs.division,t.id,t.name,t.short_name ORDER BY cs.category,cs.division,cs.name,points DESC,(gf-ga) DESC,gf DESC,t.name",
          )
          .bind(id)
          .all(),
        db
          .prepare(
            "SELECT e.id,e.subject,e.description,e.status,e.resolution,e.created_at AS createdAt,h.name||' – '||a.name AS matchName FROM error_reports e LEFT JOIN matches m ON m.id=e.match_id LEFT JOIN teams h ON h.id=m.home_team_id LEFT JOIN teams a ON a.id=m.away_team_id WHERE e.tournament_id=? ORDER BY CASE e.status WHEN 'open' THEN 1 WHEN 'reviewing' THEN 2 ELSE 3 END,e.created_at DESC",
          )
          .bind(id)
          .all(),
        db
          .prepare(
            "SELECT p.id,p.team_id AS teamId,p.match_id AS matchId,p.type,p.title,p.excerpt,p.body,p.media_key AS mediaKey,p.video_url AS videoUrl,p.status,p.published_at AS publishedAt,p.created_at AS createdAt,t.name AS teamName,h.name||' – '||a.name AS matchName FROM editorial_posts p LEFT JOIN teams t ON t.id=p.team_id LEFT JOIN matches m ON m.id=p.match_id LEFT JOIN teams h ON h.id=m.home_team_id LEFT JOIN teams a ON a.id=m.away_team_id WHERE p.tournament_id=? ORDER BY COALESCE(p.published_at,p.created_at) DESC",
          )
          .bind(id)
          .all(),
        db
          .prepare(
            "SELECT a.id,a.match_id AS matchId,a.team_id AS teamId,a.player_id AS playerId,a.scope,a.type,a.title,a.recipient_name AS recipientName,a.note,a.media_key AS mediaKey,a.status,a.awarded_at AS awardedAt,t.name AS teamName,p.first_name||' '||p.last_name AS playerName,h.name||' – '||v.name AS matchName FROM awards a LEFT JOIN teams t ON t.id=a.team_id LEFT JOIN players p ON p.id=a.player_id LEFT JOIN matches m ON m.id=a.match_id LEFT JOIN teams h ON h.id=m.home_team_id LEFT JOIN teams v ON v.id=m.away_team_id WHERE a.tournament_id=? ORDER BY a.awarded_at DESC",
          )
          .bind(id)
          .all(),
        db
          .prepare(
            "SELECT n.id,n.scope,n.award_type AS awardType,n.nominee_name AS nomineeName,n.motivation,n.evidence,n.status,n.created_at AS createdAt,t.name AS teamName,h.name||' – '||v.name AS matchName FROM award_nominations n LEFT JOIN teams t ON t.id=n.team_id LEFT JOIN matches m ON m.id=n.match_id LEFT JOIN teams h ON h.id=m.home_team_id LEFT JOIN teams v ON v.id=m.away_team_id WHERE n.tournament_id=? ORDER BY CASE n.status WHEN 'nominated' THEN 1 WHEN 'shortlisted' THEN 2 WHEN 'winner' THEN 3 ELSE 4 END,n.created_at DESC",
          )
          .bind(id)
          .all(),
        db
          .prepare(
            "SELECT DISTINCT p.id,p.team_id AS teamId,p.first_name AS firstName,p.last_name AS lastName,p.shirt_number AS shirtNumber,p.role,p.photo_key AS photoKey,t.name AS teamName,t.short_name AS teamShort FROM players p JOIN teams t ON t.id=p.team_id JOIN tournament_teams tt ON tt.team_id=p.team_id WHERE tt.tournament_id=? AND tt.status!='withdrawn' AND p.status='active' ORDER BY t.name,p.shirt_number,p.last_name",
          )
          .bind(id)
          .all(),
        db.prepare("SELECT so.id,so.competition_id AS competitionId,so.team_id AS teamId,so.outcome,so.position,so.source,so.note,so.decided_at AS decidedAt,t.name AS teamName,t.short_name AS shortName,cs.name AS competitionName,cs.category,cs.division FROM season_outcomes so JOIN teams t ON t.id=so.team_id JOIN competition_settings cs ON cs.id=so.competition_id WHERE so.tournament_id=? ORDER BY cs.category,cs.division,CASE so.outcome WHEN 'champion' THEN 1 WHEN 'promoted' THEN 2 WHEN 'safe' THEN 3 WHEN 'repechaged' THEN 4 WHEN 'relegated' THEN 5 ELSE 6 END,so.position,t.name").bind(id).all(),
      ]);
    const matches = matchRows.results.map((row: any) => ({
      ...row,
      tournamentName: tournament.name,
      tournamentEdition: tournament.edition,
      callups: row.callupsJson
        ? JSON.parse(row.callupsJson)
        : { home: [], away: [] },
      callupsJson: undefined,
    }));
    let visibleTeams = entered.results;
    let visibleMatches = matches;
    let managedTeamIds: string[] = [];
    if (workspace.role === "CLUB_MANAGER") {
      const managed = await db
        .prepare(
          "SELECT t.id FROM teams t LEFT JOIN clubs c ON c.id=t.club_id WHERE t.organization_id=? AND COALESCE(c.club_manager_user_id,t.club_manager_user_id)=?",
        )
        .bind(workspace.organizationId, current.userId)
        .all<{ id: string }>();
      managedTeamIds = managed.results.map((row) => row.id);
      const ids = new Set(managedTeamIds);
      visibleTeams = entered.results.filter((row: any) => ids.has(row.id));
      visibleMatches = matches.filter(
        (row: any) => ids.has(row.homeTeamId) || ids.has(row.awayTeamId),
      );
    } else if (workspace.role === "REFEREE") {
      const identities = [current.displayName, current.email].filter(Boolean).map(value => String(value).trim().toLowerCase());
      visibleMatches = matches.filter((row: any) => identities.includes(String(row.refereeName || "").trim().toLowerCase()));
    }
    const visibleEditorial=workspace.role==="CLUB_MANAGER"?editorial.results.filter((post:any)=>post.teamId&&managedTeamIds.includes(post.teamId)):editorial.results;
    return Response.json({
      tournament,
      teams: visibleTeams,
      directory: workspace.role === "SUPER_ADMIN" ? directory.results : [],
      matches: visibleMatches,
      settings: settings.results.map((row:any)=>{let finalsConfig={mode:"none",qualifiers:0,semifinalLegs:1,finalLegs:1,thirdPlace:false,playoutEnabled:false,playoutTeams:4,promotions:0,relegations:0,promotionTargetDivision:"",relegationTargetDivision:""};try{finalsConfig={...finalsConfig,...JSON.parse(row.finalsJson||"{}")} }catch{}return {...row,finalsConfig,participantIds:String(row.participantIdsCsv||"").split(",").filter(Boolean),finalsJson:undefined,participantIdsCsv:undefined}}),
      fields: fieldRows.results.length ? fieldRows.results : Array.from({length: Number((tournament as any).fieldCount || 0)},(_,index)=>({id:`legacy-${index}`,venueName:"Future Arena",address:"",fieldName:`Campo ${index+1}`,fieldNumber:String(index+1),active:1,sortOrder:index})),
      scheduleConfig: scheduleConfig || {
        startDate: "2026-10-01",
        endDate: "2027-05-31",
        startTime: "08:30",
        endTime: "13:30",
        matchMinutes: 30,
        bufferMinutes: 10,
        matchFeeCents: 800,
        activeDays: "[6,0]",
      },
      invitations: workspace.role === "SUPER_ADMIN" ? invites.results : [],
      referees: referees.results,
      standings: standings.results,
      errorReports: errors.results,
      editorialPosts: visibleEditorial,
      awards: awards.results,
      nominations: nominations.results,
      awardCandidates: awardCandidates.results,
      seasonOutcomes: seasonOutcomes.results,
      viewerRole: workspace.role,
      viewerName: current.displayName || current.email,
      managedTeamIds,
      demoRostersAvailable: workspace.role==="SUPER_ADMIN" && String(tournament.name).toLowerCase()==="summer cup" && String(tournament.status)==="draft",
      demoRostersReady: Object.keys(summerDemoRosterByShortName).every(shortName=>entered.results.some((team:any)=>team.shortName===shortName&&String(team.category)==="2014"&&Number(team.rosterCount)>=14)),
    });
  } catch (error) {
    return responseError(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { current, workspace, tournament } = await context(id);
    const role = workspace.role;
    const body = (await request.json()) as any;
    const db = rawDb(),
      now = new Date().toISOString();
    const adminOnly = [
      "bulk_link",
      "create",
      "remove_team",
      "save_structure",
      "invite_user",
      "publish_tournament",
      "unpublish_tournament",
      "close_season",
      "reopen_season",
      "override_outcome",
      "create_next_season",
      "seed_summer_demo_rosters",
    ];
    if (adminOnly.includes(body.action) && role !== "SUPER_ADMIN")
      throw new Error("FORBIDDEN");
    if(body.action==="seed_summer_demo_rosters"){
      if(String(tournament.name).toLowerCase()!=="summer cup"||String(tournament.status)!=="draft")return Response.json({error:"Le rose demo sono disponibili soltanto nella Summer Cup in bozza"},{status:409});
      const shortNames=Object.keys(summerDemoRosterByShortName),placeholders=shortNames.map(()=>"?").join(","),teamRows=await db.prepare(`SELECT DISTINCT t.id,t.name,t.short_name AS shortName FROM teams t JOIN tournament_teams tt ON tt.team_id=t.id WHERE tt.tournament_id=? AND tt.status!='withdrawn' AND tt.category='2014' AND t.short_name IN (${placeholders})`).bind(id,...shortNames).all<{id:string;name:string;shortName:string}>();
      if(teamRows.results.length!==shortNames.length)return Response.json({error:"Mancano una o più squadre demo 2014 nella Summer Cup"},{status:409});
      const teamIds=teamRows.results.map(team=>team.id);
      for(const team of teamRows.results){const roster=summerDemoRosters[summerDemoRosterByShortName[team.shortName]];await db.batch(roster.map(([shirtNumber,firstName,lastName,playerRole])=>db.prepare("INSERT OR IGNORE INTO players (id,team_id,first_name,last_name,birth_year,shirt_number,role,status,profile_visibility,media_consent,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(`summer-demo-${team.id.slice(-12)}-${shirtNumber}`,team.id,firstName,lastName,2014,shirtNumber,playerRole,"active","private",0,now,now)));}
      const match=await db.prepare(`SELECT id,home_team_id AS homeTeamId,away_team_id AS awayTeamId FROM matches WHERE tournament_id=? AND home_team_id IN (${teamIds.map(()=>"?").join(",")}) AND away_team_id IN (${teamIds.map(()=>"?").join(",")}) ORDER BY match_day,starts_at LIMIT 1`).bind(id,...teamIds,...teamIds).first<{id:string;homeTeamId:string;awayTeamId:string}>();
      if(!match)return Response.json({error:"Nessuna partita disponibile tra le quattro squadre"},{status:409});
      const matchPlayers=await db.prepare("SELECT id,team_id AS teamId,shirt_number AS shirtNumber FROM players WHERE team_id IN (?,?) AND id LIKE 'summer-demo-%' ORDER BY team_id,shirt_number").bind(match.homeTeamId,match.awayTeamId).all<{id:string;teamId:string;shirtNumber:number}>();
      await db.batch(matchPlayers.results.map(player=>db.prepare("INSERT INTO match_callups (id,match_id,team_id,player_id,status,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(match_id,player_id) DO UPDATE SET status=excluded.status").bind(crypto.randomUUID(),match.id,player.teamId,player.id,Number(player.shirtNumber)<=11&&Number(player.shirtNumber)!==12?"starter":"present",now)));
      await appendAudit({tournamentId:id,userId:current.userId,role,action:"summer_cup.demo_rosters_created",entityType:"tournament",entityId:id,payload:{teams:teamRows.results.map(team=>team.name),players:56,matchId:match.id}});
      return Response.json({ok:true,teams:teamRows.results.map(team=>team.name),players:56,matchId:match.id},{status:201});
    }
    if (
      ["generate_calendar", "create_match", "generate_final_phase", "advance_final_phase", "generate_playout", "advance_playout"].includes(body.action) &&
      !["SUPER_ADMIN", "TOURNAMENT_DIRECTOR"].includes(role)
    )
      throw new Error("FORBIDDEN");
    const editorialActions = [
      "create_editorial",
      "update_editorial",
      "publish_editorial",
      "schedule_editorial",
      "unpublish_editorial",
      "delete_editorial",
      "create_match_story",
    ];
    const awardActions = [
      "create_award",
      "delete_award",
      "create_nomination",
      "review_nomination",
    ];
    if (
      editorialActions.includes(body.action) &&
      !["SUPER_ADMIN", "TOURNAMENT_DIRECTOR", "SECRETARIAT", "CLUB_MANAGER"].includes(role)
    )
      throw new Error("FORBIDDEN");
    if (awardActions.includes(body.action) && !["SUPER_ADMIN", "TOURNAMENT_DIRECTOR", "SECRETARIAT"].includes(role)) throw new Error("FORBIDDEN");
    let editorialTeamIds:string[]=[];
    if(role==="CLUB_MANAGER"&&editorialActions.includes(body.action)){
      const managed=await db.prepare("SELECT t.id FROM teams t LEFT JOIN clubs c ON c.id=t.club_id WHERE t.organization_id=? AND COALESCE(c.club_manager_user_id,t.club_manager_user_id)=?").bind(workspace.organizationId,current.userId).all<{id:string}>();
      editorialTeamIds=managed.results.map(team=>team.id);
      if(!editorialTeamIds.length)throw new Error("FORBIDDEN");
    }
    const editorialAccess=async(postId:string)=>{
      const post=await db.prepare("SELECT id,team_id AS teamId FROM editorial_posts WHERE id=? AND tournament_id=?").bind(postId,id).first<{id:string;teamId:string|null}>();
      if(!post||role==="CLUB_MANAGER"&&(!post.teamId||!editorialTeamIds.includes(post.teamId)))throw new Error("FORBIDDEN");
      return post;
    };
    if (body.action === "publish_tournament") {
      const readiness=await Promise.all([
        db.prepare("SELECT COUNT(*) AS total FROM competition_settings WHERE tournament_id=? AND enabled=1").bind(id).first<{total:number}>(),
        db.prepare("SELECT COUNT(*) AS total FROM tournament_fields WHERE tournament_id=? AND active=1").bind(id).first<{total:number}>(),
      ]);
      if(!Number(readiness[0]?.total)||!Number(readiness[1]?.total))return Response.json({error:"Configura almeno una competizione e un campo prima di pubblicare"},{status:409});
      await db.prepare("UPDATE tournaments SET status=CASE WHEN status='draft' THEN 'active' ELSE status END,is_public=1,published_at=COALESCE(published_at,?),updated_at=? WHERE id=?").bind(now,now,id).run();
      await appendAudit({tournamentId:id,userId:current.userId,role,action:"tournament.published",entityType:"tournament",entityId:id});
      return Response.json({ok:true});
    }
    if (body.action === "unpublish_tournament") {
      await db.prepare("UPDATE tournaments SET is_public=0,updated_at=? WHERE id=?").bind(now,id).run();
      await appendAudit({tournamentId:id,userId:current.userId,role,action:"tournament.unpublished",entityType:"tournament",entityId:id});
      return Response.json({ok:true});
    }
    if (body.action === "create_editorial") {
      const title = String(body.title || "").trim();
      const type = ["news", "interview", "video", "gallery"].includes(body.type)
        ? body.type
        : "news";
      if (title.length < 4)
        return Response.json({ error: "Inserisci un titolo valido" }, { status: 400 });
      const teamId=String(body.teamId||"")||null,matchId=String(body.matchId||"")||null;
      if(role==="CLUB_MANAGER"&&(!teamId||!editorialTeamIds.includes(teamId)))throw new Error("FORBIDDEN");
      if(matchId){const linked=await db.prepare("SELECT id,home_team_id AS homeTeamId,away_team_id AS awayTeamId FROM matches WHERE id=? AND tournament_id=?").bind(matchId,id).first<any>();if(!linked||teamId&&![linked.homeTeamId,linked.awayTeamId].includes(teamId))return Response.json({error:"La partita selezionata non appartiene alla società"},{status:400})}
      const postId = crypto.randomUUID();
      const status = body.status === "published" ? "published" : "draft";
      const requestedAt=String(body.publishedAt||"");
      const publishedAt=status==="published"?(requestedAt&&new Date(requestedAt)>new Date(now)?new Date(requestedAt).toISOString():now):null;
      await db
        .prepare(
          "INSERT INTO editorial_posts (id,tournament_id,team_id,match_id,type,title,excerpt,body,media_key,video_url,status,published_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(postId,id,teamId,matchId,type,title,String(body.excerpt||"").slice(0,800),String(body.body||"").slice(0,12000),body.mediaKey||null,String(body.videoUrl||"").slice(0,1000),status,publishedAt,current.userId,now,now)
        .run();
      await appendAudit({ tournamentId:id,userId:current.userId,role,action:"editorial.created",entityType:"editorial_post",entityId:postId,payload:{type,status,publishedAt} });
      return Response.json({ ok:true,id:postId },{status:201});
    }
    if(body.action==="update_editorial"){
      const postId=String(body.postId||"");await editorialAccess(postId);
      const title=String(body.title||"").trim(),type=["news","interview","video","gallery"].includes(body.type)?body.type:"news",teamId=String(body.teamId||"")||null,matchId=String(body.matchId||"")||null;
      if(title.length<4)return Response.json({error:"Inserisci un titolo valido"},{status:400});
      if(role==="CLUB_MANAGER"&&(!teamId||!editorialTeamIds.includes(teamId)))throw new Error("FORBIDDEN");
      if(matchId){const linked=await db.prepare("SELECT home_team_id AS homeTeamId,away_team_id AS awayTeamId FROM matches WHERE id=? AND tournament_id=?").bind(matchId,id).first<any>();if(!linked||teamId&&![linked.homeTeamId,linked.awayTeamId].includes(teamId))return Response.json({error:"La partita selezionata non appartiene alla società"},{status:400})}
      const workflow=["draft","published","scheduled"].includes(body.workflow)?String(body.workflow):"draft";let publishedAt:string|null=null;
      if(workflow==="published")publishedAt=now;
      if(workflow==="scheduled"){const publishDate=new Date(String(body.publishedAt||""));if(Number.isNaN(publishDate.getTime())||publishDate<=new Date(now))return Response.json({error:"Scegli una data futura per la pubblicazione"},{status:400});publishedAt=publishDate.toISOString()}
      await db.prepare("UPDATE editorial_posts SET team_id=?,match_id=?,type=?,title=?,excerpt=?,body=?,media_key=?,video_url=?,status=?,published_at=?,updated_at=? WHERE id=? AND tournament_id=?").bind(teamId,matchId,type,title,String(body.excerpt||"").slice(0,800),String(body.body||"").slice(0,12000),body.mediaKey||null,String(body.videoUrl||"").slice(0,1000),workflow==="draft"?"draft":"published",publishedAt,now,postId,id).run();
      await appendAudit({tournamentId:id,userId:current.userId,role,action:"editorial.updated",entityType:"editorial_post",entityId:postId,payload:{workflow,publishedAt}});
      return Response.json({ok:true});
    }
    if (body.action === "publish_editorial") {
      await editorialAccess(String(body.postId||""));
      await db.prepare("UPDATE editorial_posts SET status='published',published_at=?,updated_at=? WHERE id=? AND tournament_id=?").bind(now,now,String(body.postId||""),id).run();
      await appendAudit({ tournamentId:id,userId:current.userId,role,action:"editorial.published",entityType:"editorial_post",entityId:String(body.postId||"") });
      return Response.json({ok:true});
    }
    if(body.action==="schedule_editorial"){
      const postId=String(body.postId||"");await editorialAccess(postId);const publishDate=new Date(String(body.publishedAt||""));
      if(Number.isNaN(publishDate.getTime())||publishDate<=new Date(now))return Response.json({error:"Scegli una data futura per la pubblicazione"},{status:400});
      await db.prepare("UPDATE editorial_posts SET status='published',published_at=?,updated_at=? WHERE id=? AND tournament_id=?").bind(publishDate.toISOString(),now,postId,id).run();
      await appendAudit({tournamentId:id,userId:current.userId,role,action:"editorial.scheduled",entityType:"editorial_post",entityId:postId,payload:{publishedAt:publishDate.toISOString()}});
      return Response.json({ok:true});
    }
    if(body.action==="unpublish_editorial"){
      const postId=String(body.postId||"");await editorialAccess(postId);
      await db.prepare("UPDATE editorial_posts SET status='draft',published_at=NULL,updated_at=? WHERE id=? AND tournament_id=?").bind(now,postId,id).run();
      await appendAudit({tournamentId:id,userId:current.userId,role,action:"editorial.unpublished",entityType:"editorial_post",entityId:postId});
      return Response.json({ok:true});
    }
    if(body.action==="create_match_story"){
      const matchId=String(body.matchId||""),teamId=String(body.teamId||"")||null;
      const match=await db.prepare("SELECT m.id,m.match_day AS matchDay,m.category,m.division,m.status,h.name AS home,a.name AS away,r.home_score AS homeScore,r.away_score AS awayScore FROM matches m JOIN teams h ON h.id=m.home_team_id JOIN teams a ON a.id=m.away_team_id JOIN match_reports r ON r.match_id=m.id WHERE m.id=? AND m.tournament_id=? AND m.status IN ('official','rectified')").bind(matchId,id).first<any>();
      if(!match)return Response.json({error:"Seleziona una partita con risultato ufficiale"},{status:409});
      if(role==="CLUB_MANAGER"&&(!teamId||!editorialTeamIds.includes(teamId)))throw new Error("FORBIDDEN");
      const existing=await db.prepare("SELECT id FROM editorial_posts WHERE tournament_id=? AND match_id=? AND title LIKE 'Match story:%' LIMIT 1").bind(id,matchId).first();if(existing)return Response.json({error:"La bozza automatica di questa partita esiste già"},{status:409});
      const mvp=await db.prepare("SELECT CASE WHEN p.profile_visibility='public' AND p.media_consent=1 THEN COALESCE(p.public_name,p.first_name||' '||substr(p.last_name,1,1)||'.') ELSE NULL END AS playerName,t.name AS teamName,mr.final_rating_tenths AS rating FROM match_player_ratings mr JOIN players p ON p.id=mr.player_id JOIN teams t ON t.id=mr.team_id WHERE mr.match_id=? ORDER BY CASE WHEN mr.modifiers_json LIKE '%\"mvp\"%' THEN 0 ELSE 1 END,mr.final_rating_tenths DESC LIMIT 1").bind(matchId).first<any>();
      const title=`Match story: ${match.home} ${match.homeScore}–${match.awayScore} ${match.away}`,excerpt=`Giornata ${match.matchDay} · ${match.category} ${match.division}. Risultato e protagonisti della gara.`,body=`${match.home} e ${match.away} hanno chiuso la gara sul ${match.homeScore}–${match.awayScore}.\n\n${mvp?.playerName?`Protagonista: ${mvp.playerName} (${mvp.teamName}), fantasy rating ${(Number(mvp.rating||60)/10).toFixed(1).replace('.',',')}.\n\n`:""}Bozza generata dai dati ufficiali del tabellino. Completa il racconto e verifica nomi, immagini e consensi prima della pubblicazione.`;
      const postId=crypto.randomUUID();await db.prepare("INSERT INTO editorial_posts (id,tournament_id,team_id,match_id,type,title,excerpt,body,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?, 'draft',?,?,?)").bind(postId,id,teamId,matchId,"news",title,excerpt,body,current.userId,now,now).run();
      await appendAudit({tournamentId:id,userId:current.userId,role,action:"editorial.match_story_created",entityType:"editorial_post",entityId:postId,payload:{matchId}});
      return Response.json({ok:true,id:postId},{status:201});
    }
    if (body.action === "delete_editorial") {
      await editorialAccess(String(body.postId||""));
      await db.prepare("DELETE FROM editorial_posts WHERE id=? AND tournament_id=?").bind(String(body.postId||""),id).run();
      await appendAudit({ tournamentId:id,userId:current.userId,role,action:"editorial.deleted",entityType:"editorial_post",entityId:String(body.postId||"") });
      return Response.json({ok:true});
    }
    if (body.action === "create_award") {
      const title=String(body.title||"").trim();
      const scope=["match","team","month","tournament"].includes(body.scope)?body.scope:"match";
      const playerId=String(body.playerId||"")||null;
      let teamId=String(body.teamId||"")||null;
      const matchId=String(body.matchId||"")||null;
      let recipientName=String(body.recipientName||"").trim();
      if(matchId){const validMatch=await db.prepare("SELECT home_team_id AS homeTeamId,away_team_id AS awayTeamId FROM matches WHERE id=? AND tournament_id=?").bind(matchId,id).first<any>();if(!validMatch)return Response.json({error:"Partita non valida"},{status:400});if(teamId&&![validMatch.homeTeamId,validMatch.awayTeamId].includes(teamId))return Response.json({error:"La squadra non partecipa alla partita selezionata"},{status:400})}
      if(playerId){const validPlayer=await db.prepare("SELECT p.team_id AS teamId,p.first_name||' '||p.last_name AS playerName FROM players p JOIN tournament_teams tt ON tt.team_id=p.team_id WHERE p.id=? AND tt.tournament_id=? AND tt.status!='withdrawn' AND p.status='active' LIMIT 1").bind(playerId,id).first<any>();if(!validPlayer)return Response.json({error:"Atleta non valido"},{status:400});teamId=validPlayer.teamId;recipientName=validPlayer.playerName;if(matchId){const validForMatch=await db.prepare("SELECT id FROM matches WHERE id=? AND tournament_id=? AND (home_team_id=? OR away_team_id=?)").bind(matchId,id,teamId,teamId).first();if(!validForMatch)return Response.json({error:"L’atleta non appartiene a una squadra della partita"},{status:400})}}
      if(teamId){const validTeam=await db.prepare("SELECT t.name FROM teams t JOIN tournament_teams tt ON tt.team_id=t.id WHERE t.id=? AND tt.tournament_id=? AND tt.status!='withdrawn' LIMIT 1").bind(teamId,id).first<{name:string}>();if(!validTeam)return Response.json({error:"Squadra non valida"},{status:400});if(body.recipientType==="team")recipientName=validTeam.name}
      if(title.length<3||recipientName.length<2)return Response.json({error:"Completa premio e destinatario"},{status:400});
      const awardId=crypto.randomUUID();
      const awardType=String(body.type||"MVP");
      if(matchId&&awardType==="MVP"){const existingMvp=await db.prepare("SELECT id FROM awards WHERE tournament_id=? AND match_id=? AND type='MVP' AND status='published' LIMIT 1").bind(id,matchId).first();if(existingMvp)return Response.json({error:"Questa partita ha già un MVP: elimina o rettifica il premio esistente"},{status:409})}
      await db.prepare("INSERT INTO awards (id,tournament_id,match_id,team_id,player_id,scope,type,title,recipient_name,note,media_key,status,awarded_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(awardId,id,matchId,teamId,playerId,scope,awardType,title,recipientName,String(body.note||""),body.mediaKey||null,"published",String(body.awardedAt||now),current.userId,now,now).run();
      if(playerId&&awardType==="MVP")await db.prepare("INSERT INTO player_tournament_stats (id,player_id,tournament_id,appearances,goals,assists,clean_sheets,mvp_awards,yellow_cards,red_cards,minutes_played,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(player_id,tournament_id) DO UPDATE SET mvp_awards=mvp_awards+1,updated_at=excluded.updated_at").bind(crypto.randomUUID(),playerId,id,0,0,0,0,1,0,0,0,now).run();
      await appendAudit({tournamentId:id,userId:current.userId,role,action:"award.created",entityType:"award",entityId:awardId,payload:{scope,type:body.type,playerId,teamId,matchId}});
      return Response.json({ok:true,id:awardId},{status:201});
    }
    if (body.action === "create_nomination") {
      const nomineeName=String(body.nomineeName||"").trim(),motivation=String(body.motivation||"").trim();
      const scope=["match","team","month","tournament"].includes(body.scope)?body.scope:"match";
      if(nomineeName.length<2||motivation.length<5)return Response.json({error:"Inserisci candidato e motivazione"},{status:400});
      const nominationId=crypto.randomUUID();
      await db.prepare("INSERT INTO award_nominations (id,tournament_id,match_id,team_id,player_id,scope,award_type,nominee_name,motivation,evidence,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(nominationId,id,body.matchId||null,body.teamId||null,body.playerId||null,scope,String(body.awardType||"MVP"),nomineeName,motivation,String(body.evidence||""),"nominated",current.userId,now,now).run();
      await appendAudit({tournamentId:id,userId:current.userId,role,action:"award.nomination_created",entityType:"award_nomination",entityId:nominationId,payload:{scope,awardType:body.awardType}});
      return Response.json({ok:true,id:nominationId},{status:201});
    }
    if (body.action === "review_nomination") {
      const status=["shortlisted","winner","rejected"].includes(body.status)?body.status:null;
      if(!status)return Response.json({error:"Stato candidatura non valido"},{status:400});
      const nomination=await db.prepare("SELECT * FROM award_nominations WHERE id=? AND tournament_id=?").bind(String(body.nominationId||""),id).first<any>();
      if(!nomination)return Response.json({error:"Candidatura non trovata"},{status:404});
      await db.prepare("UPDATE award_nominations SET status=?,reviewed_by=?,updated_at=? WHERE id=?").bind(status,current.userId,now,nomination.id).run();
      if(status==="winner"){
        const existing=await db.prepare("SELECT id FROM awards WHERE tournament_id=? AND scope=? AND type=? AND recipient_name=? AND awarded_at>=?").bind(id,nomination.scope,nomination.award_type,nomination.nominee_name,nomination.created_at).first();
        if(!existing)await db.prepare("INSERT INTO awards (id,tournament_id,match_id,team_id,player_id,scope,type,title,recipient_name,note,status,awarded_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),id,nomination.match_id,nomination.team_id,nomination.player_id,nomination.scope,nomination.award_type,nomination.award_type,nomination.nominee_name,nomination.motivation,"published",now,current.userId,now,now).run();
      }
      await appendAudit({tournamentId:id,userId:current.userId,role,action:`award.nomination_${status}`,entityType:"award_nomination",entityId:nomination.id});
      return Response.json({ok:true});
    }
    if (body.action === "delete_award") {
      const awardId=String(body.awardId||"");
      const removed=await db.prepare("SELECT player_id AS playerId,type FROM awards WHERE id=? AND tournament_id=?").bind(awardId,id).first<any>();
      await db.prepare("DELETE FROM awards WHERE id=? AND tournament_id=?").bind(awardId,id).run();
      if(removed?.playerId&&removed.type==="MVP")await db.prepare("UPDATE player_tournament_stats SET mvp_awards=MAX(0,mvp_awards-1),updated_at=? WHERE player_id=? AND tournament_id=?").bind(now,removed.playerId,id).run();
      await appendAudit({tournamentId:id,userId:current.userId,role,action:"award.deleted",entityType:"award",entityId:awardId});
      return Response.json({ok:true});
    }
    if (body.action === "bulk_link") {
      const teamIds = Array.isArray(body.teamIds)
          ? body.teamIds.filter((v: unknown) => typeof v === "string")
          : [],
        category = String(body.category || "").trim(),
        division = String(body.division || "").trim();
      if (!teamIds.length || !category || !division)
        return Response.json(
          { error: "Seleziona almeno una squadra, categoria e serie" },
          { status: 400 },
        );
      const valid = await db
        .prepare(
          `SELECT id FROM teams WHERE organization_id=? AND id IN (${teamIds.map(() => "?").join(",")})`,
        )
        .bind(workspace.organizationId, ...teamIds)
        .all();
      if (valid.results.length !== teamIds.length)
        return Response.json(
          { error: "Una squadra selezionata non è valida" },
          { status: 400 },
        );
      for (const teamId of teamIds)
        await db
          .prepare(
            "INSERT INTO tournament_teams (id,tournament_id,team_id,category,division,status,created_at) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(
            crypto.randomUUID(),
            id,
            teamId,
            category,
            division,
            "invited",
            now,
          )
          .run();
      await appendAudit({
        tournamentId: id,
        userId: current.userId,
        role,
        action: "teams.invited",
        entityType: "tournament_team",
        entityId: id,
        payload: { teamIds, category, division },
      });
      return Response.json(
        { ok: true, count: teamIds.length },
        { status: 201 },
      );
    }
    if (body.action === "create") {
      const name = String(body.name || "").trim(),
        squadName = String(body.squadName || body.category || "Squadra principale").trim(),
        birthYear = body.birthYear ? Number(body.birthYear) : Number.parseInt(String(body.category||""),10)||null,
        category = String(body.category || "").trim(),
        division = String(body.division || "").trim();
      if (name.length < 3 || !category || !division)
        return Response.json(
          { error: "Inserisci nome, categoria e serie" },
          { status: 400 },
        );
      const clubId = crypto.randomUUID(), teamId = crypto.randomUUID(),
        shortName =
          String(body.shortName || "")
            .trim()
            .toUpperCase() ||
          name
            .split(/\s+/)
            .map((v: string) => v[0])
            .join("")
            .slice(0, 3)
            .toUpperCase();
      const displayName=squadName&&squadName!=="Squadra principale"?`${name} ${squadName}`:name;
      await db.batch([
        db.prepare("INSERT INTO clubs (id,organization_id,name,short_name,city,primary_color,secondary_color,club_manager_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(clubId,workspace.organizationId,name,shortName,String(body.city||"Roma"),"#1778ff","#ffffff",current.userId,now,now),
        db
          .prepare(
            "INSERT INTO teams (id,organization_id,club_id,squad_name,birth_year,name,short_name,city,primary_color,club_manager_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            teamId,
            workspace.organizationId,
            clubId,
            squadName,
            birthYear,
            displayName,
            shortName,
            String(body.city || "Roma"),
            "#1778ff",
            current.userId,
            now,
            now,
          ),
        db
          .prepare(
            "INSERT INTO tournament_teams (id,tournament_id,team_id,category,division,status,created_at) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(
            crypto.randomUUID(),
            id,
            teamId,
            category,
            division,
            "invited",
            now,
          ),
      ]);
      await appendAudit({
        tournamentId: id,
        userId: current.userId,
        role,
        action: "team.created_and_invited",
        entityType: "team",
        entityId: teamId,
        payload: { clubId, name, squadName, birthYear, category, division },
      });
      return Response.json({ ok: true }, { status: 201 });
    }
    if (body.action === "remove_team") {
      await db
        .prepare(
          "UPDATE tournament_teams SET status='withdrawn' WHERE id=? AND tournament_id=?",
        )
        .bind(body.entryId, id)
        .run();
      await appendAudit({
        tournamentId: id,
        userId: current.userId,
        role,
        action: "team.removed",
        entityType: "tournament_team",
        entityId: String(body.entryId),
      });
      return Response.json({ ok: true });
    }
    if (body.action === "save_structure") {
      const rows = Array.isArray(body.settings) ? body.settings : [];
      const fields = Array.isArray(body.fields) ? body.fields : [];
      const config = body.scheduleConfig || {};
      if (!rows.length)
        return Response.json({ error: "Inserisci almeno una categoria" }, { status: 400 });
      if (!fields.length)
        return Response.json({ error: "Inserisci almeno un campo" }, { status: 400 });
      if (rows.some((row:any)=>!String(row.category||"").trim()||!String(row.division||"").trim()) || fields.some((row:any)=>!String(row.venueName||"").trim()||!String(row.fieldName||"").trim()))
        return Response.json({ error: "Completa nomi di categorie, sedi e campi" }, { status: 400 });
      await db
        .prepare("UPDATE competition_settings SET enabled=0,updated_at=? WHERE tournament_id=?")
        .bind(now,id)
        .run();
      for (const row of rows) {
        const competitionId=row.id||crypto.randomUUID();
        await db
          .prepare(
            "INSERT INTO competition_settings (id,tournament_id,category,division,max_teams,format,finals,enabled,name,kind,finals_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET category=excluded.category,division=excluded.division,max_teams=excluded.max_teams,format=excluded.format,finals=excluded.finals,enabled=excluded.enabled,name=excluded.name,kind=excluded.kind,finals_json=excluded.finals_json,updated_at=excluded.updated_at",
          )
          .bind(
            competitionId,
            id,
            String(row.category || "Categoria").trim(),
            String(row.division || "Girone unico").trim(),
            Math.max(2, Math.min(200, Number(row.maxTeams) || 2)),
            String(row.format || "Girone unico · sola andata"),
            String(row.finals || "Nessuna fase finale"),
            row.enabled === false ? 0 : 1,
            String(row.name||"Campionato").trim(),
            ["league","knockout","league_knockout"].includes(row.kind)?row.kind:"league",
            JSON.stringify(row.finalsConfig||{mode:"none",qualifiers:0,semifinalLegs:1,finalLegs:1,thirdPlace:false,playoutEnabled:false,playoutTeams:4,promotions:0,relegations:0,promotionTargetDivision:"",relegationTargetDivision:""}),
            now,
            now,
          )
          .run();
        if(Array.isArray(row.participantIds)){
          await db.prepare("DELETE FROM competition_team_entries WHERE competition_id=?").bind(competitionId).run();
          for(const [seed,teamId] of [...new Set(row.participantIds.map((value:unknown)=>String(value)))].entries())
            await db.prepare("INSERT INTO competition_team_entries (id,competition_id,team_id,seed,status,source,created_at) SELECT ?,?,?,?,'active','manual',? WHERE EXISTS (SELECT 1 FROM tournament_teams WHERE tournament_id=? AND team_id=? AND status!='withdrawn')")
              .bind(crypto.randomUUID(),competitionId,teamId,seed+1,now,id,teamId).run();
        }
      }
      await db.prepare("DELETE FROM tournament_fields WHERE tournament_id=?").bind(id).run();
      for (const [index, row] of fields.entries())
        await db.prepare("INSERT INTO tournament_fields (id,tournament_id,venue_name,address,field_name,field_number,active,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(),id,String(row.venueName||"Sede").trim(),String(row.address||"").trim()||null,String(row.fieldName||`Campo ${index+1}`).trim(),String(row.fieldNumber||"").trim()||null,row.active===false?0:1,index,now,now).run();
      const startDate=String(config.startDate||"2026-10-01"),endDate=String(config.endDate||"2027-05-31"),startTime=String(config.startTime||"08:30"),endTime=String(config.endTime||"13:30");
      const matchMinutes=Math.max(5,Math.min(180,Number(config.matchMinutes)||30)),bufferMinutes=Math.max(0,Math.min(120,Number(config.bufferMinutes)||0)),matchFeeCents=Math.max(0,Math.min(100000,Math.round(Number(config.matchFeeCents)||0)));
      const selectedDays=Array.isArray(config.activeDays)?config.activeDays:[6,0];
      if(!selectedDays.length||startDate>endDate||startTime>=endTime)return Response.json({error:"Controlla periodo, fascia oraria e giorni disponibili"},{status:400});
      const activeDays=JSON.stringify(selectedDays);
      await db.prepare("INSERT INTO tournament_configs (tournament_id,start_date,end_date,start_time,end_time,match_minutes,buffer_minutes,match_fee_cents,active_days,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tournament_id) DO UPDATE SET start_date=excluded.start_date,end_date=excluded.end_date,start_time=excluded.start_time,end_time=excluded.end_time,match_minutes=excluded.match_minutes,buffer_minutes=excluded.buffer_minutes,match_fee_cents=excluded.match_fee_cents,active_days=excluded.active_days,updated_at=excluded.updated_at")
        .bind(id,startDate,endDate,startTime,endTime,matchMinutes,bufferMinutes,matchFeeCents,activeDays,now).run();
      await db.prepare("UPDATE tournaments SET field_count=?,team_count=(SELECT COALESCE(SUM(max_teams),0) FROM competition_settings WHERE tournament_id=? AND enabled=1),updated_at=? WHERE id=?")
        .bind(fields.filter((row:any)=>row.active!==false).length,id,now,id).run();
      await appendAudit({
        tournamentId: id,
        userId: current.userId,
        role,
        action: "structure.saved",
        entityType: "tournament",
        entityId: id,
        payload: { settings: rows, fields: fields.length, scheduleConfig: { startDate,endDate,startTime,endTime,matchMinutes,bufferMinutes,matchFeeCents,activeDays } },
      });
      return Response.json({ ok: true });
    }
    if (body.action === "invite_user") {
      const email = String(body.email || "")
          .trim()
          .toLowerCase(),
        inviteRole = String(body.role || "").trim(),
        teamId = body.teamId ? String(body.teamId) : null;
      const allowed = [
        "TOURNAMENT_DIRECTOR",
        "SECRETARIAT",
        "REFEREE",
        "CLUB_MANAGER",
      ];
      if (
        !email.includes("@") ||
        !allowed.includes(inviteRole) ||
        (inviteRole === "CLUB_MANAGER" && !teamId)
      )
        return Response.json(
          { error: "Completa email, ruolo e società" },
          { status: 400 },
        );
      const invitationId = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO invitations (id,organization_id,tournament_id,team_id,email,role,status,invited_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          invitationId,
          workspace.organizationId,
          id,
          teamId,
          email,
          inviteRole,
          "pending",
          current.userId,
          now,
        )
        .run();
      await appendAudit({
        tournamentId: id,
        userId: current.userId,
        role,
        action: "user.invited",
        entityType: "invitation",
        entityId: invitationId,
        payload: { email, role: inviteRole, teamId },
      });
      return Response.json({ ok: true }, { status: 201 });
    }
    if (body.action === "resolve_error") {
      if (!["SUPER_ADMIN", "TOURNAMENT_DIRECTOR"].includes(role))
        throw new Error("FORBIDDEN");
      const status = ["reviewing", "resolved", "rejected"].includes(
        body.status,
      )
        ? body.status
        : "reviewing";
      await db
        .prepare(
          "UPDATE error_reports SET status=?,resolution=?,updated_at=? WHERE id=? AND tournament_id=?",
        )
        .bind(status, String(body.resolution || ""), now, body.errorId, id)
        .run();
      await appendAudit({
        tournamentId: id,
        userId: current.userId,
        role,
        action: "error_report.updated",
        entityType: "error_report",
        entityId: String(body.errorId),
        payload: { status, resolution: body.resolution },
      });
      return Response.json({ ok: true });
    }
    if (body.action === "create_match") {
      const homeTeamId = String(body.homeTeamId || ""),
        awayTeamId = String(body.awayTeamId || ""),
        category = String(body.category || ""),
        division = String(body.division || ""),
        startsAt = String(body.startsAt || ""),
        venue = String(body.venue || "").trim(),
        field = String(body.field || "").trim(),
        refereeName = String(body.refereeName || "").trim(),
        matchDay = Math.max(1, Number(body.matchDay) || 1);
      if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId || !category || !division || !startsAt || !venue || !field)
        return Response.json({ error: "Completa tutti i dati della partita" }, { status: 400 });
      const eligible = await db
        .prepare("SELECT team_id AS teamId FROM tournament_teams WHERE tournament_id=? AND category=? AND division=? AND status!='withdrawn' AND team_id IN (?,?)")
        .bind(id, category, division, homeTeamId, awayTeamId)
        .all<any>();
      if (eligible.results.length !== 2)
        return Response.json({ error: "Le squadre devono appartenere alla stessa categoria e serie" }, { status: 400 });
      const conflict = await scheduleConflict(db, { tournamentId: id, startsAt, venue, field, homeTeamId, awayTeamId, refereeName });
      if (conflict) return Response.json({ error: conflict }, { status: 409 });
      const matchId = crypto.randomUUID();
      await db
        .prepare("INSERT INTO matches (id,tournament_id,home_team_id,away_team_id,category,division,match_day,starts_at,venue,field,referee_name,status,callups_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(matchId, id, homeTeamId, awayTeamId, category, division, matchDay, startsAt, venue, field, refereeName || null, "scheduled", JSON.stringify({ home: [], away: [] }), now, now)
        .run();
      await appendAudit({ tournamentId: id, userId: current.userId, role, action: "match.created", entityType: "match", entityId: matchId, payload: { homeTeamId, awayTeamId, startsAt, venue, field } });
      return Response.json({ ok: true, id: matchId }, { status: 201 });
    }
    if (body.action === "generate_final_phase") {
      const competitionId=String(body.competitionId||"");
      const competition=await db.prepare("SELECT id,category,division,name,kind,finals_json AS finalsJson FROM competition_settings WHERE id=? AND tournament_id=? AND enabled=1").bind(competitionId,id).first<any>();
      if(!competition)return Response.json({error:"Competizione non trovata"},{status:404});
      if(competition.kind==="league")return Response.json({error:"Questa competizione prevede solo la classifica"},{status:409});
      const existing=await db.prepare("SELECT COUNT(*) AS total FROM matches WHERE competition_id=? AND stage IN ('finals','knockout') AND status!='cancelled'").bind(competitionId).first<{total:number}>();
      if(Number(existing?.total))return Response.json({error:"Il primo turno è già presente. Puoi modificare le gare dalla sezione Calendario"},{status:409});
      let finals={qualifiers:4,semifinalLegs:1,finalLegs:1};
      try{finals={...finals,...JSON.parse(competition.finalsJson||"{}")} }catch{}
      const requested=Math.max(2,Math.min(16,Number(finals.qualifiers)||4));
      if(![2,4,8,16].includes(requested))return Response.json({error:"Il numero di qualificate deve essere 2, 4, 8 o 16"},{status:400});
      if(competition.kind!=="knockout"){const qualification=await db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status IN ('official','rectified') THEN 1 ELSE 0 END) AS completed FROM matches WHERE competition_id=? AND stage='qualification' AND status!='cancelled'").bind(competitionId).first<any>();if(!Number(qualification?.total)||Number(qualification?.completed)!==Number(qualification?.total))return Response.json({error:`Completa e ufficializza tutta la qualificazione prima delle finali (${Number(qualification?.completed||0)}/${Number(qualification?.total||0)} gare)`},{status:409})}
      const ranked=await db.prepare("SELECT t.id,t.name,COALESCE(cte.seed,9999) AS seed,COUNT(m.id) AS played,COALESCE(SUM(CASE WHEN m.home_team_id=t.id THEN r.home_score ELSE r.away_score END),0) AS gf,COALESCE(SUM(CASE WHEN m.home_team_id=t.id THEN r.away_score ELSE r.home_score END),0) AS ga,COALESCE(SUM(CASE WHEN (m.home_team_id=t.id AND r.home_score>r.away_score) OR (m.away_team_id=t.id AND r.away_score>r.home_score) THEN 3 WHEN r.home_score=r.away_score THEN 1 ELSE 0 END),0) AS points FROM tournament_teams tt JOIN teams t ON t.id=tt.team_id LEFT JOIN competition_team_entries cte ON cte.competition_id=? AND cte.team_id=t.id LEFT JOIN matches m ON m.competition_id=? AND m.stage='qualification' AND (m.home_team_id=t.id OR m.away_team_id=t.id) AND m.status IN ('official','rectified') LEFT JOIN match_reports r ON r.match_id=m.id WHERE tt.tournament_id=? AND tt.status!='withdrawn' AND ((EXISTS (SELECT 1 FROM competition_team_entries x WHERE x.competition_id=?) AND cte.id IS NOT NULL AND cte.status!='withdrawn') OR (NOT EXISTS (SELECT 1 FROM competition_team_entries x WHERE x.competition_id=?) AND tt.category=? AND tt.division=?)) GROUP BY t.id,t.name,cte.seed ORDER BY CASE WHEN ?='knockout' THEN COALESCE(cte.seed,9999) END ASC,CASE WHEN ?!='knockout' THEN points END DESC,CASE WHEN ?!='knockout' THEN (gf-ga) END DESC,CASE WHEN ?!='knockout' THEN gf END DESC,t.name").bind(competitionId,competitionId,id,competitionId,competitionId,competition.category,competition.division,competition.kind,competition.kind,competition.kind,competition.kind).all<any>();
      if(ranked.results.length<requested)return Response.json({error:`Servono almeno ${requested} squadre partecipanti; ora sono ${ranked.results.length}`},{status:409});
      const qualified=ranked.results.slice(0,requested);
      const [configuredFields,configuredSchedule,lastMatch]=await Promise.all([
        db.prepare("SELECT venue_name AS venueName,field_name AS fieldName FROM tournament_fields WHERE tournament_id=? AND active=1 ORDER BY sort_order").bind(id).all<any>(),
        db.prepare("SELECT start_date AS startDate,end_date AS endDate,start_time AS startTime,end_time AS endTime,match_minutes AS matchMinutes,buffer_minutes AS bufferMinutes,active_days AS activeDays FROM tournament_configs WHERE tournament_id=?").bind(id).first<any>(),
        db.prepare("SELECT MAX(starts_at) AS startsAt FROM matches WHERE competition_id=?").bind(competitionId).first<any>(),
      ]);
      if(!configuredFields.results.length||!configuredSchedule)return Response.json({error:"Configura calendario e campi prima di generare la fase finale"},{status:409});
      const toMinutes=(value:string)=>{const [hours,minutes]=value.split(":").map(Number);return hours*60+minutes};
      const toTime=(minutes:number)=>`${String(Math.floor(minutes/60)).padStart(2,"0")}:${String(minutes%60).padStart(2,"0")}`;
      const times:string[]=[];
      for(let minute=toMinutes(configuredSchedule.startTime);minute+Number(configuredSchedule.matchMinutes)<=toMinutes(configuredSchedule.endTime);minute+=Math.max(5,Number(configuredSchedule.matchMinutes)+Number(configuredSchedule.bufferMinutes)))times.push(toTime(minute));
      const activeDays:number[]=JSON.parse(configuredSchedule.activeDays||"[6,0]");
      const minimum=lastMatch?.startsAt?new Date(lastMatch.startsAt):new Date(`${configuredSchedule.startDate}T00:00:00Z`);
      const candidates:{startsAt:string;venue:string;field:string}[]=[];
      for(let date=new Date(`${configuredSchedule.startDate}T12:00:00Z`);date<=new Date(`${configuredSchedule.endDate}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+1)){
        if(date.getTime()<=minimum.getTime()||!activeDays.includes(date.getUTCDay()))continue;
        for(const time of times)for(const field of configuredFields.results)candidates.push({startsAt:`${date.toISOString().slice(0,10)}T${time}:00+02:00`,venue:field.venueName,field:field.fieldName});
      }
      const roundName=requested===2?"Finale":requested===4?"Semifinale":requested===8?"Quarti di finale":"Ottavi di finale";
      const legs=requested===2?Math.max(1,Number(finals.finalLegs)||1):requested===4?Math.max(1,Number(finals.semifinalLegs)||1):1;
      let created=0;
      for(let index=0;index<requested/2;index++){
        const home=qualified[index].id,away=qualified[requested-1-index].id,tieId=crypto.randomUUID();
        for(let leg=1;leg<=legs;leg++){
          const homeTeamId=leg===1?home:away,awayTeamId=leg===1?away:home;
          let selected:{startsAt:string;venue:string;field:string}|undefined;
          for(const candidate of candidates){if(!await scheduleConflict(db,{tournamentId:id,startsAt:candidate.startsAt,venue:candidate.venue,field:candidate.field,homeTeamId,awayTeamId})){selected=candidate;break}}
          if(!selected){await db.prepare("DELETE FROM matches WHERE competition_id=? AND stage='finals' AND bracket_round=1 AND status='scheduled'").bind(competitionId).run();return Response.json({error:"Non ci sono slot liberi sufficienti per la fase finale: amplia date, giorni o campi"},{status:409})}
          const matchId=crypto.randomUUID();
          await db.prepare("INSERT INTO matches (id,tournament_id,home_team_id,away_team_id,category,division,match_day,starts_at,venue,field,status,callups_json,competition_id,stage,round_name,bracket_round,bracket_tie_id,bracket_leg,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(matchId,id,homeTeamId,awayTeamId,competition.category,competition.division,1,selected.startsAt,selected.venue,selected.field,"scheduled",JSON.stringify({home:[],away:[]}),competitionId,"finals",legs===2?`${roundName} · ${leg===1?"andata":"ritorno"}`:roundName,1,tieId,leg,now,now).run();
          created++;
        }
      }
      await appendAudit({tournamentId:id,userId:current.userId,role,action:"finals.generated",entityType:"competition",entityId:competitionId,payload:{roundName,qualified:qualified.map(row=>row.id),matches:created}});
      return Response.json({ok:true,count:created});
    }
    if(body.action==="advance_final_phase"){
      const competitionId=String(body.competitionId||"");
      const competition=await db.prepare("SELECT id,category,division,name,finals_json AS finalsJson FROM competition_settings WHERE id=? AND tournament_id=? AND enabled=1").bind(competitionId,id).first<any>();
      if(!competition)return Response.json({error:"Competizione non trovata"},{status:404});
      const currentRound=await db.prepare("SELECT MAX(bracket_round) AS round FROM matches WHERE competition_id=? AND stage='finals' AND status!='cancelled'").bind(competitionId).first<{round:number}>();
      const round=Number(currentRound?.round||0);
      if(!round)return Response.json({error:"Genera prima il turno iniziale"},{status:409});
      const roundMatches=await db.prepare("SELECT m.id,m.home_team_id AS homeTeamId,m.away_team_id AS awayTeamId,m.status,m.bracket_tie_id AS tieId,m.bracket_leg AS leg,r.home_score AS homeScore,r.away_score AS awayScore,r.home_penalty_score AS homePenaltyScore,r.away_penalty_score AS awayPenaltyScore FROM matches m LEFT JOIN match_reports r ON r.match_id=m.id WHERE m.competition_id=? AND m.stage='finals' AND m.bracket_round=? AND m.status!='cancelled' ORDER BY m.starts_at,m.bracket_tie_id,m.bracket_leg").bind(competitionId,round).all<any>();
      if(!roundMatches.results.length)return Response.json({error:"Turno non disponibile"},{status:409});
      if(roundMatches.results.some(match=>!["official","rectified"].includes(match.status)))return Response.json({error:"Ufficializza tutte le gare del turno prima di proseguire"},{status:409});
      const ties=new Map<string,any[]>();
      for(const match of roundMatches.results){const key=match.tieId||match.id;ties.set(key,[...(ties.get(key)||[]),match])}
      const winners:string[]=[],losers:string[]=[];
      for(const matches of ties.values()){
        const totals=new Map<string,number>();
        for(const match of matches){totals.set(match.homeTeamId,(totals.get(match.homeTeamId)||0)+Number(match.homeScore||0));totals.set(match.awayTeamId,(totals.get(match.awayTeamId)||0)+Number(match.awayScore||0))}
        const teams=[...totals.keys()];if(teams.length!==2)return Response.json({error:"Accoppiamento del tabellone non valido"},{status:409});
        let winner:string|undefined;
        if((totals.get(teams[0])||0)!==(totals.get(teams[1])||0))winner=(totals.get(teams[0])||0)>(totals.get(teams[1])||0)?teams[0]:teams[1];
        else {const deciding=[...matches].reverse().find(match=>match.homePenaltyScore!=null&&match.awayPenaltyScore!=null&&Number(match.homePenaltyScore)!==Number(match.awayPenaltyScore));if(deciding)winner=Number(deciding.homePenaltyScore)>Number(deciding.awayPenaltyScore)?deciding.homeTeamId:deciding.awayTeamId}
        if(!winner)return Response.json({error:"Una sfida è ancora in parità: inserisci i rigori nella gara decisiva"},{status:409});
        winners.push(winner);losers.push(teams.find(team=>team!==winner)!);
      }
      if(winners.length===1){
        const champion=await db.prepare("SELECT id,name FROM teams WHERE id=?").bind(winners[0]).first<any>(),runnerUp=await db.prepare("SELECT id,name FROM teams WHERE id=?").bind(losers[0]).first<any>();
        const resultStatements:any[]=[
          db.prepare("DELETE FROM competition_results WHERE competition_id=? AND position IN (1,2)").bind(competitionId),
          db.prepare("INSERT INTO competition_results (id,competition_id,team_id,position,title,source_match_id,decided_at,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),competitionId,champion.id,1,`Campione · ${competition.name}`,roundMatches.results[0].id,now,now),
          db.prepare("INSERT INTO competition_results (id,competition_id,team_id,position,title,source_match_id,decided_at,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),competitionId,runnerUp.id,2,`Finalista · ${competition.name}`,roundMatches.results[0].id,now,now),
          db.prepare("DELETE FROM awards WHERE tournament_id=? AND type=? AND scope='tournament'").bind(id,`champion:${competitionId}`),
          db.prepare("INSERT INTO awards (id,tournament_id,team_id,scope,type,title,recipient_name,status,awarded_at,created_by,created_at,updated_at) VALUES (?,?,?,'tournament',?,?,?,'published',?,?,?,?)").bind(crypto.randomUUID(),id,champion.id,`champion:${competitionId}`,`Campione ${competition.name}`,champion.name,now,current.userId,now,now),
        ];
        const placement=await db.prepare("SELECT m.id,m.home_team_id AS homeTeamId,m.away_team_id AS awayTeamId,m.status,r.home_score AS homeScore,r.away_score AS awayScore,r.home_penalty_score AS homePenaltyScore,r.away_penalty_score AS awayPenaltyScore FROM matches m LEFT JOIN match_reports r ON r.match_id=m.id WHERE m.competition_id=? AND m.stage='placement' AND m.bracket_round=? AND m.status!='cancelled'").bind(competitionId,round).all<any>();
        if(placement.results.length&&placement.results.every(match=>["official","rectified"].includes(match.status))){const game=placement.results[0],homeWins=Number(game.homeScore)>Number(game.awayScore)||(Number(game.homeScore)===Number(game.awayScore)&&Number(game.homePenaltyScore)>Number(game.awayPenaltyScore)),thirdId=homeWins?game.homeTeamId:game.awayTeamId,fourthId=homeWins?game.awayTeamId:game.homeTeamId;resultStatements.push(db.prepare("DELETE FROM competition_results WHERE competition_id=? AND position IN (3,4)").bind(competitionId),db.prepare("INSERT INTO competition_results (id,competition_id,team_id,position,title,source_match_id,decided_at,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),competitionId,thirdId,3,`3° posto · ${competition.name}`,game.id,now,now),db.prepare("INSERT INTO competition_results (id,competition_id,team_id,position,title,source_match_id,decided_at,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),competitionId,fourthId,4,`4° posto · ${competition.name}`,game.id,now,now))}
        await db.batch(resultStatements);
        await appendAudit({tournamentId:id,userId:current.userId,role,action:"finals.completed",entityType:"competition",entityId:competitionId,payload:{champion:champion.id,runnerUp:runnerUp.id}});
        return Response.json({ok:true,completed:true,champion:champion.name});
      }
      let finals={semifinalLegs:1,finalLegs:1,thirdPlace:false};try{finals={...finals,...JSON.parse(competition.finalsJson||"{}")} }catch{}
      const [configuredFields,configuredSchedule,lastMatch]=await Promise.all([
        db.prepare("SELECT venue_name AS venueName,field_name AS fieldName FROM tournament_fields WHERE tournament_id=? AND active=1 ORDER BY sort_order").bind(id).all<any>(),
        db.prepare("SELECT start_date AS startDate,end_date AS endDate,start_time AS startTime,end_time AS endTime,match_minutes AS matchMinutes,buffer_minutes AS bufferMinutes,active_days AS activeDays FROM tournament_configs WHERE tournament_id=?").bind(id).first<any>(),
        db.prepare("SELECT MAX(starts_at) AS startsAt FROM matches WHERE competition_id=?").bind(competitionId).first<any>(),
      ]);
      if(!configuredFields.results.length||!configuredSchedule)return Response.json({error:"Configura calendario e campi prima di proseguire"},{status:409});
      const toMinutes=(value:string)=>{const [hours,minutes]=value.split(":").map(Number);return hours*60+minutes},toTime=(minutes:number)=>`${String(Math.floor(minutes/60)).padStart(2,"0")}:${String(minutes%60).padStart(2,"0")}`;
      const times:string[]=[];for(let minute=toMinutes(configuredSchedule.startTime);minute+Number(configuredSchedule.matchMinutes)<=toMinutes(configuredSchedule.endTime);minute+=Math.max(5,Number(configuredSchedule.matchMinutes)+Number(configuredSchedule.bufferMinutes)))times.push(toTime(minute));
      const activeDays:number[]=JSON.parse(configuredSchedule.activeDays||"[6,0]"),minimum=new Date(lastMatch?.startsAt||`${configuredSchedule.startDate}T00:00:00Z`),candidates:{startsAt:string;venue:string;field:string}[]=[];
      for(let date=new Date(`${configuredSchedule.startDate}T12:00:00Z`);date<=new Date(`${configuredSchedule.endDate}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+1)){if(date.getTime()<=minimum.getTime()||!activeDays.includes(date.getUTCDay()))continue;for(const time of times)for(const field of configuredFields.results)candidates.push({startsAt:`${date.toISOString().slice(0,10)}T${time}:00+02:00`,venue:field.venueName,field:field.fieldName})}
      const roundName=winners.length===2?"Finale":winners.length===4?"Semifinale":winners.length===8?"Quarti di finale":"Turno successivo",legs=winners.length===2?Math.max(1,Number(finals.finalLegs)||1):winners.length===4?Math.max(1,Number(finals.semifinalLegs)||1):1,nextRound=round+1;
      const createTie=async(home:string,away:string,name:string,tieRound:number,tieLegs:number,stage="finals")=>{const tieId=crypto.randomUUID();for(let leg=1;leg<=tieLegs;leg++){const homeTeamId=leg===1?home:away,awayTeamId=leg===1?away:home;let selected:any;for(const candidate of candidates){if(!await scheduleConflict(db,{tournamentId:id,startsAt:candidate.startsAt,venue:candidate.venue,field:candidate.field,homeTeamId,awayTeamId})){selected=candidate;break}}if(!selected)throw new Error("NO_FINAL_SLOTS");await db.prepare("INSERT INTO matches (id,tournament_id,home_team_id,away_team_id,category,division,match_day,starts_at,venue,field,status,callups_json,competition_id,stage,round_name,bracket_round,bracket_tie_id,bracket_leg,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),id,homeTeamId,awayTeamId,competition.category,competition.division,nextRound,selected.startsAt,selected.venue,selected.field,"scheduled",JSON.stringify({home:[],away:[]}),competitionId,stage,tieLegs===2?`${name} · ${leg===1?"andata":"ritorno"}`:name,tieRound,tieId,leg,now,now).run()}};
      try{for(let index=0;index<winners.length/2;index++)await createTie(winners[index],winners[winners.length-1-index],roundName,nextRound,legs);if(Boolean(finals.thirdPlace)&&winners.length===2&&losers.length===2)await createTie(losers[0],losers[1],"Finale 3° posto",nextRound,1,"placement")}catch(error){await db.prepare("DELETE FROM matches WHERE competition_id=? AND bracket_round=? AND status='scheduled'").bind(competitionId,nextRound).run();if(error instanceof Error&&error.message==="NO_FINAL_SLOTS")return Response.json({error:"Non ci sono slot liberi sufficienti per il turno successivo"},{status:409});throw error}
      await appendAudit({tournamentId:id,userId:current.userId,role,action:"finals.advanced",entityType:"competition",entityId:competitionId,payload:{round:nextRound,teams:winners}});
      return Response.json({ok:true,count:winners.length/2,round:roundName});
    }
    if(body.action==="generate_playout"){
      const competitionId=String(body.competitionId||""),competition=await db.prepare("SELECT id,category,division,name,kind,finals_json AS finalsJson FROM competition_settings WHERE id=? AND tournament_id=? AND enabled=1").bind(competitionId,id).first<any>();
      if(!competition)return Response.json({error:"Competizione non trovata"},{status:404});
      let config={playoutEnabled:false,playoutTeams:4,relegations:1};try{config={...config,...JSON.parse(competition.finalsJson||"{}")} }catch{}
      if(!config.playoutEnabled)return Response.json({error:"Attiva e salva prima i playout per questa competizione"},{status:409});
      if(Number(config.relegations)<1)return Response.json({error:"Imposta almeno una retrocessione per usare i playout"},{status:409});
      const requested=Number(config.playoutTeams||4);if(![2,4,8].includes(requested))return Response.json({error:"I playout possono coinvolgere 2, 4 o 8 squadre"},{status:400});
      const existing=await db.prepare("SELECT COUNT(*) AS total FROM matches WHERE competition_id=? AND stage='playout' AND status!='cancelled'").bind(competitionId).first<any>();if(Number(existing?.total))return Response.json({error:"Il tabellone playout è già presente"},{status:409});
      const qualification=await db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status IN ('official','rectified') THEN 1 ELSE 0 END) AS completed FROM matches WHERE competition_id=? AND stage='qualification' AND status!='cancelled'").bind(competitionId).first<any>();if(!Number(qualification?.total)||Number(qualification?.completed)!==Number(qualification?.total))return Response.json({error:`Ufficializza prima tutta la qualificazione (${Number(qualification?.completed||0)}/${Number(qualification?.total||0)} gare)`},{status:409});
      const ranked=await rankedCompetitionTeams(db,id,competition),directRelegations=Math.max(0,(Number(config.relegations)||1)-1);if(ranked.length<requested+directRelegations)return Response.json({error:`Servono almeno ${requested+directRelegations} squadre per separare retrocessioni dirette e playout`},{status:409});
      const teams=ranked.slice(-(requested+directRelegations),directRelegations? -directRelegations:undefined).map(row=>row.id),roundName=requested===2?"Spareggio salvezza":requested===4?"Semifinale playout":"Quarti playout";
      try{const count=await createBracketRound(db,{tournamentId:id,competition,teams,stage:"playout",round:1,roundName,now});await appendAudit({tournamentId:id,userId:current.userId,role,action:"playout.generated",entityType:"competition",entityId:competitionId,payload:{teams,count}});return Response.json({ok:true,count})}catch(error){await db.prepare("DELETE FROM matches WHERE competition_id=? AND stage='playout' AND status='scheduled'").bind(competitionId).run();if(error instanceof Error&&error.message==="NO_BRACKET_SLOTS")return Response.json({error:"Non ci sono slot liberi sufficienti per i playout"},{status:409});throw error}
    }
    if(body.action==="advance_playout"){
      const competitionId=String(body.competitionId||""),competition=await db.prepare("SELECT id,category,division,name FROM competition_settings WHERE id=? AND tournament_id=? AND enabled=1").bind(competitionId,id).first<any>();if(!competition)return Response.json({error:"Competizione non trovata"},{status:404});
      const current=await db.prepare("SELECT MAX(bracket_round) AS round FROM matches WHERE competition_id=? AND stage='playout' AND status!='cancelled'").bind(competitionId).first<any>(),round=Number(current?.round||0);if(!round)return Response.json({error:"Genera prima il tabellone playout"},{status:409});
      const games=await db.prepare("SELECT m.id,m.home_team_id AS homeTeamId,m.away_team_id AS awayTeamId,m.status,m.bracket_tie_id AS tieId,r.home_score AS homeScore,r.away_score AS awayScore,r.home_penalty_score AS homePenaltyScore,r.away_penalty_score AS awayPenaltyScore FROM matches m LEFT JOIN match_reports r ON r.match_id=m.id WHERE m.competition_id=? AND m.stage='playout' AND m.bracket_round=? AND m.status!='cancelled'").bind(competitionId,round).all<any>();
      if(games.results.some(game=>!["official","rectified"].includes(game.status)))return Response.json({error:"Ufficializza tutte le gare playout del turno"},{status:409});
      let decision;try{decision=bracketDecisions(games.results)}catch(error){if(error instanceof Error&&error.message==="TIE_NEEDS_PENALTIES")return Response.json({error:"Una sfida è pari: inserisci i rigori nella gara decisiva"},{status:409});throw error}
      const {winners,losers}=decision;for(const teamId of winners)await db.prepare("INSERT INTO season_outcomes (id,tournament_id,competition_id,team_id,outcome,source,note,decided_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'playout',?,?,?,?,?) ON CONFLICT(competition_id,team_id,outcome) DO UPDATE SET source='playout',note=excluded.note,decided_at=excluded.decided_at,updated_at=excluded.updated_at").bind(crypto.randomUUID(),id,competitionId,teamId,"safe",`Salvezza conquistata nei playout · turno ${round}`,now,current.userId,now,now).run();
      if(losers.length===1){await db.prepare("INSERT INTO season_outcomes (id,tournament_id,competition_id,team_id,outcome,source,note,decided_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'playout',?,?,?,?,?) ON CONFLICT(competition_id,team_id,outcome) DO UPDATE SET source='playout',note=excluded.note,decided_at=excluded.decided_at,updated_at=excluded.updated_at").bind(crypto.randomUUID(),id,competitionId,losers[0],"relegated","Esito finale playout",now,current.userId,now,now).run();await appendAudit({tournamentId:id,userId:current.userId,role,action:"playout.completed",entityType:"competition",entityId:competitionId,payload:{relegated:losers[0]}});return Response.json({ok:true,completed:true})}
      const nextRound=round+1,roundName=losers.length===2?"Finale playout":losers.length===4?"Semifinale playout":"Turno playout";try{const count=await createBracketRound(db,{tournamentId:id,competition,teams:losers,stage:"playout",round:nextRound,roundName,now});await appendAudit({tournamentId:id,userId:current.userId,role,action:"playout.advanced",entityType:"competition",entityId:competitionId,payload:{round:nextRound,teams:losers}});return Response.json({ok:true,count})}catch(error){await db.prepare("DELETE FROM matches WHERE competition_id=? AND stage='playout' AND bracket_round=? AND status='scheduled'").bind(competitionId,nextRound).run();if(error instanceof Error&&error.message==="NO_BRACKET_SLOTS")return Response.json({error:"Non ci sono slot liberi per il turno playout successivo"},{status:409});throw error}
    }
    if(body.action==="close_season"){
      const pending=await db.prepare("SELECT COUNT(*) AS total FROM matches WHERE tournament_id=? AND status NOT IN ('official','rectified','cancelled')").bind(id).first<any>();if(Number(pending?.total))return Response.json({error:`Restano ${pending?.total} partite non ufficiali: chiudile o annullale prima di chiudere la stagione`},{status:409});
      const competitions=await db.prepare("SELECT id,category,division,name,kind,finals_json AS finalsJson FROM competition_settings WHERE tournament_id=? AND enabled=1 AND kind!='knockout'").bind(id).all<any>();if(!competitions.results.length)return Response.json({error:"Non ci sono competizioni a classifica da chiudere"},{status:409});
      await db.prepare("DELETE FROM season_outcomes WHERE tournament_id=? AND source='automatic'").bind(id).run();
      for(const competition of competitions.results){const ranked=await rankedCompetitionTeams(db,id,competition);if(!ranked.length)continue;let config={promotions:0,relegations:0,playoutEnabled:false};try{config={...config,...JSON.parse(competition.finalsJson||"{}")} }catch{}
        const playoutRelegated=await db.prepare("SELECT team_id AS teamId FROM season_outcomes WHERE competition_id=? AND outcome='relegated' AND source='playout' LIMIT 1").bind(competition.id).first<any>();if(config.playoutEnabled&&Number(config.relegations)>0&&!playoutRelegated)return Response.json({error:`Completa i playout di ${competition.name} · ${competition.category} ${competition.division}`},{status:409});
        const result=await db.prepare("SELECT team_id AS teamId,position FROM competition_results WHERE competition_id=? ORDER BY position").bind(competition.id).all<any>(),championId=result.results.find(row=>row.position===1)?.teamId||ranked[0].id,finalistId=result.results.find(row=>row.position===2)?.teamId||ranked[1]?.id;
        const promotions=new Set(ranked.slice(0,Math.max(0,Number(config.promotions)||0)).map(row=>row.id)),directCount=Math.max(0,(Number(config.relegations)||0)-(config.playoutEnabled?1:0)),relegations=new Set(ranked.slice(Math.max(0,ranked.length-directCount)).map(row=>row.id));if(playoutRelegated&&Number(config.relegations)>0)relegations.add(playoutRelegated.teamId);
        for(const [index,team] of ranked.entries()){const movements:string[]=[];if(promotions.has(team.id))movements.push("promoted");if(relegations.has(team.id))movements.push("relegated");if(!movements.length&&!await db.prepare("SELECT id FROM season_outcomes WHERE competition_id=? AND team_id=? AND outcome='safe' AND source='playout'").bind(competition.id,team.id).first())movements.push("safe");if(team.id===championId)movements.push("champion");if(team.id===finalistId&&team.id!==championId)movements.push("finalist");for(const outcome of movements)await db.prepare("INSERT INTO season_outcomes (id,tournament_id,competition_id,team_id,outcome,position,source,note,decided_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,'automatic',?,?,?,?,?) ON CONFLICT(competition_id,team_id,outcome) DO UPDATE SET position=excluded.position,note=excluded.note,decided_at=excluded.decided_at,updated_at=excluded.updated_at").bind(crypto.randomUUID(),id,competition.id,team.id,outcome,index+1,`Classifica ufficiale · ${competition.name}`,now,current.userId,now,now).run()}
      }
      await db.prepare("UPDATE tournaments SET status='completed',closed_at=?,closed_by=?,updated_at=? WHERE id=?").bind(now,current.userId,now,id).run();await appendAudit({tournamentId:id,userId:current.userId,role,action:"season.closed",entityType:"tournament",entityId:id,payload:{}});return Response.json({ok:true});
    }
    if(body.action==="reopen_season"){await db.prepare("UPDATE tournaments SET status='active',closed_at=NULL,closed_by=NULL,updated_at=? WHERE id=?").bind(now,id).run();await appendAudit({tournamentId:id,userId:current.userId,role,action:"season.reopened",entityType:"tournament",entityId:id,payload:{}});return Response.json({ok:true})}
    if(body.action==="override_outcome"){
      const competitionId=String(body.competitionId||""),teamId=String(body.teamId||""),outcome=String(body.outcome||""),note=String(body.note||"").trim();if(!["champion","finalist","promoted","safe","relegated","repechaged"].includes(outcome))return Response.json({error:"Esito non valido"},{status:400});
      const valid=await db.prepare("SELECT cs.id FROM competition_settings cs JOIN tournament_teams tt ON tt.tournament_id=cs.tournament_id AND tt.team_id=? WHERE cs.id=? AND cs.tournament_id=? AND tt.status!='withdrawn'").bind(teamId,competitionId,id).first();if(!valid)return Response.json({error:"Squadra o competizione non valida"},{status:400});
      if(outcome==="repechaged")await db.prepare("DELETE FROM season_outcomes WHERE competition_id=? AND team_id=? AND outcome='relegated'").bind(competitionId,teamId).run();
      await db.prepare("INSERT INTO season_outcomes (id,tournament_id,competition_id,team_id,outcome,source,note,decided_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'manual',?,?,?,?,?) ON CONFLICT(competition_id,team_id,outcome) DO UPDATE SET source='manual',note=excluded.note,decided_at=excluded.decided_at,updated_at=excluded.updated_at").bind(crypto.randomUUID(),id,competitionId,teamId,outcome,note||"Correzione amministrativa",now,current.userId,now,now).run();await appendAudit({tournamentId:id,userId:current.userId,role,action:"season.outcome_overridden",entityType:"team",entityId:teamId,payload:{competitionId,outcome,note}});return Response.json({ok:true})
    }
    if(body.action==="create_next_season"){
      const source=await db.prepare("SELECT name,edition,accent,team_count AS teamCount,field_count AS fieldCount FROM tournaments WHERE id=? AND status='completed'").bind(id).first<any>();if(!source)return Response.json({error:"Chiudi prima ufficialmente la stagione"},{status:409});
      const edition=String(source.edition).replace(/(\d{4})\D+(\d{2,4})/,(_:string,a:string,b:string)=>`${Number(a)+1}/${String(Number(b)+1).slice(-2)}`);const nextEdition=edition===source.edition?`${source.edition} · successiva`:edition,nextId=crypto.randomUUID();
      const duplicate=await db.prepare("SELECT id FROM tournaments WHERE organization_id=? AND name=? AND edition=?").bind(workspace.organizationId,source.name,nextEdition).first();if(duplicate)return Response.json({error:"La stagione successiva esiste già"},{status:409});
      await db.prepare("INSERT INTO tournaments (id,organization_id,name,edition,status,team_count,field_count,progress,accent,is_public,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(nextId,workspace.organizationId,source.name,nextEdition,"draft",source.teamCount,source.fieldCount,0,source.accent,0,current.userId,now,now).run();
      await db.prepare("INSERT INTO tournament_configs (tournament_id,start_date,end_date,start_time,end_time,match_minutes,buffer_minutes,match_fee_cents,active_days,updated_at) SELECT ?,date(start_date,'+1 year'),date(end_date,'+1 year'),start_time,end_time,match_minutes,buffer_minutes,match_fee_cents,active_days,? FROM tournament_configs WHERE tournament_id=?").bind(nextId,now,id).run();
      const fields=await db.prepare("SELECT venue_name AS venueName,address,field_name AS fieldName,field_number AS fieldNumber,active,sort_order AS sortOrder FROM tournament_fields WHERE tournament_id=?").bind(id).all<any>();for(const field of fields.results)await db.prepare("INSERT INTO tournament_fields (id,tournament_id,venue_name,address,field_name,field_number,active,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),nextId,field.venueName,field.address,field.fieldName,field.fieldNumber,field.active,field.sortOrder,now,now).run();
      const oldCompetitions=await db.prepare("SELECT id,category,division,max_teams AS maxTeams,format,finals,enabled,name,kind,finals_json AS finalsJson FROM competition_settings WHERE tournament_id=?").bind(id).all<any>(),competitionMap=new Map<string,string>();for(const competition of oldCompetitions.results){const newCompetitionId=crypto.randomUUID();competitionMap.set(`${competition.category}|${competition.division}|${competition.name}`,newCompetitionId);await db.prepare("INSERT INTO competition_settings (id,tournament_id,category,division,max_teams,format,finals,enabled,name,kind,finals_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(newCompetitionId,nextId,competition.category,competition.division,competition.maxTeams,competition.format,competition.finals,competition.enabled,competition.name,competition.kind,competition.finalsJson,now,now).run()}
      const entries=await db.prepare("SELECT tt.team_id AS teamId,tt.category,tt.division,tt.status FROM tournament_teams tt WHERE tt.tournament_id=? AND tt.status!='withdrawn'").bind(id).all<any>();for(const entry of entries.results){const competition=oldCompetitions.results.find(row=>row.category===entry.category&&row.division===entry.division),outcomes=competition?await db.prepare("SELECT outcome FROM season_outcomes WHERE competition_id=? AND team_id=?").bind(competition.id,entry.teamId).all<any>():{results:[]};let target=entry.division;if(competition){let config:any={};try{config=JSON.parse(competition.finalsJson||"{}")}catch{}const values=new Set(outcomes.results.map((row:any)=>row.outcome));if(values.has("repechaged"))target=entry.division;else if(values.has("promoted")&&config.promotionTargetDivision)target=config.promotionTargetDivision;else if(values.has("relegated")&&config.relegationTargetDivision)target=config.relegationTargetDivision}await db.prepare("INSERT INTO tournament_teams (id,tournament_id,team_id,category,division,status,created_at) VALUES (?,?,?,?,?,'invited',?)").bind(crypto.randomUUID(),nextId,entry.teamId,entry.category,target,now).run();const targetCompetition=oldCompetitions.results.find(row=>row.category===entry.category&&row.division===target);if(targetCompetition){const newCompetitionId=competitionMap.get(`${targetCompetition.category}|${targetCompetition.division}|${targetCompetition.name}`);if(newCompetitionId)await db.prepare("INSERT INTO competition_team_entries (id,competition_id,team_id,status,source,created_at) VALUES (?,?,?,'active','standing',?)").bind(crypto.randomUUID(),newCompetitionId,entry.teamId,now).run()}}
      await appendAudit({tournamentId:id,userId:current.userId,role,action:"season.next_created",entityType:"tournament",entityId:nextId,payload:{edition:nextEdition}});return Response.json({ok:true,tournamentId:nextId,edition:nextEdition})
    }
    if (body.action === "generate_calendar") {
      const [groups,configuredFields,configuredSchedule] = await Promise.all([
        db.prepare("SELECT cs.id AS competitionId,cs.category,cs.division,cs.name AS competitionName,cs.kind,COALESCE(NULLIF((SELECT GROUP_CONCAT(cte.team_id) FROM competition_team_entries cte WHERE cte.competition_id=cs.id AND cte.status!='withdrawn' ORDER BY COALESCE(cte.seed,9999)),''),(SELECT GROUP_CONCAT(tt.team_id) FROM tournament_teams tt WHERE tt.tournament_id=cs.tournament_id AND tt.category=cs.category AND tt.division=cs.division AND tt.status!='withdrawn')) AS teamIds FROM competition_settings cs WHERE cs.tournament_id=? AND cs.enabled=1 AND cs.kind!='knockout' ORDER BY cs.category,cs.division,cs.name").bind(id).all<{ competitionId:string;category: string; division: string; competitionName:string;kind:string;teamIds: string|null }>(),
        db.prepare("SELECT venue_name AS venueName,field_name AS fieldName FROM tournament_fields WHERE tournament_id=? AND active=1 ORDER BY sort_order").bind(id).all<{venueName:string;fieldName:string}>(),
        db.prepare("SELECT start_date AS startDate,end_date AS endDate,start_time AS startTime,end_time AS endTime,match_minutes AS matchMinutes,buffer_minutes AS bufferMinutes,active_days AS activeDays FROM tournament_configs WHERE tournament_id=?").bind(id).first<any>(),
      ]);
      if (!configuredFields.results.length)
        return Response.json({ error: "Configura almeno un campo prima di generare il calendario" }, { status: 400 });
      const schedule= configuredSchedule || {startDate:"2026-10-01",endDate:"2027-05-31",startTime:"08:30",endTime:"13:30",matchMinutes:30,bufferMinutes:10,activeDays:"[6,0]"};
      const toMinutes=(value:string)=>{const [hours,minutes]=value.split(":").map(Number);return hours*60+minutes};
      const toTime=(minutes:number)=>`${String(Math.floor(minutes/60)).padStart(2,"0")}:${String(minutes%60).padStart(2,"0")}`;
      const slotDuration=Math.max(5,Number(schedule.matchMinutes)+Number(schedule.bufferMinutes));
      const times:string[]=[];
      for(let minute=toMinutes(schedule.startTime);minute+Number(schedule.matchMinutes)<=toMinutes(schedule.endTime);minute+=slotDuration)times.push(toTime(minute));
      const activeDays:number[]=JSON.parse(schedule.activeDays||"[6,0]");
      const slots:{startsAt:string;venue:string;field:string}[]=[];
      for(let date=new Date(`${schedule.startDate}T12:00:00Z`);date<=new Date(`${schedule.endDate}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+1)){
        if(!activeDays.includes(date.getUTCDay()))continue;
        for(const time of times)for(const field of configuredFields.results)slots.push({startsAt:`${date.toISOString().slice(0,10)}T${time}:00+02:00`,venue:field.venueName,field:field.fieldName});
      }
      const pending:{home:string;away:string;category:string;division:string;competitionId:string;competitionName:string;stage:string;roundName:string;matchDay:number;startsAt:string;venue:string;field:string}[]=[];
      const usedSlots=new Set<string>(),teamWeekends=new Set<string>();
      for (const group of groups.results) {
        if(!group.teamIds)continue;
        let teams = group.teamIds.split(",");
        if (teams.length < 2) continue;
        if (teams.length % 2) teams = [...teams, "BYE"];
        const fixed = teams[0],
          rotating = teams.slice(1);
        const totalRounds=group.kind==="knockout"?1:teams.length-1;
        for (let round = 0; round < totalRounds; round++) {
          const row = [fixed, ...rotating];
          for (let i = 0; i < row.length / 2; i++) {
            const home = row[i],
              away = row[row.length - 1 - i];
            if (home === "BYE" || away === "BYE") continue;
            const slot=slots.find(candidate=>{
              const slotId=`${candidate.startsAt}|${candidate.venue}|${candidate.field}`;
              if(usedSlots.has(slotId))return false;
              const weekend=weekendKey(candidate.startsAt);
              return !weekend||(!teamWeekends.has(`${home}|${weekend}`)&&!teamWeekends.has(`${away}|${weekend}`));
            });
            if(!slot)return Response.json({error:`Capienza calendario insufficiente: aumenta campi, giorni o fascia oraria`},{status:409});
            const slotId=`${slot.startsAt}|${slot.venue}|${slot.field}`,weekend=weekendKey(slot.startsAt);
            usedSlots.add(slotId);if(weekend){teamWeekends.add(`${home}|${weekend}`);teamWeekends.add(`${away}|${weekend}`)}
            pending.push({home,away,category:group.category,division:group.division,competitionId:group.competitionId,competitionName:group.competitionName,stage:group.kind==="knockout"?"knockout":"qualification",roundName:group.kind==="knockout"?"Primo turno":`Giornata ${round+1}`,matchDay:round+1,startsAt:slot.startsAt,venue:slot.venue,field:slot.field});
          }
          rotating.unshift(rotating.pop()!);
        }
      }
      await db.prepare("DELETE FROM matches WHERE tournament_id=? AND status='scheduled' AND stage!='finals'").bind(id).run();
      for(const item of pending)await db.prepare("INSERT INTO matches (id,tournament_id,home_team_id,away_team_id,category,division,match_day,starts_at,venue,field,status,callups_json,competition_id,stage,round_name,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),id,item.home,item.away,item.category,item.division,item.matchDay,item.startsAt,item.venue,item.field,"scheduled",JSON.stringify({home:[],away:[]}),item.competitionId,item.stage,item.roundName,now,now).run();
      const created=pending.length;
      await appendAudit({
        tournamentId: id,
        userId: current.userId,
        role,
        action: "calendar.generated",
        entityType: "tournament",
        entityId: id,
        payload: { matches: created },
      });
      return Response.json({ ok: true, count: created });
    }
    return Response.json({ error: "Operazione non valida" }, { status: 400 });
  } catch (error) {
    return responseError(error);
  }
}
