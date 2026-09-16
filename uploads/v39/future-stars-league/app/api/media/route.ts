import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { appendAudit, rawDb } from "../../../db/fsl";

export const dynamic = "force-dynamic";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const videoTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key || !env.BUCKET)
    return Response.json({ error: "Media non disponibile" }, { status: 404 });
  const object = await env.BUCKET.get(key);
  if (!object)
    return Response.json({ error: "Media non trovato" }, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}

export async function POST(request: Request) {
  try {
    const current = await getChatGPTUser();
    if (!current) throw new Error("UNAUTHENTICATED");
    if (!env.BUCKET) throw new Error("STORAGE_UNAVAILABLE");
    const form = await request.formData();
    const file = form.get("file");
    const entityType = String(form.get("entityType") || "");
    const entityId = String(form.get("entityId") || "");
    const slot = String(form.get("slot") || "");
    if (!(file instanceof File) || !entityId)
      return Response.json({ error: "File mancante" }, { status: 400 });
    const isImage = imageTypes.has(file.type);
    const isVideo = videoTypes.has(file.type);
    if (!isImage && !isVideo)
      return Response.json(
        { error: "Formato non supportato. Usa JPG, PNG, WebP, MP4 o WebM" },
        { status: 415 },
      );
    const limit = isVideo ? 100 * 1024 * 1024 : 8 * 1024 * 1024;
    if (file.size > limit)
      return Response.json(
        { error: isVideo ? "Video oltre 100 MB" : "Immagine oltre 8 MB" },
        { status: 413 },
      );

    const db = rawDb();
    let organizationId = "";
    let tournamentId: string | null = null;
    let oldKey: string | null = null;
    let role = "";
    if (entityType === "team") {
      const allowedSlots: Record<string, string> = {
        crest: "crest_key",
        cover: "cover_key",
        roster: "roster_image_key",
        sponsor: "sponsor_logo_key",
      };
      const column = allowedSlots[slot];
      if (!column) return Response.json({ error: "Spazio grafico non valido" }, { status: 400 });
      const team = await db
        .prepare(
          `SELECT t.organization_id AS organizationId,COALESCE(c.club_manager_user_id,t.club_manager_user_id) AS managerId,t.${column} AS oldKey FROM teams t LEFT JOIN clubs c ON c.id=t.club_id WHERE t.id=?`,
        )
        .bind(entityId)
        .first<any>();
      if (!team) throw new Error("NOT_FOUND");
      organizationId = team.organizationId;
      oldKey = team.oldKey;
      const membership = await db
        .prepare("SELECT role FROM memberships WHERE user_id=? AND organization_id=? AND status='active' ORDER BY CASE role WHEN 'SUPER_ADMIN' THEN 1 WHEN 'SECRETARIAT' THEN 2 ELSE 3 END LIMIT 1")
        .bind(current.userId, organizationId)
        .first<{ role: string }>();
      role = membership?.role || "";
      if (!(role === "SUPER_ADMIN" || role === "SECRETARIAT" || team.managerId === current.userId))
        throw new Error("FORBIDDEN");
      const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      const key = `clubs/${entityId}/${slot}-${crypto.randomUUID()}.${extension}`;
      await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      await db.prepare(`UPDATE teams SET ${column}=?,updated_at=? WHERE id=?`).bind(key, new Date().toISOString(), entityId).run();
      if (oldKey) await env.BUCKET.delete(oldKey);
      await appendAudit({ userId: current.userId, role, action: "team.media_updated", entityType: "team", entityId, payload: { slot, key } });
      return Response.json({ ok: true, key, url: `/api/media?key=${encodeURIComponent(key)}` });
    }

    if (entityType === "player") {
      const player = await db
        .prepare("SELECT p.team_id AS teamId,p.photo_key AS oldKey,t.organization_id AS organizationId,COALESCE(c.club_manager_user_id,t.club_manager_user_id) AS managerId FROM players p JOIN teams t ON t.id=p.team_id LEFT JOIN clubs c ON c.id=t.club_id WHERE p.id=?")
        .bind(entityId)
        .first<any>();
      if (!player) throw new Error("NOT_FOUND");
      organizationId = player.organizationId;
      oldKey = player.oldKey;
      const membership = await db
        .prepare("SELECT role FROM memberships WHERE user_id=? AND organization_id=? AND status='active' ORDER BY CASE role WHEN 'SUPER_ADMIN' THEN 1 WHEN 'SECRETARIAT' THEN 2 ELSE 3 END LIMIT 1")
        .bind(current.userId, organizationId)
        .first<{ role: string }>();
      role = membership?.role || "";
      if (!(role === "SUPER_ADMIN" || role === "SECRETARIAT" || player.managerId === current.userId))
        throw new Error("FORBIDDEN");
      const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      const key = `players/${player.teamId}/${entityId}-${crypto.randomUUID()}.${extension}`;
      await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      await db.prepare("UPDATE players SET photo_key=?,updated_at=? WHERE id=?").bind(key, new Date().toISOString(), entityId).run();
      if (oldKey) await env.BUCKET.delete(oldKey);
      await appendAudit({ userId: current.userId, role, action: "player.photo_updated", entityType: "player", entityId, payload: { key } });
      return Response.json({ ok: true, key, url: `/api/media?key=${encodeURIComponent(key)}` });
    }

    if (entityType === "tournament") {
      const tournament = await db.prepare("SELECT organization_id AS organizationId FROM tournaments WHERE id=?").bind(entityId).first<any>();
      if (!tournament) throw new Error("NOT_FOUND");
      organizationId = tournament.organizationId;
      tournamentId = entityId;
      const membership = await db
        .prepare("SELECT role FROM memberships WHERE user_id=? AND organization_id=? AND status='active' AND (tournament_id IS NULL OR tournament_id=?) ORDER BY CASE role WHEN 'SUPER_ADMIN' THEN 1 WHEN 'TOURNAMENT_DIRECTOR' THEN 2 WHEN 'SECRETARIAT' THEN 3 ELSE 4 END LIMIT 1")
        .bind(current.userId, organizationId, entityId)
        .first<{ role: string }>();
      role = membership?.role || "";
      if (!["SUPER_ADMIN", "TOURNAMENT_DIRECTOR", "SECRETARIAT"].includes(role)) throw new Error("FORBIDDEN");
      const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      const key = `tournaments/${entityId}/editorial/${crypto.randomUUID()}.${extension}`;
      await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      await appendAudit({ tournamentId, userId: current.userId, role, action: "editorial.media_uploaded", entityType: "tournament", entityId, payload: { key } });
      return Response.json({ ok: true, key, url: `/api/media?key=${encodeURIComponent(key)}` });
    }
    return Response.json({ error: "Destinazione non valida" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return Response.json(
      { error: message === "UNAUTHENTICATED" ? "Autenticazione richiesta" : message === "FORBIDDEN" ? "Operazione non autorizzata" : message === "STORAGE_UNAVAILABLE" ? "Archivio media non disponibile" : "Caricamento non riuscito" },
      { status: message === "UNAUTHENTICATED" ? 401 : message === "FORBIDDEN" ? 403 : message === "NOT_FOUND" ? 404 : 500 },
    );
  }
}
