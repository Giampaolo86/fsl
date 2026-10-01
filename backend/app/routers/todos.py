from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import not_found
from ..models.domain import TournamentTodo
from ..repositories.registry import scoped

router = APIRouter(prefix="/tournaments/{tournament_id}/todos", tags=["todos"])
OPS = {"super_admin", "director", "secretary"}


class TodoIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    notes: str = Field(default="", max_length=2000)
    due_date: Optional[str] = None


class TodoPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    notes: Optional[str] = Field(default=None, max_length=2000)
    due_date: Optional[str] = None
    done: Optional[bool] = None


def _sort_key(t: TournamentTodo):
    return (t.done, t.due_date or "9999", t.created_at.isoformat())


@router.get("")
async def list_todos(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=OPS)
    items = await scoped("todos", tournament_id).list({}, limit=500)
    return [t.public() for t in sorted(items, key=_sort_key)]


@router.post("", status_code=201)
async def create_todo(tournament_id: str, body: TodoIn, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=OPS, writable=True)
    t = await scoped("todos", tournament_id).insert(TournamentTodo(tournament_id=tournament_id, **body.model_dump()), user.id)
    return t.public()


@router.patch("/{todo_id}")
async def patch_todo(tournament_id: str, todo_id: str, body: TodoPatch, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=OPS, writable=True)
    repo = scoped("todos", tournament_id)
    if not await repo.get(todo_id):
        raise not_found("Attività non trovata")
    patch = body.model_dump(exclude_unset=True)
    if "done" in patch:
        patch["done_at"] = datetime.now(timezone.utc).isoformat() if patch["done"] else None
    return (await repo.update(todo_id, patch, user.id)).public()


@router.delete("/{todo_id}", status_code=204)
async def delete_todo(tournament_id: str, todo_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=OPS, writable=True)
    repo = scoped("todos", tournament_id)
    if not await repo.get(todo_id):
        raise not_found("Attività non trovata")
    await repo.soft_delete(todo_id, user.id)
