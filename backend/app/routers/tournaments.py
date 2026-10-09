from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field

from ..core.db import db
from ..core.deps import WRITE_ROLES, CurrentUser, get_current_user, require_recent_auth, require_tournament
from ..core.errors import ApiError, forbidden
from ..repositories.registry import audit_repo, memberships, scoped, settings_repo, tournaments, users
from ..services import audit, backups, cleanup
from ..services import tournaments as svc

router = APIRouter(prefix="/tournaments", tags=["tournaments"])


class CreateIn(BaseModel):
    mode: str = "scratch"
    name: str
    slug: Optional[str] = None
    payoff: str = ""
    description: str = ""
    season_label: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    template_key: Optional[str] = None
    source_id: Optional[str] = None
    copy_clubs: bool = True
    visual: Optional[dict] = None
    settings: Optional[dict] = None


class PatchIn(BaseModel):
    name: Optional[str] = None
    payoff: Optional[str] = None
    description: Optional[str] = None
    season_label: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    visual: Optional[dict] = None
    published: Optional[bool] = None
    settings: Optional[dict] = None


class StatusIn(BaseModel):
    status: str
    reason: Optional[str] = None


class ReasonIn(BaseModel):
    reason: str


async def _counts(tournament_id: str) -> dict:
    matches_total = await db.matches.count_documents({"tournament_id": tournament_id, "deleted_at": None})
    matches_official = await db.matches.count_documents({"tournament_id": tournament_id, "deleted_at": None, "status": {"$in": ["official", "rectified"]}})
    return {
        "clubs": await scoped("clubs", tournament_id).count(),
        "teams": await scoped("teams", tournament_id).count(),
        "competitions": await scoped("competitions", tournament_id).count(),
        "fields": await scoped("fields", tournament_id).count(),
        "venues": await scoped("venues", tournament_id).count(),
        "matches_total": matches_total,
        "matches_official": matches_official,
        "reports_pending": await db.matches.count_documents({"tournament_id": tournament_id, "deleted_at": None, "status": "report_submitted"}),
        "tickets_open": await db.tickets.count_documents({"tournament_id": tournament_id, "deleted_at": None, "status": {"$in": ["open", "reviewing"]}}),
        "matches_live": await db.matches.count_documents({"tournament_id": tournament_id, "deleted_at": None, "status": "in_progress"}),
        "completion_pct": round(100 * matches_official / matches_total) if matches_total else 0,
    }


async def _enrich(t, include_settings=True) -> dict:
    data = t.public()
    s = await settings_repo.find_one({"tournament_id": t.id})
    if include_settings and s:
        data["settings"] = s.public()
        data["summary"] = svc.compute_summary(s)
    elif s:
        data["settings"] = {"categories": s.categories, "series": s.series, "teams_per_series": s.teams_per_series, "fields_count": s.fields_count, "formula": s.formula}
        data["summary"] = svc.compute_summary(s)
    data["counts"] = await _counts(t.id)
    return data


def _visible_filter(user: CurrentUser) -> dict:
    if user.is_super_admin:
        return {}
    from ..repositories.base import oid

    ids = [oid(i) for i in user.tournament_ids() if oid(i)]
    return {"_id": {"$in": ids}}


@router.get("/templates")
async def templates(user: CurrentUser = Depends(get_current_user)):
    return [{"key": k, **{kk: vv for kk, vv in v.items() if kk != "settings"}, "settings": v["settings"]} for k, v in svc.TEMPLATES.items()]


def _super_admin_only(user: CurrentUser, msg: str) -> None:
    if not user.is_super_admin:
        raise forbidden(msg)


@router.get("/backups")
async def list_backups(user: CurrentUser = Depends(get_current_user)):
    _super_admin_only(user, "Riservato al Super Admin")
    return await backups.list_backups()


@router.post("/backups/{backup_id}/restore")
async def restore_backup(backup_id: str, user: CurrentUser = Depends(get_current_user)):
    _super_admin_only(user, "Riservato al Super Admin")
    await require_recent_auth(user)
    try:
        out = await backups.restore_backup(backup_id)
    except ValueError as e:
        raise ApiError(409, "RESTORE_FAILED", str(e))
    await audit.record(user, "backup.restore", "tournament", out["tournament_id"], None, after=out)
    return out


class PurgeIn(BaseModel):
    keep_slugs: list[str] = Field(min_length=1)
    keep_emails: list[str] = []


