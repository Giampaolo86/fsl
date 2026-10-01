import asyncio
import os

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    async for t in db.tournaments.find({}, {"name": 1, "slug": 1, "status": 1, "deleted_at": 1}):
        print("T", t["slug"], t["status"], bool(t.get("deleted_at")))
    print("users:")
    async for u in db.users.find({}, {"email": 1, "role": 1}):
        print(" ", u["email"], u.get("role"))
    print(sorted(await db.list_collection_names()))


asyncio.run(main())
