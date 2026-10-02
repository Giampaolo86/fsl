import io
import secrets
from collections import defaultdict
from urllib.parse import quote_plus

from fastapi import APIRouter, Depends, Request, Response
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from pydantic import BaseModel, Field

from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import bad_request, forbidden, not_found
from ..models.domain import HospitalityBooking
from ..repositories.registry import scoped, settings_repo, tournaments
from ..services import audit

router = APIRouter(prefix="/tournaments/{tournament_id}/hospitality", tags=["hospitality"])
public_router = APIRouter(prefix="/public/tournaments/{slug}/hospitality", tags=["hospitality"])
OPS = {"super_admin", "director", "secretary"}

PRESETS = [
    {"key": "lodging", "label": "Pernotto atleti", "audience": "athletes", "unit": "a notte / persona", "lodging": True},
    {"key": "lunch", "label": "Pranzo atleti", "audience": "athletes", "unit": "a pasto"},
    {"key": "dinner", "label": "Cena atleti", "audience": "athletes", "unit": "a pasto"},
    {"key": "parent_lunch", "label": "Pranzo genitore", "audience": "parents", "unit": "a pasto"},
    {"key": "parent_dinner", "label": "Cena genitore", "audience": "parents", "unit": "a pasto"},
    {"key": "parent_lodging", "label": "Pernotto genitore", "audience": "parents", "unit": "a notte / persona", "lodging": True},
    {"key": "transport", "label": "Trasporto pullman", "audience": "all", "unit": "a persona", "transport": True},
]


def normalize(items: list[dict]) -> list[dict]:
    """Lista libera di servizi/pacchetti (compat: vecchi preset senza label). Genera il link Maps dall'indirizzo."""
    presets = {p["key"]: p for p in PRESETS}
    out = []
    for raw in items or []:
        if not raw.get("key"):
            continue
        base = presets.get(raw["key"], {})
        it = {"label": "", "audience": "all", "unit": "a persona", "includes": [], "enabled": True, "price": 0, "description": "", "venue_name": "", "address": "", "maps_url": "", "when": "", "notes": "", **base, **raw}
        if not it["includes"]:
            it["includes"] = [k for k, flag in (("lodging", base.get("lodging")), ("transport", base.get("transport"))) if flag] or (["lunch"] if "lunch" in it["key"] else ["dinner"] if "dinner" in it["key"] else [])
        it["lodging"] = "lodging" in it["includes"]
        it["transport"] = "transport" in it["includes"]
        if not it.get("maps_url") and it.get("address"):
            it["maps_url"] = f"https://www.google.com/maps/search/?api=1&query={quote_plus(it['address'])}"
        out.append(it)
    return out


async def _items(tournament_id: str):
    s = await settings_repo.find_one({"tournament_id": tournament_id})
    return normalize(s.hospitality if s else [])


class BookingLine(BaseModel):
    key: str
    qty: int = Field(ge=1, le=500)


class BookingIn(BaseModel):
    items: list[BookingLine]
    name: str = ""
    email: str = ""
    phone: str = ""
    note: str = ""


class StatusIn(BaseModel):
    status: str


async def _visible_to(t, request: Request) -> bool:
    """«clubs» = solo società (loggate) e staff; «all» = anche genitori e pubblico."""
    from .public import _staff

    s = await settings_repo.find_one({"tournament_id": t.id})
    if (s.hospitality_visibility if s else "clubs") == "all":
        return True
    user = await _staff(request)
    return bool(user and user.role_in(t.id) == "club_manager")


@public_router.get("")
async def public_items(slug: str, request: Request):
    t = await tournaments.find_one({"slug": slug})
    if not t:
        raise not_found("Torneo")
    if not await _visible_to(t, request):
        return []
    return [i for i in await _items(t.id) if i["enabled"]]


@public_router.post("/bookings", status_code=201)
async def public_book(slug: str, body: BookingIn, request: Request):
    from .public import _staff

    t = await tournaments.find_one({"slug": slug})
    if not t:
        raise not_found("Torneo")
    if not body.items:
        raise bad_request("Seleziona almeno un servizio")
    if not await _visible_to(t, request):
        raise bad_request("Le prenotazioni di ospitalità sono riservate alle società: accedi all'Area Società")
    user = await _staff(request)
    club = None
    booker = "guest"
    if user:
        booker = "fan"
        cid = user.club_in(t.id)
        if cid and user.role_in(t.id) == "club_manager":
            club = await scoped("clubs", t.id).get(cid)
            booker = "club"
    name = body.name.strip() or (user.full_name if user else "")
    email = body.email.strip() or (user.email if user else "")
    if not name or not (email or body.phone.strip()):
        raise bad_request("Indica nome e almeno un contatto (email o telefono)")
    items = {i["key"]: i for i in await _items(t.id) if i["enabled"]}
    repo = scoped("hospitality_bookings", t.id)
    code = f"OSP-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}"
    created = []
    for line in body.items:
        it = items.get(line.key)
        if not it:
            raise bad_request(f"Servizio non disponibile: {line.key}")
        b = HospitalityBooking(tournament_id=t.id, code=code, item_key=it["key"], item_label=it["label"], qty=line.qty, unit_price=float(it.get("price") or 0), booker_type=booker, club_id=club.id if club else None, club_name=club.name if club else "", user_id=user.id if user else None, name=name, email=email, phone=body.phone.strip(), note=body.note.strip())
        created.append((await repo.insert(b, user.id if user else None)).public())
    return {"code": code, "bookings": created, "total": sum(b["qty"] * b["unit_price"] for b in created)}


