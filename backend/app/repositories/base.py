from typing import Optional, Type

from bson import ObjectId
from bson.errors import InvalidId

from ..core.db import db
from ..models.base import BaseDocument, utcnow


def oid(value: str) -> Optional[ObjectId]:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        return None


class Repository:
    """Data access layer. Domain services never touch Mongo directly."""

    def __init__(self, collection: str, model: Type[BaseDocument]):
        self.col = db[collection]
        self.model = model

    def _base_filter(self, extra: Optional[dict] = None) -> dict:
        f = {"deleted_at": None}
        if extra:
            f.update(extra)
        return f

    async def insert(self, doc: BaseDocument, actor_id: Optional[str] = None):
        doc.created_by = doc.created_by or actor_id
        doc.updated_by = actor_id
        res = await self.col.insert_one(doc.to_mongo())
        doc.id = str(res.inserted_id)
        return doc

    async def get(self, id: str, extra: Optional[dict] = None):
        _id = oid(id)
        if not _id:
            return None
        return self.model.from_mongo(await self.col.find_one(self._base_filter({"_id": _id, **(extra or {})})))

    async def find_one(self, filter: dict):
        return self.model.from_mongo(await self.col.find_one(self._base_filter(filter)))

    async def list(self, filter: Optional[dict] = None, sort=None, limit: int = 500, skip: int = 0):
        cursor = self.col.find(self._base_filter(filter))
        if sort:
            cursor = cursor.sort(sort)
        docs = await cursor.skip(skip).limit(limit).to_list(limit)
        return [self.model.from_mongo(d) for d in docs]

    async def count(self, filter: Optional[dict] = None) -> int:
        return await self.col.count_documents(self._base_filter(filter))

    async def update(self, id: str, patch: dict, actor_id: Optional[str] = None):
        patch = {**patch, "updated_at": utcnow(), "updated_by": actor_id}
        await self.col.update_one({"_id": oid(id)}, {"$set": patch})
        return await self.get(id)

    async def update_versioned(self, id: str, expected_version: int, patch: dict, actor_id: Optional[str] = None):
        patch = {**patch, "updated_at": utcnow(), "updated_by": actor_id}
        res = await self.col.find_one_and_update(
            {"_id": oid(id), "version": expected_version},
            {"$set": patch, "$inc": {"version": 1}},
            return_document=True,
        )
        return self.model.from_mongo(res)

    async def soft_delete(self, id: str, actor_id: Optional[str] = None):
        await self.col.update_one({"_id": oid(id)}, {"$set": {"deleted_at": utcnow(), "updated_by": actor_id}})


class ScopedRepository(Repository):
    """Every query is forced inside a single tournament: no cross-tournament leaks."""

    def __init__(self, collection: str, model: Type[BaseDocument], tournament_id: str):
        super().__init__(collection, model)
        self.tournament_id = tournament_id

    def _base_filter(self, extra: Optional[dict] = None) -> dict:
        return super()._base_filter({"tournament_id": self.tournament_id, **(extra or {})})

    async def insert(self, doc: BaseDocument, actor_id: Optional[str] = None):
        if getattr(doc, "tournament_id", None) != self.tournament_id:
            raise ValueError("tournament_id mismatch")
        return await super().insert(doc, actor_id)
