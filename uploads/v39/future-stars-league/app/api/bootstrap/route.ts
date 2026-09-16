import { getChatGPTUser } from "../../chatgpt-auth";
import { ensureWorkspace, rawDb } from "../../../db/fsl";
export const dynamic = "force-dynamic";
export async function GET() {
  const current = await getChatGPTUser();
  if (!current)
    return Response.json(
      { error: "Autenticazione richiesta" },
      { status: 401 },
    );
  try {
    const workspace = await ensureWorkspace({
      userId: current.userId,
      email: current.email,
      displayName: current.displayName,
    });
    const result =
      workspace.role === "SUPER_ADMIN"
        ? await rawDb()
            .prepare(
              "SELECT t.id,t.name,t.edition,t.status,t.team_count AS teamCount,t.field_count AS fieldCount,t.progress,t.accent,(SELECT COUNT(*) FROM matches x WHERE x.tournament_id=t.id) AS matchCount,(SELECT COUNT(*) FROM matches x WHERE x.tournament_id=t.id AND x.status IN ('official','rectified')) AS playedCount,(SELECT COUNT(*) FROM matches x WHERE x.tournament_id=t.id AND julianday(x.starts_at) BETWEEN julianday('now') AND julianday('now','+7 days')) AS upcomingCount FROM tournaments t WHERE t.organization_id=? ORDER BY CASE t.status WHEN 'active' THEN 1 WHEN 'draft' THEN 2 WHEN 'completed' THEN 3 ELSE 4 END,t.created_at DESC",
            )
            .bind(workspace.organizationId)
            .all()
        : await rawDb()
            .prepare(
              "SELECT DISTINCT t.id,t.name,t.edition,t.status,t.team_count AS teamCount,t.field_count AS fieldCount,t.progress,t.accent,(SELECT COUNT(*) FROM matches x WHERE x.tournament_id=t.id) AS matchCount,(SELECT COUNT(*) FROM matches x WHERE x.tournament_id=t.id AND x.status IN ('official','rectified')) AS playedCount,(SELECT COUNT(*) FROM matches x WHERE x.tournament_id=t.id AND julianday(x.starts_at) BETWEEN julianday('now') AND julianday('now','+7 days')) AS upcomingCount FROM tournaments t JOIN memberships m ON m.tournament_id=t.id WHERE m.user_id=? AND m.status='active' ORDER BY t.created_at DESC",
            )
            .bind(current.userId)
            .all();
    return Response.json({
      user: {
        id: current.userId,
        name: current.displayName,
        email: current.email,
        role: workspace.role,
      },
      tournaments: result.results,
    });
  } catch {
    return Response.json(
      { error: "I dati non sono disponibili in questo momento" },
      { status: 503 },
    );
  }
}
