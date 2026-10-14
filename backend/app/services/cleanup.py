import re
from bson import ObjectId

from ..core.db import db

TEST_USER_PATTERNS = [r"@test\.it$", r"@fsl\.demo$", r"^test-ref-", r"^qa[._-]", r"^test_fan", r"^pw-", r"\.prova@futurestarsleague\.com$"]
_TEST_RE = __import__("re").compile("|".join(TEST_USER_PATTERNS), __import__("re").I)


def is_test_account(email: str) -> bool:
    return bool(_TEST_RE.search((email or "").lower()))


DEMO_TOURNAMENT_SLUGS = {"la-serie-a-dei-bambini", "torneo-degli-amici", "future-cup-weekend", "winter-stars-2025"}
DEMO_TOURNAMENT_NAMES = {"la serie a dei bambini", "torneo degli amici", "future cup weekend", "winter stars 2025"}
_DEMO_SLUG_RE = re.compile(r"^(" + "|".join(re.escape(s) for s in DEMO_TOURNAMENT_SLUGS) + r")(-\d+)?$", re.I)
_TEST_TOURNAMENT_RE = re.compile(r"^(test|qa|demo|prova)[-_ ]", re.I)


def is_test_tournament(slug: str, name: str = "") -> bool:
    """Tornei demo del seed (anche le copie «-2», «-3»… create da seed ripetuti) o di collaudo: mai pubblici, eliminabili in blocco."""
    return bool(_DEMO_SLUG_RE.match(slug or "")) or (name or "").strip().lower() in DEMO_TOURNAMENT_NAMES or bool(_TEST_TOURNAMENT_RE.search(slug or "")) or bool(_TEST_TOURNAMENT_RE.search(name or ""))


async def disable_test_accounts_in_production() -> list[str]:
    """In produzione gli account QA/demo/prova non devono essere utilizzabili: disabilitati e sessioni revocate."""
    import os

    if os.environ.get("APP_ENV") != "production":
        return []
    from ..models.base import utcnow

    out = []
    async for u in db.users.find({"deleted_at": None}, {"email": 1, "status": 1, "is_owner": 1}):
        if is_test_account(u["email"]) and u.get("status") == "active" and not u.get("is_owner"):
            await db.users.update_one({"_id": u["_id"]}, {"$set": {"status": "disabled", "disabled_reason": "test_account_in_production", "updated_at": utcnow()}})
            await db.sessions.update_many({"user_id": str(u["_id"]), "revoked_at": None}, {"$set": {"revoked_at": utcnow(), "revoke_reason": "test_account_in_production"}})
            out.append(u["email"])
    return out


async def demo_seed_blocked() -> bool:
    """Il seed demo non deve mai tornare: bloccato se è stato cancellato un torneo demo o se esistono tornei reali."""
    if await db.system_flags.find_one({"key": "demo_seed_disabled"}):
        return True
    return await db.tournaments.count_documents({"slug": {"$nin": list(DEMO_TOURNAMENT_SLUGS)}}) > 0