async def _purge_guard(user: CurrentUser, body: PurgeIn, request) -> None:
    from .security_events import record_event

    _super_admin_only(user, "Solo il Super Admin può eseguire la pulizia")
    if backups.db_is_production_like():
        await record_event("purge_blocked", request, user_id=user.id, email=user.email, severity="high", detail={"env": __import__("os").environ.get("APP_ENV"), "db": __import__("os").environ.get("DB_NAME")})
        raise ApiError(403, "PURGE_BLOCKED_IN_PRODUCTION", "La pulizia massiva dei dati di test è disabilitata in produzione: elimina i singoli tornei dalla card (con backup) oppure usa un ambiente di anteprima")


@router.post("/purge-test-data/preview")
async def purge_test_data_preview(body: PurgeIn, request: Request, user: CurrentUser = Depends(get_current_user)):
    """Anteprima: cosa verrebbe eliminato (nessuna modifica)."""
    await _purge_guard(user, body, request)
    ts = [{"id": str(t["_id"]), "slug": t["slug"], "name": t.get("name"), "documents": (await backups.preview_tournament(str(t["_id"])))["documents"]} async for t in db.tournaments.find({"slug": {"$nin": body.keep_slugs}}, {"slug": 1, "name": 1})]
    keep = set(e.lower() for e in body.keep_emails + [user.email])
    us = [u["email"] async for u in db.users.find({}, {"email": 1}) if u["email"] not in keep and cleanup.is_test_account(u["email"])]
    return {"tournaments": ts, "users": us, "environment": __import__("os").environ.get("APP_ENV"), "db_name": __import__("os").environ.get("DB_NAME")}


@router.post("/purge-test-data")
async def purge_test_data(body: PurgeIn, request: Request, user: CurrentUser = Depends(get_current_user)):
    """Pulizia dati di test (solo Super Admin, mai in produzione, con ri-autenticazione e backup di ogni torneo)."""
    from .security_events import record_event

    await _purge_guard(user, body, request)
    await require_recent_auth(user)
    saved = []
    async for t in db.tournaments.find({"slug": {"$nin": body.keep_slugs}}, {"slug": 1}):
        saved.append(await backups.export_tournament(str(t["_id"]), f"pre-purge {t['slug']}", user.email))
    out = await cleanup.purge_test_data(body.keep_slugs, body.keep_emails + [user.email])
    out["backups"] = saved
    await record_event("tournament_purged", request, user_id=user.id, email=user.email, severity="high", detail={"tournaments": len(out["tournaments"]), "users": len(out["users"])})
    await audit.record(user, "admin.purge_test_data", "organization", "fsl", None, after={k: v for k, v in out.items() if k != "backups"})
    return out


@router.get("/hub")
async def hub(user: CurrentUser = Depends(get_current_user)):
    ts = await tournaments.list(_visible_filter(user), sort=[("created_at", 1)])
    out = [await _enrich(t, include_settings=False) for t in ts]
    return {
        "tournaments": out,
        "stats": {
            "active": sum(1 for t in out if t["status"] == "active"),
            "draft": sum(1 for t in out if t["status"] == "draft"),
            "completed": sum(1 for t in out if t["status"] == "completed"),
            "archived": sum(1 for t in out if t["status"] == "archived"),
            "teams_total": sum(t["counts"]["teams"] for t in out if t["status"] != "archived"),
            "teams_capacity": sum(t["summary"]["teams_capacity"] for t in out if t["status"] == "active"),
            "fields_total": sum(t["counts"]["fields"] for t in out if t["status"] == "active"),
            "venues_total": sum(t["counts"]["venues"] for t in out if t["status"] == "active"),
            "matches_total": sum(t["counts"]["matches_total"] for t in out if t["status"] == "active"),
        },
    }


