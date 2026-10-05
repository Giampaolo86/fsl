import asyncio
import os
import secrets
import sys

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

from app.core.db import db  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.base import utcnow  # noqa: E402
from app.models.domain import TournamentMembership, User  # noqa: E402
from app.repositories.registry import memberships, users  # noqa: E402
from app.services.cleanup import purge_test_data  # noqa: E402

CLUB_EMAIL, REF_EMAIL = "societa.prova@futurestarsleague.com", "arbitro.prova@futurestarsleague.com"


def pwd(prefix):
    return f"{prefix}-{secrets.token_hex(3)}-FSL{secrets.randbelow(90) + 10}"


async def ensure(email, full_name, role, password):
    u = await users.find_one({"email": email})
    if u:
        await users.update(u.id, {"password_hash": hash_password(password), "must_change_password": False, "status": "active"})
        return u
    return await users.insert(User(email=email, password_hash=hash_password(password), full_name=full_name, role=role, must_change_password=False))


async def main():
    tid = str((await db.tournaments.find_one({"slug": "la-serie-a-dei-bambini"}))["_id"])
    club = await db.clubs.find_one({"tournament_id": tid, "name": "Sporting Eur"})
    club_pwd, ref_pwd = pwd("Societa"), pwd("Arbitro")
    cm = await ensure(CLUB_EMAIL, "Responsabile Sporting Eur (prova)", "club_manager", club_pwd)
    rf = await ensure(REF_EMAIL, "Arbitro FSL (prova)", "referee", ref_pwd)
    if not await memberships.find_one({"user_id": cm.id, "tournament_id": tid}):
        await memberships.insert(TournamentMembership(user_id=cm.id, tournament_id=tid, role="club_manager", club_id=str(club["_id"])))
    async for t in db.tournaments.find({}, {"_id": 1}):
        t_id = str(t["_id"])
        if not await memberships.find_one({"user_id": rf.id, "tournament_id": t_id}):
            await memberships.insert(TournamentMembership(user_id=rf.id, tournament_id=t_id, role="referee"))
    old_ref = await db.users.find_one({"email": "arbitro@fsl.demo"})
    moved = 0
    if old_ref:
        moved = (await db.matches.update_many({"referee_user_id": str(old_ref["_id"])}, {"$set": {"referee_user_id": rf.id, "updated_at": utcnow()}})).modified_count
    keep = ["la-serie-a-dei-bambini", "torneo-degli-amici", "future-cup-weekend"]
    out = await purge_test_data(keep, [CLUB_EMAIL, REF_EMAIL])
    print("PURGE", out)
    print("MATCHES_REASSIGNED", moved)
    print("CLUB_LOGIN", CLUB_EMAIL, club_pwd)
    print("REF_LOGIN", REF_EMAIL, ref_pwd)
    print("USERS_LEFT", [u["email"] async for u in db.users.find({}, {"email": 1})])
    print("ACCESS_REQ_LEFT", await db.access_requests.count_documents({}))
    print("QA_CLUBS_LEFT", [c["name"] async for c in db.clubs.find({"name": {"$regex": "^(QA|Nuova Polisportiva)"}}, {"name": 1})])


asyncio.run(main())
