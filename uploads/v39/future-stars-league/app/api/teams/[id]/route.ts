import { getChatGPTUser } from "../../../chatgpt-auth";
import { appendAudit, rawDb } from "../../../../db/fsl";

export const dynamic = "force-dynamic";

async function access(id: string) {
  const current = await getChatGPTUser();
  if (!current) throw new Error("UNAUTHENTICATED");
  const db = rawDb();
  const team = await db
    .prepare(
      "SELECT t.id,t.organization_id AS organizationId,t.club_id AS clubId,t.name AS displayName,COALESCE(c.name,t.name) AS name,COALESCE(t.squad_name,'Squadra principale') AS squadName,t.birth_year AS birthYear,t.coach_name AS coachName,COALESCE(c.short_name,t.short_name) AS shortName,COALESCE(c.city,t.city) AS city,COALESCE(t.primary_color,c.primary_color,'#1778ff') AS primaryColor,COALESCE(t.secondary_color,c.secondary_color,'#ffffff') AS secondaryColor,COALESCE(t.crest_key,c.crest_key) AS crestKey,COALESCE(t.cover_key,c.cover_key) AS coverKey,t.roster_image_key AS rosterImageKey,COALESCE(t.sponsor_logo_key,c.sponsor_logo_key) AS sponsorLogoKey,COALESCE(c.address,t.address) AS address,COALESCE(c.phone,t.phone) AS phone,COALESCE(c.contact_email,t.contact_email) AS email,COALESCE(c.contact_name,t.contact_name) AS contactName,COALESCE(c.website,t.website) AS website,COALESCE(c.description,t.description) AS description,COALESCE(c.club_manager_user_id,t.club_manager_user_id) AS clubManagerUserId FROM teams t LEFT JOIN clubs c ON c.id=t.club_id WHERE t.id=?",
    )
    .bind(id)
    .first<any>();
  if (!team) throw new Error("NOT_FOUND");
  const membership = await db
    .prepare(
      "SELECT role FROM memberships WHERE user_id=? AND organization_id=? AND status='active' ORDER BY CASE role WHEN 'SUPER_ADMIN' THEN 1 WHEN 'TOURNAMENT_DIRECTOR' THEN 2 WHEN 'SECRETARIAT' THEN 3 ELSE 4 END LIMIT 1",
    )
    .bind(current.userId, team.organizationId)
    .first<{ role: string }>();
  const canEdit =
    membership?.role === "SUPER_ADMIN" ||
    membership?.role === "SECRETARIAT" ||
    team.clubManagerUserId === current.userId;
  if (!canEdit) throw new Error("FORBIDDEN");
  return { current, team, role: membership?.role || "CLUB_MANAGER" };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return Response.json(
    {
      error:
        message === "UNAUTHENTICATED"
          ? "Autenticazione richiesta"
          : message === "NOT_FOUND"
            ? "Società non trovata"
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

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { team, role } = await access(id);
    const db = rawDb();
    const clubScope=team.clubId||team.id;
    const [players, stats, milestones, awards, tournaments, squads] = await Promise.all([
      db.prepare("SELECT id,first_name AS firstName,last_name AS lastName,birth_year AS birthYear,shirt_number AS shirtNumber,role,status,photo_key AS photoKey,public_name AS publicName,bio,preferred_foot AS preferredFoot,profile_visibility AS profileVisibility,media_consent AS mediaConsent FROM players WHERE team_id=? ORDER BY birth_year,shirt_number,last_name").bind(id).all(),
      db.prepare("SELECT s.id,s.player_id AS playerId,s.tournament_id AS tournamentId,t.name AS tournamentName,t.edition,s.appearances,s.goals,s.assists,s.clean_sheets AS cleanSheets,s.mvp_awards AS mvpAwards,s.yellow_cards AS yellowCards,s.red_cards AS redCards,s.minutes_played AS minutesPlayed FROM player_tournament_stats s JOIN tournaments t ON t.id=s.tournament_id JOIN players p ON p.id=s.player_id WHERE p.team_id=? ORDER BY t.created_at DESC").bind(id).all(),
      db.prepare("SELECT m.id,m.player_id AS playerId,m.tournament_id AS tournamentId,m.type,m.title,m.description,m.happened_at AS happenedAt FROM player_milestones m JOIN players p ON p.id=m.player_id WHERE p.team_id=? ORDER BY m.happened_at DESC").bind(id).all(),
      db.prepare("SELECT a.id,a.player_id AS playerId,a.type,a.title,a.note,a.awarded_at AS awardedAt FROM awards a JOIN players p ON p.id=a.player_id WHERE p.team_id=? AND a.status='published' ORDER BY a.awarded_at DESC").bind(id).all(),
      db.prepare("SELECT DISTINCT t.id,t.name,t.edition FROM tournaments t JOIN tournament_teams tt ON tt.tournament_id=t.id WHERE tt.team_id=? ORDER BY t.created_at DESC").bind(id).all(),
      team.clubId
        ? db.prepare("SELECT t.id,t.name AS displayName,COALESCE(t.squad_name,'Squadra') AS squadName,t.birth_year AS birthYear,t.coach_name AS coachName,(SELECT COUNT(*) FROM players p WHERE p.team_id=t.id AND p.status='active') AS rosterCount,(SELECT COUNT(*) FROM tournament_teams tt WHERE tt.team_id=t.id AND tt.status!='withdrawn') AS tournamentCount FROM teams t WHERE t.club_id=? ORDER BY COALESCE(t.birth_year,9999),t.squad_name,t.name").bind(clubScope).all()
        : Promise.resolve({results:[{id:team.id,displayName:team.displayName,squadName:team.squadName,birthYear:team.birthYear,coachName:team.coachName,rosterCount:0,tournamentCount:0}]} as any),
    ]);
    return Response.json({
      team,
      players: players.results,
      playerStats: stats.results,
      milestones: milestones.results,
      playerAwards: awards.results,
      teamTournaments: tournaments.results,
      squads: squads.results,
      viewerRole: role,
      canEdit: true,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { current, team, role } = await access(id);
    const body = (await request.json()) as any;
    const now = new Date().toISOString();
    const values = {
      name: String(body.name || "").trim(),
      squadName: String(body.squadName || "Squadra principale").trim(),
      birthYear: body.birthYear ? Number(body.birthYear) : null,
      coachName: String(body.coachName || "").trim(),
      shortName: String(body.shortName || "").trim().toUpperCase(),
      city: String(body.city || "").trim(),
      primaryColor: String(body.primaryColor || "#1778ff"),
      secondaryColor: String(body.secondaryColor || "#ffffff"),
      address: String(body.address || "").trim(),
      phone: String(body.phone || "").trim(),
      email: String(body.email || "").trim(),
      contactName: String(body.contactName || "").trim(),
      website: String(body.website || "").trim(),
      description: String(body.description || "").trim(),
    };
    if (values.name.length < 3)
      return Response.json({ error: "Nome società non valido" }, { status: 400 });
    const db=rawDb();
    let clubId=team.clubId as string|null;
    if(!clubId){
      clubId=crypto.randomUUID();
      await db.prepare("INSERT INTO clubs (id,organization_id,name,short_name,city,primary_color,secondary_color,address,phone,contact_email,contact_name,website,description,club_manager_user_id,crest_key,cover_key,sponsor_logo_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(clubId,team.organizationId,values.name,values.shortName,values.city,values.primaryColor,values.secondaryColor,values.address,values.phone,values.email,values.contactName,values.website,values.description,team.clubManagerUserId||null,team.crestKey||null,team.coverKey||null,team.sponsorLogoKey||null,now,now).run();
    }else{
      await db.prepare("UPDATE clubs SET name=?,short_name=?,city=?,primary_color=?,secondary_color=?,address=?,phone=?,contact_email=?,contact_name=?,website=?,description=?,updated_at=? WHERE id=?").bind(values.name,values.shortName,values.city,values.primaryColor,values.secondaryColor,values.address,values.phone,values.email,values.contactName,values.website,values.description,now,clubId).run();
    }
    const displayName=values.squadName&&values.squadName!=="Squadra principale"?`${values.name} ${values.squadName}`:values.name;
    await db.prepare("UPDATE teams SET club_id=?,name=?,squad_name=?,birth_year=?,coach_name=?,short_name=?,city=?,primary_color=?,secondary_color=?,address=?,phone=?,contact_email=?,contact_name=?,website=?,description=?,updated_at=? WHERE id=?").bind(clubId,displayName,values.squadName,values.birthYear,values.coachName,values.shortName,values.city,values.primaryColor,values.secondaryColor,values.address,values.phone,values.email,values.contactName,values.website,values.description,now,id).run();
    await appendAudit({
      userId: current.userId,
      role,
      action: "team.profile_updated",
      entityType: "team",
      entityId: id,
      payload: { previousName: team.name },
    });
    return Response.json({ ok: true, team: { ...team, ...values, clubId, displayName } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { current, role, team } = await access(id);
    const body = (await request.json()) as any;
    const db=rawDb(),now=new Date().toISOString();
    if(body.action==="create_squad"){
      const squadName=String(body.squadName||"").trim();
      const birthYear=body.birthYear?Number(body.birthYear):null;
      if(squadName.length<2)return Response.json({error:"Inserisci il nome o l’annata della squadra"},{status:400});
      let clubId=team.clubId as string|null;
      if(!clubId){
        clubId=crypto.randomUUID();
        await db.batch([
          db.prepare("INSERT INTO clubs (id,organization_id,name,short_name,city,primary_color,secondary_color,address,phone,contact_email,contact_name,website,description,club_manager_user_id,crest_key,cover_key,sponsor_logo_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(clubId,team.organizationId,team.name,team.shortName,team.city,team.primaryColor,team.secondaryColor,team.address||"",team.phone||"",team.email||"",team.contactName||"",team.website||"",team.description||"",team.clubManagerUserId||null,team.crestKey||null,team.coverKey||null,team.sponsorLogoKey||null,now,now),
          db.prepare("UPDATE teams SET club_id=?,squad_name=COALESCE(squad_name,'Squadra principale'),updated_at=? WHERE id=?").bind(clubId,now,id),
        ]);
      }
      const duplicate=await db.prepare("SELECT id FROM teams WHERE club_id=? AND lower(COALESCE(squad_name,''))=lower(?) LIMIT 1").bind(clubId,squadName).first();
      if(duplicate)return Response.json({error:"Questa squadra esiste già nella società"},{status:409});
      const squadId=crypto.randomUUID(),displayName=`${team.name} ${squadName}`;
      await db.prepare("INSERT INTO teams (id,organization_id,club_id,squad_name,birth_year,coach_name,name,short_name,city,primary_color,secondary_color,club_manager_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(squadId,team.organizationId,clubId,squadName,birthYear,String(body.coachName||""),displayName,team.shortName,team.city,team.primaryColor,team.secondaryColor,team.clubManagerUserId||null,now,now).run();
      await appendAudit({userId:current.userId,role,action:"squad.created",entityType:"team",entityId:squadId,payload:{clubId,squadName,birthYear}});
      return Response.json({ok:true,id:squadId},{status:201});
    }
    if(body.action==="update_player_profile"){
      const playerId=String(body.playerId||"");
      const visibility=["private","team","public"].includes(body.profileVisibility)?body.profileVisibility:"private";
      const consent=Boolean(body.mediaConsent);
      if(visibility==="public"&&!consent)return Response.json({error:"Per la pubblicazione serve il consenso media"},{status:400});
      await db.prepare("UPDATE players SET public_name=?,bio=?,preferred_foot=?,profile_visibility=?,media_consent=?,updated_at=? WHERE id=? AND team_id=?").bind(String(body.publicName||""),String(body.bio||""),String(body.preferredFoot||""),visibility,consent?1:0,now,playerId,id).run();
      await appendAudit({userId:current.userId,role,action:"player.profile_updated",entityType:"player",entityId:playerId,payload:{visibility,mediaConsent:consent}});
      return Response.json({ok:true});
    }
    if(body.action==="save_player_stats"){
      const playerId=String(body.playerId||""),tournamentId=String(body.tournamentId||"");
      const valid=await db.prepare("SELECT p.id FROM players p JOIN tournament_teams tt ON tt.team_id=p.team_id WHERE p.id=? AND p.team_id=? AND tt.tournament_id=? LIMIT 1").bind(playerId,id,tournamentId).first();
      if(!valid)return Response.json({error:"Atleta o torneo non valido"},{status:400});
      const n=(value:unknown)=>Math.max(0,Number(value)||0);
      await db.prepare("INSERT INTO player_tournament_stats (id,player_id,tournament_id,appearances,goals,assists,clean_sheets,mvp_awards,yellow_cards,red_cards,minutes_played,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(player_id,tournament_id) DO UPDATE SET appearances=excluded.appearances,goals=excluded.goals,assists=excluded.assists,clean_sheets=excluded.clean_sheets,mvp_awards=excluded.mvp_awards,yellow_cards=excluded.yellow_cards,red_cards=excluded.red_cards,minutes_played=excluded.minutes_played,updated_at=excluded.updated_at").bind(crypto.randomUUID(),playerId,tournamentId,n(body.appearances),n(body.goals),n(body.assists),n(body.cleanSheets),n(body.mvpAwards),n(body.yellowCards),n(body.redCards),n(body.minutesPlayed),now).run();
      await appendAudit({tournamentId,userId:current.userId,role,action:"player.stats_updated",entityType:"player",entityId:playerId});
      return Response.json({ok:true});
    }
    if(body.action==="add_milestone"){
      const playerId=String(body.playerId||""),title=String(body.title||"").trim();
      const valid=await db.prepare("SELECT id FROM players WHERE id=? AND team_id=?").bind(playerId,id).first();
      if(!valid||title.length<3)return Response.json({error:"Traguardo non valido"},{status:400});
      const milestoneId=crypto.randomUUID();
      await db.prepare("INSERT INTO player_milestones (id,player_id,tournament_id,type,title,description,happened_at,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(milestoneId,playerId,body.tournamentId||null,String(body.type||"milestone"),title,String(body.description||""),String(body.happenedAt||now),current.userId,now).run();
      await appendAudit({tournamentId:body.tournamentId||undefined,userId:current.userId,role,action:"player.milestone_created",entityType:"player_milestone",entityId:milestoneId,payload:{playerId}});
      return Response.json({ok:true},{status:201});
    }
    if (body.action !== "add_player") return Response.json({ error: "Operazione non valida" }, { status: 400 });
    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();
    const birthYear = Number(body.birthYear);
    const shirtNumber = body.shirtNumber ? Number(body.shirtNumber) : null;
    if (!firstName || !lastName || birthYear < 2008 || birthYear > 2022)
      return Response.json({ error: "Dati giocatore non validi" }, { status: 400 });
    const playerId = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO players (id,team_id,first_name,last_name,birth_year,shirt_number,role,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        playerId,
        id,
        firstName,
        lastName,
        birthYear,
        shirtNumber,
        String(body.role || "Giocatore"),
        "active",
        now,
        now,
      )
      .run();
    await appendAudit({
      userId: current.userId,
      role,
      action: "player.created",
      entityType: "player",
      entityId: playerId,
      payload: { teamId: id },
    });
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
