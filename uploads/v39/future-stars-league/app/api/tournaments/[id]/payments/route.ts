import { getChatGPTUser } from "../../../../chatgpt-auth";
import { appendAudit, rawDb } from "../../../../../db/fsl";

export const dynamic = "force-dynamic";

async function context(id:string){
  const current=await getChatGPTUser();
  if(!current)throw new Error("UNAUTHENTICATED");
  const db=rawDb();
  const tournament=await db.prepare("SELECT id,organization_id AS organizationId,name,edition FROM tournaments WHERE id=?").bind(id).first<any>();
  if(!tournament)throw new Error("NOT_FOUND");
  const membership=await db.prepare("SELECT role FROM memberships WHERE user_id=? AND organization_id=? AND status='active' AND (tournament_id IS NULL OR tournament_id=?) ORDER BY CASE role WHEN 'SUPER_ADMIN' THEN 1 WHEN 'TOURNAMENT_DIRECTOR' THEN 2 WHEN 'SECRETARIAT' THEN 3 ELSE 4 END LIMIT 1").bind(current.userId,tournament.organizationId,id).first<{role:string}>();
  if(!membership||membership.role==="REFEREE")throw new Error("FORBIDDEN");
  let managedTeamIds:string[]=[];
  if(membership.role==="CLUB_MANAGER"){
    const managed=await db.prepare("SELECT t.id FROM teams t LEFT JOIN clubs c ON c.id=t.club_id WHERE t.organization_id=? AND COALESCE(c.club_manager_user_id,t.club_manager_user_id)=?").bind(tournament.organizationId,current.userId).all<{id:string}>();
    managedTeamIds=managed.results.map(row=>row.id);
  }
  return {current,tournament,role:membership.role,managedTeamIds};
}