async def block_demo_seed(reason: str) -> None:
    await db.system_flags.update_one({"key": "demo_seed_disabled"}, {"$set": {"key": "demo_seed_disabled", "reason": reason, "at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()}}, upsert=True)


async def delete_tournament(tournament_id: str) -> dict:
    """Hard delete: the tournament and every document scoped to it, in every collection."""
    removed = {}
    t = await db.tournaments.find_one({"_id": ObjectId(tournament_id)}, {"slug": 1})
    if t and t.get("slug") in DEMO_TOURNAMENT_SLUGS:
        await block_demo_seed(f"torneo demo «{t['slug']}» eliminato dall'utente")
    for name in await db.list_collection_names():
        if name in ("tournaments", "schema_migrations", "backups", "security_events", "audit_logs", "stripe_events", "rate_limits"):
            continue
        r = await db[name].delete_many({"tournament_id": tournament_id})
        if r.deleted_count:
            removed[name] = r.deleted_count
    r = await db.tournaments.delete_one({"_id": ObjectId(tournament_id)})
    removed["tournaments"] = r.deleted_count
    return removed


async def purge_demo_tournaments() -> list[dict]:
    """All'avvio: elimina definitivamente i tornei demo del seed (anche archiviati e copie «-N»), con backup ripristinabile 30 giorni. Idempotente."""
    import logging

    from . import backups

    out = []
    async for t in db.tournaments.find({}, {"slug": 1, "name": 1}):
        if not is_test_tournament(t.get("slug", ""), t.get("name", "")):
            continue
        tid = str(t["_id"])
        try:
            await backups.export_tournament(tid, f"auto-purge demo {t.get('slug')}", "system")
        except Exception as e:  # noqa: BLE001
            logging.getLogger("fsl").warning("backup demo %s non riuscito: %s", t.get("slug"), e)
        removed = await delete_tournament(tid)
        out.append({"slug": t.get("slug"), "name": t.get("name"), "removed": removed})
    if out:
        await block_demo_seed("tornei demo eliminati automaticamente all'avvio")
        logging.getLogger("fsl").warning("Tornei demo eliminati all'avvio: %s", [o["slug"] for o in out])
    return out


async def delete_user(user_id: str) -> dict:
    from .owner import assert_not_owner_id

    await assert_not_owner_id(user_id, "delete")
    removed = {}
    for name in ("sessions", "tournament_memberships", "mfa_devices", "push_subscriptions", "notifications", "password_reset_tokens", "password_resets", "login_attempts"):
        r = await db[name].delete_many({"$or": [{"user_id": user_id}, {"user_id": ObjectId(user_id)}]})
        if r.deleted_count:
            removed[name] = r.deleted_count
    r = await db.users.delete_one({"_id": ObjectId(user_id)})
    removed["users"] = r.deleted_count
    await db.matches.update_many({"referee_user_id": user_id}, {"$set": {"referee_user_id": None}})
    return removed


async def delete_empty_club(club_id: str) -> bool:
    """Remove a club only if it has no teams; drops memberships and invites pointing to it."""
    if await db.teams.count_documents({"club_id": club_id}):
        return False
    r = await db.clubs.delete_one({"_id": ObjectId(club_id)})
    if r.deleted_count:
        await db.tournament_memberships.delete_many({"club_id": club_id})
        await db.club_invites.delete_many({"club_id": club_id})
    return bool(r.deleted_count)


async def purge_test_data(keep_slugs: list[str], keep_emails: list[str]) -> dict:
    """Remove every tournament not in keep_slugs, every test user, test access requests and the empty clubs they created."""
    import re

    out = {"tournaments": [], "users": [], "access_requests": 0, "clubs": []}
    async for t in db.tournaments.find({"slug": {"$nin": keep_slugs}}, {"slug": 1}):
        await delete_tournament(str(t["_id"]))
        out["tournaments"].append(t["slug"])
    pat = re.compile("|".join(TEST_USER_PATTERNS), re.I)
    async for u in db.users.find({}, {"email": 1, "is_owner": 1}):
        if u["email"] not in keep_emails and pat.search(u["email"]) and not u.get("is_owner"):
            await delete_user(str(u["_id"]))
            out["users"].append(u["email"])
    async for a in db.access_requests.find({}, {"email": 1, "club_id": 1, "club_name": 1}):
        if not pat.search(a.get("email") or ""):
            continue
        if a.get("club_id") and await delete_empty_club(a["club_id"]):
            out["clubs"].append(a.get("club_name"))
        await db.access_requests.delete_one({"_id": a["_id"]})
        out["access_requests"] += 1
    return out


async def delete_team(tournament_id: str, team_id: str) -> dict:
    """Delete a team with its roster and scheduled matches; refuse if official results exist."""
    from ..core.errors import conflict

    q = {"tournament_id": tournament_id, "$or": [{"home_team_id": team_id}, {"away_team_id": team_id}]}
    played = await db.matches.count_documents({**q, "status": {"$in": ["official", "rectified", "in_progress", "finished", "report_submitted", "under_review"]}, "deleted_at": None})
    if played:
        raise conflict(f"La squadra ha {played} gare giocate o in corso: non può essere eliminata")
    removed = {"matches": 0, "players": (await db.players.delete_many({"tournament_id": tournament_id, "team_id": team_id})).deleted_count}
    tm = await db.teams.find_one({"_id": ObjectId(team_id), "tournament_id": tournament_id})
    comp = await db.competitions.find_one({"_id": ObjectId(tm["competition_id"])}) if tm and tm.get("competition_id") else None
    if comp and comp.get("kind") != "knockout" and await db.matches.count_documents({**q, "deleted_at": None}):
        from datetime import datetime, timezone

        n = await db.teams.count_documents({"competition_id": tm["competition_id"], "placeholder": True, "deleted_at": None}) + 1
        now = datetime.now(timezone.utc)
        ph = await db.teams.insert_one({"tournament_id": tournament_id, "club_id": None, "competition_id": tm["competition_id"], "name": f"Da definire {n}", "category": tm["category"], "series": tm.get("series", ""), "placeholder": True, "qualifier": None, "status": "active", "birth_year": None, "level": "", "description": "", "proposed_by": None, "created_at": now, "updated_at": now, "deleted_at": None})
        for side in ("home_team_id", "away_team_id"):
            await db.matches.update_many({"tournament_id": tournament_id, side: team_id}, {"$set": {side: str(ph.inserted_id)}})
        removed["placeholder"] = f"Da definire {n}"
    else:
        removed["matches"] = (await db.matches.delete_many(q)).deleted_count
    removed["badges"] = (await db.player_badges.delete_many({"tournament_id": tournament_id, "team_id": team_id})).deleted_count
    removed["teams"] = (await db.teams.delete_one({"_id": ObjectId(team_id), "tournament_id": tournament_id})).deleted_count
    return removed
