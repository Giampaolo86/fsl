from bson import ObjectId

from ..core.db import db

TEST_USER_PATTERNS = [r"@test\.it$", r"@fsl\.demo$", r"^test-ref-", r"^qa[._-]", r"^test_fan", r"^pw-"]


async def delete_tournament(tournament_id: str) -> dict:
    """Hard delete: the tournament and every document scoped to it, in every collection."""
    removed = {}
    for name in await db.list_collection_names():
        if name in ("tournaments", "schema_migrations"):
            continue
        r = await db[name].delete_many({"tournament_id": tournament_id})
        if r.deleted_count:
            removed[name] = r.deleted_count
    r = await db.tournaments.delete_one({"_id": ObjectId(tournament_id)})
    removed["tournaments"] = r.deleted_count
    return removed


async def delete_user(user_id: str) -> dict:
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
    async for u in db.users.find({}, {"email": 1}):
        if u["email"] not in keep_emails and pat.search(u["email"]):
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
    removed = {"matches": (await db.matches.delete_many(q)).deleted_count, "players": (await db.players.delete_many({"tournament_id": tournament_id, "team_id": team_id})).deleted_count}
    removed["badges"] = (await db.player_badges.delete_many({"tournament_id": tournament_id, "team_id": team_id})).deleted_count
    removed["teams"] = (await db.teams.delete_one({"_id": ObjectId(team_id), "tournament_id": tournament_id})).deleted_count
    return removed
