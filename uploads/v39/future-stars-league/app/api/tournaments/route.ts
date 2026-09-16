import { getChatGPTUser } from "../../chatgpt-auth";
import { appendAudit, ensureWorkspace, rawDb, requireRole } from "../../../db/fsl";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const current = await getChatGPTUser();
  if (!current) return Response.json({ error: "Autenticazione richiesta" }, { status: 401 });
  try {
    const workspace = await ensureWorkspace({ userId: current.userId, email: current.email, displayName: current.displayName });
    const role = await requireRole(current.userId, workspace.organizationId, ["SUPER_ADMIN"]);
    const body = await request.json() as any;
    const name = String(body.name || "").trim(), edition = String(body.edition || "").trim();
    const fields = Array.isArray(body.fields) ? body.fields : [], settings = Array.isArray(body.settings) ? body.settings : [], config = body.scheduleConfig || {};
    if (name.length < 3 || name.length > 80) return Response.json({ error: "Inserisci un nome tra 3 e 80 caratteri" }, { status: 400 });
    if (!edition || edition.length > 30) return Response.json({ error: "Inserisci un'edizione valida" }, { status: 400 });
    if (!fields.length) return Response.json({ error: "Inserisci almeno un campo" }, { status: 400 });
    if (!settings.length) return Response.json({ error: "Inserisci almeno una categoria" }, { status: 400 });
    if (settings.some((row:any)=>!String(row.category||"").trim()||!String(row.division||"").trim()) || fields.some((row:any)=>!String(row.venueName||"").trim()||!String(row.fieldName||"").trim())) return Response.json({ error:"Completa nomi di categorie, sedi e campi" }, { status:400 });
    const id = crypto.randomUUID(), now = new Date().toISOString(), db = rawDb();
    const plannedTeams = settings.reduce((sum:number,row:any)=>sum+Math.max(2,Number(row.maxTeams)||2),0);
    await db.batch([
      db.prepare("INSERT INTO tournaments (id,organization_id,name,edition,status,team_count,field_count,progress,accent,is_public,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,workspace.organizationId,name,edition,"draft",plannedTeams,fields.length,0,"#1778ff",0,current.userId,now,now),
      db.prepare("INSERT INTO memberships (id,user_id,organization_id,tournament_id,role,status,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),current.userId,workspace.organizationId,id,"SUPER_ADMIN","active",now),
      db.prepare("INSERT INTO tournament_configs (tournament_id,start_date,end_date,start_time,end_time,match_minutes,buffer_minutes,match_fee_cents,active_days,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id,String(config.startDate||"2026-10-01"),String(config.endDate||"2027-05-31"),String(config.startTime||"08:30"),String(config.endTime||"13:30"),Math.max(5,Number(config.matchMinutes)||30),Math.max(0,Number(config.bufferMinutes)||0),Math.max(0,Math.round(Number(config.matchFeeCents)||0)),JSON.stringify(Array.isArray(config.activeDays)?config.activeDays:[6,0]),now),
    ]);
    for (const [index,row] of fields.entries()) await db.prepare("INSERT INTO tournament_fields (id,tournament_id,venue_name,address,field_name,field_number,active,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),id,String(row.venueName||"Sede").trim(),String(row.address||"").trim()||null,String(row.fieldName||`Campo ${index+1}`).trim(),String(row.fieldNumber||"").trim()||null,1,index,now,now).run();
    for (const row of settings) { const finalsJson=JSON.stringify(row.finalsConfig||{mode:"none",qualifiers:0,semifinalLegs:1,finalLegs:1,thirdPlace:false}); await db.prepare("INSERT INTO competition_settings (id,tournament_id,category,division,max_teams,format,finals,enabled,name,kind,finals_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),id,String(row.category||"Categoria").trim(),String(row.division||"Girone unico").trim(),Math.max(2,Math.min(200,Number(row.maxTeams)||2)),String(row.format||"Girone unico · sola andata"),String(row.finals||"Nessuna fase finale"),1,String(row.name||"Campionato").trim(),["league","knockout","league_knockout"].includes(row.kind)?row.kind:"league",finalsJson,now,now).run(); }
    await appendAudit({ tournamentId:id,userId:current.userId,role,action:"tournament.created",entityType:"tournament",entityId:id,payload:{name,edition,fields:fields.length,competitions:settings.length} });
    return Response.json({ tournament:{id,name,edition,status:"draft",teamCount:plannedTeams,fieldCount:fields.length,progress:0,accent:"#1778ff"} }, { status:201 });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return Response.json({ error:"Operazione non autorizzata" }, { status:403 });
    return Response.json({ error:"Impossibile creare il torneo" }, { status:500 });
  }
}