function failure(error:unknown){
  const message=error instanceof Error?error.message:"";
  return Response.json({error:message==="UNAUTHENTICATED"?"Autenticazione richiesta":message==="NOT_FOUND"?"Torneo non trovato":message==="FORBIDDEN"?"Operazione non autorizzata":"Operazione economica non riuscita"},{status:message==="UNAUTHENTICATED"?401:message==="NOT_FOUND"?404:message==="FORBIDDEN"?403:500});
}

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;const {tournament,role,managedTeamIds}=await context(id);const db=rawDb();
    const [config,teamRows,chargeRows,paidRows,matchRows,entries]=await Promise.all([
      db.prepare("SELECT match_fee_cents AS matchFeeCents FROM tournament_configs WHERE tournament_id=?").bind(id).first<any>(),
      db.prepare("SELECT t.id AS teamId,t.name AS teamName,t.short_name AS shortName,t.primary_color AS primaryColor FROM tournament_teams tt JOIN teams t ON t.id=tt.team_id WHERE tt.tournament_id=? AND tt.status!='withdrawn' GROUP BY t.id,t.name,t.short_name,t.primary_color ORDER BY t.name").bind(id).all<any>(),
      db.prepare("SELECT pc.team_id AS teamId,COUNT(*) AS callups,COALESCE(SUM(pc.amount_cents),0) AS dueCents FROM payment_charges pc JOIN matches m ON m.id=pc.match_id WHERE pc.tournament_id=? AND m.status NOT IN ('cancelled','postponed') GROUP BY pc.team_id").bind(id).all<any>(),
      db.prepare("SELECT team_id AS teamId,COALESCE(SUM(amount_cents),0) AS paidCents FROM payment_entries WHERE tournament_id=? GROUP BY team_id").bind(id).all<any>(),
      db.prepare("WITH charges AS (SELECT match_id,team_id,COUNT(*) AS callups,SUM(amount_cents) AS dueCents FROM payment_charges WHERE tournament_id=? GROUP BY match_id,team_id), paid AS (SELECT match_id,team_id,SUM(amount_cents) AS paidCents FROM payment_entries WHERE tournament_id=? AND match_id IS NOT NULL GROUP BY match_id,team_id) SELECT c.match_id AS matchId,c.team_id AS teamId,t.name AS teamName,CASE WHEN m.home_team_id=c.team_id THEN a.name ELSE h.name END AS opponent,m.starts_at AS startsAt,m.match_day AS matchDay,m.category,m.division,c.callups,c.dueCents,COALESCE(p.paidCents,0) AS paidCents FROM charges c JOIN matches m ON m.id=c.match_id JOIN teams t ON t.id=c.team_id JOIN teams h ON h.id=m.home_team_id JOIN teams a ON a.id=m.away_team_id LEFT JOIN paid p ON p.match_id=c.match_id AND p.team_id=c.team_id WHERE m.status NOT IN ('cancelled','postponed') ORDER BY m.starts_at,t.name").bind(id,id).all<any>(),
      db.prepare("SELECT pe.id,pe.team_id AS teamId,t.name AS teamName,pe.match_id AS matchId,h.name||' – '||a.name AS matchName,pe.amount_cents AS amountCents,pe.method,pe.reference,pe.notes,pe.paid_at AS paidAt,pe.created_at AS createdAt,COALESCE(u.full_name,u.email) AS createdByName FROM payment_entries pe JOIN teams t ON t.id=pe.team_id LEFT JOIN matches m ON m.id=pe.match_id LEFT JOIN teams h ON h.id=m.home_team_id LEFT JOIN teams a ON a.id=m.away_team_id LEFT JOIN users u ON u.id=pe.created_by WHERE pe.tournament_id=? ORDER BY pe.paid_at DESC,pe.created_at DESC").bind(id).all<any>(),
    ]);
    const allowed=new Set(managedTeamIds);
    const teams=teamRows.results.filter(row=>role!=="CLUB_MANAGER"||allowed.has(row.teamId));
    const charges=new Map(chargeRows.results.map(row=>[row.teamId,row]));
    const paid=new Map(paidRows.results.map(row=>[row.teamId,row]));
    const summary=teams.map(team=>{const charge=charges.get(team.teamId) as any;const payment=paid.get(team.teamId) as any;const dueCents=Number(charge?.dueCents||0),paidCents=Number(payment?.paidCents||0);return {...team,callups:Number(charge?.callups||0),dueCents,paidCents,balanceCents:dueCents-paidCents}});
    return Response.json({tournament,viewerRole:role,canManage:["SUPER_ADMIN","TOURNAMENT_DIRECTOR","SECRETARIAT"].includes(role),matchFeeCents:Number(config?.matchFeeCents||0),summary,matches:matchRows.results.filter(row=>role!=="CLUB_MANAGER"||allowed.has(row.teamId)),entries:entries.results.filter(row=>role!=="CLUB_MANAGER"||allowed.has(row.teamId))});
  }catch(error){return failure(error)}
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;const {current,role}=await context(id);const db=rawDb();const body=await request.json() as any;const now=new Date().toISOString();
    if(!["SUPER_ADMIN","TOURNAMENT_DIRECTOR","SECRETARIAT"].includes(role))throw new Error("FORBIDDEN");
    if(body.action==="record_payment"){
      const teamId=String(body.teamId||""),matchId=String(body.matchId||"")||null,amountCents=Math.round(Number(body.amountCents)||0);const method=["cash","bank_transfer","card","other"].includes(body.method)?body.method:"other";
      if(amountCents<=0||amountCents>100000000)return Response.json({error:"Inserisci un importo valido"},{status:400});
      const validTeam=await db.prepare("SELECT t.id FROM teams t JOIN tournament_teams tt ON tt.team_id=t.id WHERE t.id=? AND tt.tournament_id=? AND tt.status!='withdrawn' LIMIT 1").bind(teamId,id).first();if(!validTeam)return Response.json({error:"Società non valida"},{status:400});
      if(matchId){const validMatch=await db.prepare("SELECT id FROM matches WHERE id=? AND tournament_id=? AND (home_team_id=? OR away_team_id=?)").bind(matchId,id,teamId,teamId).first();if(!validMatch)return Response.json({error:"Partita non valida per questa società"},{status:400})}
      const paymentId=crypto.randomUUID();const paidAt=String(body.paidAt||now).slice(0,10);
      await db.prepare("INSERT INTO payment_entries (id,tournament_id,team_id,match_id,amount_cents,method,reference,notes,paid_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(paymentId,id,teamId,matchId,amountCents,method,String(body.reference||"").trim()||null,String(body.notes||"").trim()||null,paidAt,current.userId,now,now).run();
      await appendAudit({tournamentId:id,userId:current.userId,role,action:"payment.recorded",entityType:"payment_entry",entityId:paymentId,payload:{teamId,matchId,amountCents,method}});
      return Response.json({ok:true,id:paymentId},{status:201});
    }
    if(body.action==="delete_payment"){
      const paymentId=String(body.paymentId||"");const payment=await db.prepare("SELECT team_id AS teamId,match_id AS matchId,amount_cents AS amountCents FROM payment_entries WHERE id=? AND tournament_id=?").bind(paymentId,id).first<any>();if(!payment)return Response.json({error:"Pagamento non trovato"},{status:404});
      await db.prepare("DELETE FROM payment_entries WHERE id=? AND tournament_id=?").bind(paymentId,id).run();
      await appendAudit({tournamentId:id,userId:current.userId,role,action:"payment.deleted",entityType:"payment_entry",entityId:paymentId,payload:payment});
      return Response.json({ok:true});
    }
    return Response.json({error:"Operazione non valida"},{status:400});
  }catch(error){return failure(error)}
}