@public_router.get("/bookings/mine")
async def my_bookings(slug: str, request: Request):
    from .public import _staff

    t = await tournaments.find_one({"slug": slug})
    user = await _staff(request)
    if not t or not user:
        return []
    cid = user.club_in(t.id)
    f = {"club_id": cid} if cid else {"user_id": user.id}
    return [b.public() for b in await scoped("hospitality_bookings", t.id).list(f, sort=[("created_at", -1)], limit=500)]


def _totals(bookings):
    per_item, per_club = defaultdict(lambda: {"qty": 0, "amount": 0.0, "bookings": 0}), defaultdict(lambda: {"qty": 0, "amount": 0.0})
    for b in bookings:
        if b.status == "cancelled":
            continue
        a = b.qty * b.unit_price
        per_item[b.item_key]["label"] = b.item_label
        per_item[b.item_key]["qty"] += b.qty
        per_item[b.item_key]["amount"] += a
        per_item[b.item_key]["bookings"] += 1
        who = b.club_name or b.name or "Ospite"
        per_club[who]["qty"] += b.qty
        per_club[who]["amount"] += a
    return {"per_item": [{"key": k, **v} for k, v in per_item.items()], "per_club": [{"name": k, **v} for k, v in sorted(per_club.items())]}


@router.get("/bookings")
async def list_bookings(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user)
    f = {}
    if role == "club_manager":
        f = {"club_id": user.club_in(tournament_id)}
    elif role not in OPS:
        raise forbidden()
    bs = await scoped("hospitality_bookings", tournament_id).list(f, sort=[("created_at", -1)], limit=5000)
    return {"items": await _items(tournament_id), "bookings": [b.public() for b in bs], "totals": _totals(bs)}


@router.patch("/bookings/{booking_id}")
async def patch_booking(tournament_id: str, booking_id: str, body: StatusIn, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, writable=True)
    repo = scoped("hospitality_bookings", tournament_id)
    b = await repo.get(booking_id)
    if not b:
        raise not_found("Prenotazione")
    if role == "club_manager":
        if b.club_id != user.club_in(tournament_id) or body.status != "cancelled":
            raise forbidden("Puoi solo annullare le prenotazioni della tua società")
    elif role not in OPS:
        raise forbidden()
    if body.status not in ("requested", "confirmed", "cancelled"):
        raise bad_request("Stato non valido")
    b2 = await repo.update(b.id, {"status": body.status}, user.id)
    await audit.record(user, "hospitality.status", "hospitality_booking", b.id, tournament_id, before={"status": b.status}, after={"status": body.status})
    return b2.public()


@router.get("/export")
async def export_bookings(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    t, _ = await require_tournament(tournament_id, user, roles=OPS)
    bs = await scoped("hospitality_bookings", tournament_id).list(sort=[("created_at", 1)], limit=5000)
    wb = Workbook()
    ws = wb.active
    ws.title = "Prenotazioni"
    head = Font(bold=True, color="FFFFFF")
    fill = PatternFill("solid", fgColor="0B57D9")
    cols = ["Codice", "Data", "Servizio", "Quantità", "Prezzo unitario", "Totale", "Società", "Nome", "Email", "Telefono", "Note", "Stato"]
    ws.append(cols)
    for c in ws[1]:
        c.font, c.fill = head, fill
    for b in bs:
        ws.append([b.code, (b.created_at.isoformat() if hasattr(b.created_at, "isoformat") else str(b.created_at))[:16].replace("T", " "), b.item_label, b.qty, b.unit_price, round(b.qty * b.unit_price, 2), b.club_name, b.name, b.email, b.phone, b.note, {"requested": "Richiesta", "confirmed": "Confermata", "cancelled": "Annullata"}[b.status]])
    for i, w in enumerate([16, 17, 22, 10, 14, 12, 26, 24, 28, 16, 30, 12], start=1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = w
    ws2 = wb.create_sheet("Totali")
    ws2.append(["Servizio", "Quantità", "Prenotazioni", "Importo"])
    for c in ws2[1]:
        c.font, c.fill = head, fill
    tot = _totals(bs)
    for r in tot["per_item"]:
        ws2.append([r["label"], r["qty"], r["bookings"], round(r["amount"], 2)])
    ws2.append([])
    ws2.append(["Società / prenotante", "Quantità", "", "Importo"])
    for r in tot["per_club"]:
        ws2.append([r["name"], r["qty"], "", round(r["amount"], 2)])
    buf = io.BytesIO()
    wb.save(buf)
    return Response(content=buf.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="FSL_Ospitalita_{t.slug}.xlsx"'})