@router.get("")
async def list_tournaments(status: Optional[str] = None, q: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    f = _visible_filter(user)
    if status == "archived":
        f["status"] = "archived"
    elif status == "active":
        f["status"] = {"$ne": "archived"}
    elif status:
        f["status"] = status
    if q:
        f["name"] = {"$regex": q, "$options": "i"}
    ts = await tournaments.list(f, sort=[("created_at", -1)])
    return [await _enrich(t, include_settings=False) for t in ts]


@router.post("", status_code=201)
async def create(body: CreateIn, user: CurrentUser = Depends(get_current_user)):
    if not (user.is_super_admin or user.role == "director"):
        raise forbidden("Solo Super Admin e Direttore possono creare tornei")
    if body.mode == "duplicate":
        await require_tournament(body.source_id, user)
    t = await svc.create_tournament(body.model_dump(), user, mode=body.mode)
    if not user.is_super_admin:
        from ..models.domain import TournamentMembership

        await memberships.insert(TournamentMembership(user_id=user.id, tournament_id=t.id, role="director"), user.id)
    return await _enrich(t)


@router.get("/{tournament_id}")
async def get_one(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user)
    data = await _enrich(t)
    data["my_role"] = role
    data["read_only"] = t.status == "archived"
    return data


@router.get("/{tournament_id}/dashboard")
async def dashboard(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    """Home del torneo: checklist operativa, attenzioni, prossime gare e ultimi risultati."""
    from ..services import dashboard as dash

    t, _ = await require_tournament(tournament_id, user)
    return await dash.build(t, await _counts(t.id))


@router.patch("/{tournament_id}")
async def patch(tournament_id: str, body: PatchIn, user: CurrentUser = Depends(get_current_user)):
    t, _ = await require_tournament(tournament_id, user, roles=WRITE_ROLES, writable=True)
    fields = body.model_dump(exclude_none=True, exclude={"settings"})
    if fields:
        before = {k: getattr(t, k) for k in fields if hasattr(t, k)}
        if "visual" in fields:
            fields["visual"] = {**t.visual.model_dump(), **fields["visual"]}
        t = await tournaments.update(t.id, fields, user.id)
        from ..services import audit

        await audit.record(user, "tournament.update", "tournament", t.id, t.id, before={k: (v.model_dump() if hasattr(v, "model_dump") else v) for k, v in before.items()}, after=fields)
    if body.settings:
        await svc.update_settings(t, body.settings, user)
        if "fees" in body.settings:
            from ..services import pricing

            await pricing.sync_items(t.id)
    return await _enrich(t)


@router.get("/{tournament_id}/delete-preview")
async def delete_preview(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    """Anteprima dei dati che verrebbero eliminati con il torneo (solo Super Admin)."""
    _super_admin_only(user, "Solo il Super Admin può eliminare un torneo")
    t, _ = await require_tournament(tournament_id, user)
    return await backups.preview_tournament(t.id)


@router.delete("/{tournament_id}")
async def delete_tournament(tournament_id: str, request: Request, confirm: str = "", user: CurrentUser = Depends(get_current_user)):
    """Eliminazione definitiva (solo Super Admin): conferma con lo slug, identità confermata di recente, backup ripristinabile prima della cancellazione."""
    from .security_events import record_event

    _super_admin_only(user, "Solo il Super Admin può eliminare un torneo")
    t, _ = await require_tournament(tournament_id, user)
    if confirm.strip().lower() not in (t.slug.lower(), t.name.strip().lower()):
        raise ApiError(400, "CONFIRM_REQUIRED", "Per confermare digita esattamente il nome (o lo slug) del torneo", {"slug": t.slug})
    await require_recent_auth(user)
    try:
        backup = await backups.export_tournament(t.id, f"pre-delete {t.slug}", user.email)
    except Exception as e:  # noqa: BLE001
        raise ApiError(503, "BACKUP_FAILED", f"Backup non riuscito, eliminazione annullata: {e}")
    removed = await cleanup.delete_tournament(t.id)
    await record_event("tournament_purged", request, user_id=user.id, email=user.email, severity="high", detail={"slug": t.slug, "backup": backup["id"]})
    await audit.record(user, "tournament.delete", "tournament", t.id, None, before={"name": t.name, "slug": t.slug}, after={"removed": removed, "backup_id": backup["id"]})
    return {"deleted": t.slug, "removed": removed, "backup": backup}


@router.post("/{tournament_id}/status")
async def status(tournament_id: str, body: StatusIn, user: CurrentUser = Depends(get_current_user)):
    t, _ = await require_tournament(tournament_id, user, roles=WRITE_ROLES)
    t = await svc.change_status(t, body.status, user, body.reason)
    return await _enrich(t)


@router.post("/{tournament_id}/restore")
async def restore(tournament_id: str, body: ReasonIn, user: CurrentUser = Depends(get_current_user)):
    if not user.is_super_admin:
        raise forbidden("Solo il Super Admin può ripristinare un torneo archiviato")
    t, _ = await require_tournament(tournament_id, user)
    t = await svc.restore_tournament(t, user, body.reason)
    return await _enrich(t)


@router.get("/{tournament_id}/members")
async def members(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles={"super_admin", "director", "secretary"})
    ms = await memberships.list({"tournament_id": tournament_id})
    out = []
    for m in ms:
        u = await users.get(m.user_id)
        out.append({**m.public(), "user": {"email": u.email, "full_name": u.full_name} if u else None})
    return out


@router.get("/{tournament_id}/audit")
async def audit_list(tournament_id: str, limit: int = Query(100, le=500), user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles={"super_admin", "director", "secretary"})
    logs = await audit_repo.list({"tournament_id": tournament_id}, sort=[("created_at", -1)], limit=limit)
    return [l.public() for l in logs]
