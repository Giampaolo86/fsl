"""Assistente IA FSL: «Cervello» (brand book) + assistente calendario che propone un piano e lo applica solo su conferma."""
import json
import os
import re
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..core.db import db
from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import bad_request
from ..repositories.registry import scoped
from ..repositories.registry import settings_repo
from . import simple_engine as se

router = APIRouter(prefix="/ai", tags=["ai"])
MODEL = ("anthropic", "claude-sonnet-5-5")
STAFF = {"super_admin", "director", "secretary"}

DEFAULT_BRAIN = """# Cervello FSL — Future Stars League, «La Serie A del futuro»

## Identità
FSL è una lega di calcio giovanile (bambini e ragazzi 2012–2018) con l'organizzazione e l'immagine della Serie A: campionati per categoria (anno di nascita) e serie (A, B), fasi finali, premiazioni, sito con classifiche, Match Center, schede giocatori, FSL Weekly.

## Tono di voce
- Italiano curato, caldo e diretto. Entusiasta ma mai urlato. Niente anglicismi inutili.
- I bambini sono i protagonisti: si parla di gioco, coraggio, amicizia, crescita. Mai di «fenomeni», mai pressione sul risultato.
- Rispetto per avversari, arbitri, genitori e società (Codice FSL: Competere. Crescere. Rispettare.).
- Frasi brevi, ritmo da cronaca sportiva premium. Titoli in maiuscolo stile Barlow Condensed.

## Estetica
- Dark navy (#0B1F3A / #061225) + oro (#F4AE2B) + bianco. Accenti blu elettrico (#0B57D9).
- Mood: stadio di notte, luci, erba, stemmi, numeri grandi. Premium, pulito, mai infantile né «AI slop».
- Font: Barlow Condensed per titoli e numeri, Inter per il testo.

## Regole organizzative tipiche
- Gare da 15–30 minuti con buffer 5–10 min; sessioni per giornata (es. sabato 09:00–13:00), pausa pranzo, campi numerati.
- Gironi all'italiana (sola andata o andata/ritorno); fase finale a eliminazione diretta oppure «tutte a premio» (finali di piazzamento 1°/2°, 3°/4°, 5°/6°…), finalissima per ultima.
- Una squadra non gioca mai due gare sovrapposte; tra due gare della stessa squadra meglio almeno uno slot di riposo.
"""

CAL_SYSTEM = """Sei l'assistente calendario di Future Stars League. Aiuti il direttore a trasformare la descrizione a parole di un torneo in un PIANO concreto che il software applicherà.

Strumenti che il piano può usare (tutti opzionali; ordine di esecuzione fisso: groups → breaks → calendar → finals → extra_matches, quindi le pause vengono rispettate dal calendario):
1. groups: {"count": N, "teams_per_group": M}  → crea N gironi da M squadre (segnaposto sostituibili). Omettere se i gironi esistono già e vanno bene.
2. calendar: {"sessions": [{"date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM"}], "fields_count": K, "match_minutes": D, "buffer_minutes": B} → genera tutte le gare dei gironi.
3. breaks: [{"date","start_time","end_time","label"}] → pause (tecnica, pranzo, premiazioni…): gli slot che le toccano non vengono usati da calendario e fase finale.
4. finals: {"mode": "knockout"|"placement", "teams": N, "date": "YYYY-MM-DD", "start_time": "HH:MM", "third_place": bool} → eliminazione diretta (N = 2/4/8/16) oppure tutte a premio (N pari = squadre totali).
5. extra_matches: {"replace_finals": bool, "items": [{"home_name","away_name","date","time","field","round_name","note","is_grand_final"}]} → gare libere aggiuntive (semifinali/finali con incroci personalizzati, amichevoli, spareggi). "field" è il numero del campo (1 = primo campo, 2 = secondo…) oppure il suo nome: usalo sempre quando la fonte indica il campo. "replace_finals": true elimina prima la fase finale esistente (se non ha gare già giocate), così le nuove gare la sostituiscono.
Preferisci "finals" quando la fase finale è un tabellone standard; usa "extra_matches" quando orari, incroci o nomi dei turni sono specifici (es. «1ª A vs 2ª B alle 11:05 sul Campo A»).

REGOLE
- Rispondi SEMPRE in italiano, in modo breve e concreto. Fai al massimo 2 domande se mancano dati essenziali (date, squadre, campi, durata).
- Quando hai abbastanza informazioni, produci il piano. Verifica la capienza: slot per sessione = floor((fine-inizio - pause)/(durata+buffer)) × campi; gare gironi = per ogni girone M*(M-1)/2 (×2 se andata/ritorno). Se non ci stanno, dillo e proponi alternative (più campi, gare più corte, altra sessione).
- Non inventare date: se il direttore dice «sabato» senza data chiedi la data o usa quella del contesto.
- Output: testo per l'umano + alla fine, SOLO quando il piano è pronto, un blocco ```json ... ``` con {"summary": "...", "steps": [...]} dove ogni step è {"tool": "groups"|"calendar"|"breaks"|"finals"|"extra_matches", "args": {...}}. Niente JSON se stai ancora facendo domande.
- Il piano SOSTITUISCE ciò che esiste per la categoria: "groups" rifà i gironi, "calendar" rigenera le gare dei gironi (se non ci sono gare già giocate). Se il direttore sta rifacendo da capo, includi tutti gli step necessari.
- Nulla viene applicato senza il clic «Applica» del direttore. Dopo l'applicazione ogni gara resta modificabile a mano (orario, campo, squadre, giorno, drag & drop): ricordaglielo in una riga alla fine.
"""


async def _brain_text() -> str:
    doc = await db.ai_brain.find_one({"key": "fsl"})
    return (doc or {}).get("text") or DEFAULT_BRAIN


@router.get("/brain")
async def get_brain(user: CurrentUser = Depends(get_current_user)):
    doc = await db.ai_brain.find_one({"key": "fsl"})
    return {"text": (doc or {}).get("text") or DEFAULT_BRAIN, "updated_at": (doc or {}).get("updated_at"), "is_default": not doc}


class BrainIn(BaseModel):
    text: str = Field(min_length=20, max_length=20000)


@router.put("/brain")
async def put_brain(body: BrainIn, user: CurrentUser = Depends(get_current_user)):
    if user.role not in ("super_admin", "director"):
        raise bad_request("Solo direttore o super admin possono modificare il Cervello FSL")
    now = datetime.now(timezone.utc).isoformat()
    await db.ai_brain.update_one({"key": "fsl"}, {"$set": {"text": body.text.strip(), "updated_at": now, "updated_by": user.id}}, upsert=True)
    return {"text": body.text.strip(), "updated_at": now, "is_default": False}


# ---------- assistente calendario ----------
class ChatIn(BaseModel):
    category: Optional[str] = None
    session_id: str = Field(min_length=6, max_length=80)
    message: str = Field(min_length=1, max_length=12000)
    display: Optional[str] = Field(default=None, max_length=400)
    images: list[str] = Field(default=[], max_length=4, description="immagini base64 (senza prefisso data:), max 4")


def _llm(system: str, session_id: str):
    from emergentintegrations.llm.chat import LlmChat

    key = os.environ["EMERGENT_LLM_KEY"]
    return LlmChat(api_key=key, session_id=session_id, system_message=system).with_model(*MODEL)


async def _context(tid: str, cat: str) -> str:
    board = await se._board(tid, cat)
    s = await settings_repo.find_one({"tournament_id": tid})
    c = board["calendar"]
    lines = [
        f"Torneo: categoria {cat}. Oggi: {datetime.now(timezone.utc).date().isoformat()}.",
        f"Gironi esistenti: " + (", ".join(f"{g['name']} ({len(g['teams'])} squadre: {', '.join(t['name'] for t in g['teams'][:12])})" for g in board["groups"]) or "nessuno"),
        f"Campi attivi: {len(board['fields'])} ({', '.join(f['name'] for f in board['fields'])}); campi usati: {c.get('fields_count')}; durata gara {c.get('match_minutes')} min, buffer {c.get('buffer_minutes')} min.",
        f"Sessioni: {c.get('sessions') or 'nessuna'}; pause: {c.get('breaks') or 'nessuna'}.",
        f"Gare gironi già create: {len(board['matches'])} (giocate: {sum(1 for m in board['matches'] if m['played'])}); gare fase finale: {len(board['finals'])}.",
        f"Date torneo: {getattr(s, 'start_date', None) or ''}",
    ]
    return "\n".join(lines)


def _extract_plan(text: str):
    m = re.search(r"```json\s*(\{.*?\})\s*```", text, re.S)
    if not m:
        return text, None
    try:
        plan = json.loads(m.group(1))
    except Exception:
        return text, None
    if not isinstance(plan, dict) or not isinstance(plan.get("steps"), list):
        return text, None
    return text[: m.start()].rstrip(), plan


@router.post("/tournaments/{tournament_id}/calendar/chat")
async def calendar_chat(tournament_id: str, body: ChatIn, user: CurrentUser = Depends(get_current_user)):
    from emergentintegrations.llm.chat import UserMessage

    t, role = await require_tournament(tournament_id, user)
    if role not in STAFF:
        raise bad_request("Assistente riservato allo staff")
    cat = await se._category(tournament_id, body.category)
    hist = await db.ai_chats.find({"session_id": body.session_id, "tournament_id": tournament_id}).sort("created_at", 1).to_list(40)
    transcript = "\n".join(f"{'Direttore' if h['role'] == 'user' else 'Assistente'}: {h['content']}" for h in hist[-16:])
    system = f"{CAL_SYSTEM}\n\n# Cervello FSL\n{await _brain_text()}\n\n# Stato attuale del torneo\n{await _context(tournament_id, cat)}"
    prompt = (f"Conversazione finora:\n{transcript}\n\n" if transcript else "") + f"Direttore: {body.message}"
    from emergentintegrations.llm.chat import ImageContent

    imgs = []
    for b64 in body.images:
        raw_b64 = b64.split(",", 1)[1] if b64.startswith("data:") else b64
        if len(raw_b64) > 6_000_000:
            raise bad_request("Immagine troppo grande: massimo ~4 MB")
        imgs.append(ImageContent(image_base64=raw_b64))
    if imgs:
        prompt += "\n\n(In allegato " + ("un'immagine" if len(imgs) == 1 else f"{len(imgs)} immagini") + " con il programma/format: leggi orari, campi, gironi, pause e squadre direttamente da lì e riportali nel piano. Se qualcosa è illeggibile, chiedi.)"
    chat = _llm(system, f"{tournament_id}:{body.session_id}")
    try:
        raw = await chat.send_message(UserMessage(text=prompt, file_contents=imgs or None))
    except Exception as e:  # noqa: BLE001
        raise bad_request(f"Assistente non disponibile: {e}")
    reply, plan = _extract_plan(raw or "")
    now = datetime.now(timezone.utc).isoformat()
    await db.ai_chats.insert_many([
        {"session_id": body.session_id, "tournament_id": tournament_id, "user_id": user.id, "role": "user", "content": (body.display or body.message) + (f"\n📎 {len(body.images)} immagine/i allegata/e" if body.images else ""), "created_at": now},
        {"session_id": body.session_id, "tournament_id": tournament_id, "user_id": user.id, "role": "assistant", "content": reply, "plan": plan, "created_at": now},
    ])
    return {"reply": reply, "plan": plan}


@router.get("/tournaments/{tournament_id}/calendar/chat/{session_id}")
async def calendar_history(tournament_id: str, session_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user)
    hist = await db.ai_chats.find({"session_id": session_id, "tournament_id": tournament_id}, {"_id": 0}).sort("created_at", 1).to_list(80)
    return hist


class OverrideIn(BaseModel):
    kind: str
    home: str
    away: str
    label: str = ""
    date: str
    time: str
    field: Optional[str] = None


class ApplyIn(BaseModel):
    category: Optional[str] = None
    plan: dict
    overrides: list[OverrideIn] = []


async def _apply_overrides(tournament_id: str, cat: str, overrides: list[OverrideIn], user) -> int:
    """Sposta le gare appena create secondo gli spostamenti fatti nell'anteprima (stesse etichette del simulatore)."""
    if not overrides:
        return 0
    teams = {t.id: t.name for t in await scoped("teams", tournament_id).list({"category": cat}, limit=2000)}
    fields = {f.name: f for f in await scoped("fields", tournament_id).list({"active": True}, sort=[("code", 1)])}
    matches_repo = scoped("matches", tournament_id)
    ms = await matches_repo.list({"category": cat, "status": {"$ne": "cancelled"}}, limit=5000)
    moved = 0
    for o in overrides:
        base = o.label.split(" · ")[0].strip().lower()
        m = next((m for m in ms if teams.get(m.home_team_id, "").strip() == o.home.strip() and teams.get(m.away_team_id, "").strip() == o.away.strip() and (not base or (m.round_name or "").strip().lower() == base)), None)
        if not m:
            continue
        f = fields.get(o.field) if o.field else None
        await matches_repo.update(m.id, {"kickoff_at": f"{o.date}T{o.time}", "field_id": f.id if f else m.field_id, "field_name": f.name if f else m.field_name}, user.id)
        moved += 1
    return moved


@router.post("/tournaments/{tournament_id}/calendar/preview")
async def calendar_preview(tournament_id: str, body: ApplyIn, user: CurrentUser = Depends(get_current_user)):
    """Simula il piano senza scrivere nulla: griglia giorno × orario × campo delle gare che verranno create."""
    await require_tournament(tournament_id, user, roles={"super_admin", "director", "secretary"})
    cat = await se._category(tournament_id, body.category)
    from ..services.plan_preview import preview_plan

    return await preview_plan(tournament_id, cat, body.plan)


@router.post("/tournaments/{tournament_id}/calendar/apply")
async def calendar_apply(tournament_id: str, body: ApplyIn, user: CurrentUser = Depends(get_current_user)):
    """Esegue il piano usando gli stessi strumenti dei pulsanti manuali; si ferma al primo errore e riporta cosa è stato fatto."""
    t, role = await require_tournament(tournament_id, user, writable=True)
    if role not in {"super_admin", "director"}:
        raise bad_request("Solo direttore o super admin possono applicare un piano")
    cat = await se._category(tournament_id, body.category)
    steps = body.plan.get("steps") or []
    done, error = [], None

    async def resolve_field(ref):
        if ref in (None, ""):
            return None
        fields = await scoped("fields", tournament_id).list({"active": True}, sort=[("code", 1)])
        if isinstance(ref, int) or str(ref).strip().isdigit():
            i = int(ref) - 1
            return fields[i].id if 0 <= i < len(fields) else None
        want = str(ref).strip().lower()
        return next((f.id for f in fields if f.name.lower() == want or f.code.lower() == want or f.name.lower().endswith(want)), None)

    async def clear_finals():
        ko = await se._knockout(tournament_id, cat)
        if not ko:
            return 0
        matches_repo, teams_repo = scoped("matches", tournament_id), scoped("teams", tournament_id)
        existing = await matches_repo.list({"competition_id": ko.id, "stage": "finals", "status": {"$ne": "cancelled"}}, limit=200)
        if any(m.status in se.PLAYED for m in existing):
            raise ValueError("La fase finale ha gare già giocate: modifica le singole partite")
        for m in existing:
            await matches_repo.soft_delete(m.id, user.id)
        for tm in await teams_repo.list({"competition_id": ko.id, "placeholder": True}, limit=200):
            await teams_repo.soft_delete(tm.id, user.id)
        return len(existing)

    order = {"groups": 0, "breaks": 1, "calendar": 2, "finals": 3, "extra_matches": 4}
    for st in sorted(steps, key=lambda x: order.get(x.get("tool"), 9)):
        tool = st.get("tool")
        raw = st.get("args")
        args = raw if isinstance(raw, dict) else {}
        items = raw if isinstance(raw, list) else (args.get("items") or args.get("breaks") or args.get("matches") or [])
        try:
            if tool == "groups":
                await se.setup_groups(tournament_id, se.SetupIn(category=cat, groups=int(args["count"]), teams_per_group=int(args["teams_per_group"])), user)
                done.append(f"Gironi: {args['count']} × {args['teams_per_group']} squadre")
            elif tool == "calendar":
                sessions = [se.SessionIn(**x) for x in args.get("sessions") or []]
                res = await se.generate_calendar(tournament_id, se.CalendarIn(category=cat, sessions=sessions, fields_count=int(args.get("fields_count") or 1), match_minutes=int(args.get("match_minutes") or 25), buffer_minutes=int(args.get("buffer_minutes") if args.get("buffer_minutes") is not None else 10)), user)
                done.append(f"Calendario gironi: {res.get('count', '?')} gare")
            elif tool == "breaks":
                await se.save_breaks(tournament_id, se.BreaksIn(category=cat, breaks=[se.BreakIn(**x) for x in items]), user)
                done.append(f"Pause inserite: {len(items)}")
            elif tool == "finals":
                res = await se.generate_finals(tournament_id, se.FinalsIn(category=cat, mode=args.get("mode") or "knockout", teams=int(args.get("teams") or 4), date=args["date"], start_time=args.get("start_time") or "09:00", third_place=bool(args.get("third_place"))), user)
                done.append(f"Fase finale: {res.get('count', '?')} gare")
            elif tool == "extra_matches":
                if args.get("replace_finals"):
                    removed = await clear_finals()
                    if removed:
                        done.append(f"Vecchia fase finale rimossa: {removed} gare")
                for x in items:
                    await se.create_match(tournament_id, se.NewMatchIn(category=cat, stage="finals", home_name=x.get("home_name", ""), away_name=x.get("away_name", ""), date=x["date"], time=x["time"], field_id=await resolve_field(x.get("field")), round_name=x.get("round_name", ""), note=x.get("note", ""), is_grand_final=bool(x.get("is_grand_final")), force=True), user)
                done.append(f"Gare libere: {len(items)}")
            else:
                raise ValueError(f"Strumento sconosciuto: {tool}")
        except Exception as e:  # noqa: BLE001
            detail = getattr(e, "detail", None)
            error = f"{tool}: {detail.get('message') if isinstance(detail, dict) else detail or e}"
            break
    if not error and done:
        moved = await _apply_overrides(tournament_id, cat, body.overrides, user)
        if moved:
            done.append(f"Spostamenti dall'anteprima: {moved}")
        await save_format(tournament_id, cat, body.plan, user.id)
    return {"done": done, "error": error, **await se._board(tournament_id, cat)}


# ---------- blog ----------
BLOG_SYSTEM = """Sei la redazione di Future Stars League. Scrivi contenuti per il sito (news, interviste, gallery, video) nel tono del Cervello FSL.
Regole: italiano curato, bambini protagonisti, rispetto per tutti, niente nomi inventati (usa solo quelli negli spunti), niente numeri inventati.
Rispondi SOLO con JSON valido: {"title": "max 70 caratteri, maiuscolo naturale", "excerpt": "sommario 1–2 frasi (max 200 caratteri)", "body": "testo in Markdown semplice con paragrafi brevi; interviste in forma domanda/risposta"}."""

TONE = {"default": "", "shorter": "Rendi il testo più corto della metà, mantenendo i fatti.", "emotional": "Rendi il testo più emozionale e caldo, con immagini concrete del campo, senza esagerare.", "formal": "Tono più istituzionale e sobrio, adatto a un comunicato."}


class BlogIn(BaseModel):
    kind: str = "news"
    notes: str = Field(default="", max_length=4000)
    tone: Literal["default", "shorter", "emotional", "formal"] = "default"
    current: dict = {}
    match_id: Optional[str] = None
    club_ids: list[str] = []


@router.post("/tournaments/{tournament_id}/blog/write")
async def blog_write(tournament_id: str, body: BlogIn, user: CurrentUser = Depends(get_current_user)):
    from emergentintegrations.llm.chat import UserMessage

    t, role = await require_tournament(tournament_id, user)
    if role not in STAFF | {"club_manager"}:
        raise bad_request("Funzione riservata a staff e società")
    ctx = []
    if body.match_id:
        m = await scoped("matches", tournament_id).get(body.match_id)
        if m:
            names = {x.id: x.name for x in await scoped("teams", tournament_id).list({"_id": {"$in": [m.home_team_id, m.away_team_id]}}, limit=2)}
            ctx.append(f"Gara: {names.get(m.home_team_id, '?')} – {names.get(m.away_team_id, '?')} · {m.round_name} · {m.kickoff_at} · risultato {m.score.get('home') if isinstance(m.score, dict) else getattr(m.score, 'home', None)}–{m.score.get('away') if isinstance(m.score, dict) else getattr(m.score, 'away', None)} · stato {m.status}")
    if body.club_ids:
        cl = await scoped("clubs", tournament_id).list({"_id": {"$in": body.club_ids}}, limit=20)
        ctx.append("Società: " + ", ".join(f"{c.name} ({c.city or ''})" for c in cl))
    cur = body.current or {}
    prompt = f"Tipo contenuto: {body.kind}. Torneo: {t.name}.\n" + ("\n".join(ctx) + "\n" if ctx else "") + (f"Spunti del redattore:\n{body.notes}\n" if body.notes.strip() else "") + (f"Bozza attuale da migliorare:\nTitolo: {cur.get('title', '')}\nSommario: {cur.get('excerpt', '')}\nTesto:\n{cur.get('body', '')}\n" if any(cur.get(k) for k in ("title", "excerpt", "body")) else "") + (TONE[body.tone] + "\n" if TONE[body.tone] else "") + "Produci il JSON."
    chat = _llm(f"{BLOG_SYSTEM}\n\n# Cervello FSL\n{await _brain_text()}", f"{tournament_id}:blog:{user.id}")
    try:
        raw = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:  # noqa: BLE001
        raise bad_request(f"Redazione IA non disponibile: {e}")
    m = re.search(r"\{.*\}", raw or "", re.S)
    try:
        out = json.loads(m.group(0)) if m else {}
    except Exception:
        out = {}
    if not out.get("body"):
        raise bad_request("L'IA non ha prodotto un testo valido: riprova con più spunti")
    return {"title": str(out.get("title", ""))[:120], "excerpt": str(out.get("excerpt", ""))[:300], "body": str(out.get("body", ""))}


# ---------- studio ----------
STUDIO_COPY_SYSTEM = """Sei l'art director/copywriter di Future Stars League. Dato un brief, proponi i testi per una grafica social nel tono del Cervello FSL.
Rispondi SOLO con JSON: {"title": "max 4 parole, d'impatto, MAIUSCOLO", "subtitle": "max 10 parole", "caption": "didascalia Instagram 1–2 frasi con 1 emoji al massimo", "hashtags": ["#FutureStarsLeague", ...max 8]}"""


class StudioCopyIn(BaseModel):
    brief: str = Field(min_length=3, max_length=1500)
    kind: str = "post"


@router.post("/tournaments/{tournament_id}/studio/copy")
async def studio_copy(tournament_id: str, body: StudioCopyIn, user: CurrentUser = Depends(get_current_user)):
    from emergentintegrations.llm.chat import UserMessage

    t, role = await require_tournament(tournament_id, user)
    if role not in STAFF | {"club_manager"}:
        raise bad_request("Funzione riservata a staff e società")
    chat = _llm(f"{STUDIO_COPY_SYSTEM}\n\n# Cervello FSL\n{await _brain_text()}", f"{tournament_id}:studio:{user.id}")
    try:
        raw = await chat.send_message(UserMessage(text=f"Formato: {body.kind}. Torneo: {t.name}. Brief: {body.brief}\nProduci il JSON."))
    except Exception as e:  # noqa: BLE001
        raise bad_request(f"IA non disponibile: {e}")
    m = re.search(r"\{.*\}", raw or "", re.S)
    try:
        return json.loads(m.group(0)) if m else {}
    except Exception:
        raise bad_request("Risposta IA non valida: riprova")


class StudioImageIn(BaseModel):
    prompt: str = Field(min_length=3, max_length=1500)
    format: Literal["square", "story", "wide"] = "square"


@router.post("/tournaments/{tournament_id}/studio/image")
async def studio_image(tournament_id: str, body: StudioImageIn, user: CurrentUser = Depends(get_current_user)):
    """Sfondo/visual generato con Gemini Nano Banana nel mood FSL, salvato tra i media del torneo."""
    import base64

    from emergentintegrations.llm.chat import LlmChat, UserMessage

    from .club_extras import _store

    t, role = await require_tournament(tournament_id, user)
    if role not in STAFF | {"club_manager"}:
        raise bad_request("Funzione riservata a staff e società")
    ratio = {"square": "quadrato 1:1", "story": "verticale 9:16 (story)", "wide": "orizzontale 16:9"}[body.format]
    brain = await _brain_text()
    style = "Stile Future Stars League: dark navy profondo e oro, luci da stadio notturno, erba, atmosfera premium e cinematografica, bambini/ragazzi solo di spalle o in silhouette, nessun volto riconoscibile, NESSUN TESTO, nessun logo, nessuna scritta."
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"{tournament_id}:img:{user.id}", system_message="Sei un generatore di immagini. Produci una sola immagine.").with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    try:
        _, images = await chat.send_message_multimodal_response(UserMessage(text=f"Genera un'immagine {ratio}. {style}\nSoggetto richiesto: {body.prompt}\nRiferimenti di brand (solo per il mood, non scrivere testo): {brain[:1200]}"))
    except Exception as e:  # noqa: BLE001
        raise bad_request(f"Generazione immagine non disponibile: {e}")
    if not images:
        raise bad_request("Nessuna immagine generata: riprova con un soggetto diverso")
    img = images[0]
    data = base64.b64decode(img["data"])
    ct = img.get("mime_type") or "image/png"
    m = await _store(tournament_id, data, ct, f"ai-studio.{ 'jpg' if 'jpeg' in ct else 'png'}", user.id, user.club_in(tournament_id))
    return {"url": f"/api/media/{m.id}", "media_id": m.id}


# ---------- formati salvati (memoria dei tornei passati) ----------
async def save_format(tournament_id: str, cat: str, plan: dict, user_id: str) -> None:
    t = await db.tournaments.find_one({"_id": __import__("bson").ObjectId(tournament_id)}, {"name": 1, "organization_id": 1})
    now = datetime.now(timezone.utc).isoformat()
    name = (plan.get("summary") or "Formato")[:140]
    await db.ai_formats.update_one(
        {"tournament_id": tournament_id, "category": cat},
        {"$set": {"name": name, "plan": plan, "tournament_name": (t or {}).get("name", ""), "organization_id": (t or {}).get("organization_id"), "updated_at": now, "updated_by": user_id}, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )


@router.get("/tournaments/{tournament_id}/calendar/formats")
async def list_formats(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    """Formati applicati in passato (in questo e negli altri tornei dell'organizzazione)."""
    t, role = await require_tournament(tournament_id, user)
    if role not in STAFF:
        raise bad_request("Riservato allo staff")
    q = {"organization_id": t.organization_id} if getattr(t, "organization_id", None) else {}
    docs = await db.ai_formats.find(q, {"_id": 0}).sort("updated_at", -1).to_list(30)
    return docs


@router.delete("/tournaments/{tournament_id}/calendar/formats/{category}")
async def delete_format(tournament_id: str, category: str, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user)
    if role not in {"super_admin", "director"}:
        raise bad_request("Riservato al direttore")
    await db.ai_formats.delete_one({"tournament_id": tournament_id, "category": category})
    return {"deleted": True}


# ---------- riscrittura inline ----------
class RewriteIn(BaseModel):
    text: str = Field(min_length=3, max_length=4000)
    instruction: str = Field(default="Riscrivi meglio, stesso significato", max_length=300)
    title: str = ""


@router.post("/tournaments/{tournament_id}/blog/rewrite")
async def blog_rewrite(tournament_id: str, body: RewriteIn, user: CurrentUser = Depends(get_current_user)):
    from emergentintegrations.llm.chat import UserMessage

    t, role = await require_tournament(tournament_id, user)
    if role not in STAFF | {"club_manager"}:
        raise bad_request("Funzione riservata a staff e società")
    system = f"Sei la redazione di Future Stars League. Riscrivi SOLO il brano fornito seguendo l'istruzione, nel tono del Cervello FSL. Non aggiungere titoli, premesse o virgolette: rispondi con il solo testo riscritto, stessa lingua, nessun fatto o nome inventato.\n\n# Cervello FSL\n{await _brain_text()}"
    chat = _llm(system, f"{tournament_id}:rewrite:{user.id}")
    try:
        raw = await chat.send_message(UserMessage(text=f"Articolo: {body.title or '—'}\nIstruzione: {body.instruction}\n\nBrano:\n{body.text}"))
    except Exception as e:  # noqa: BLE001
        raise bad_request(f"Redazione IA non disponibile: {e}")
    return {"text": (raw or "").strip().strip('"')}


# ---------- didascalie automatiche ----------
CAPTION_SYSTEM = """Sei il social media manager di Future Stars League. Per ogni gara ufficiale scrivi la didascalia Instagram/Facebook della grafica «Full Time».
Regole: tono Cervello FSL, 2–3 frasi, bambini protagonisti, complimenti a entrambe le squadre, nessun nome di bambino se non fornito, massimo 1 emoji, poi una riga vuota e 6–10 hashtag (#FutureStarsLeague sempre, poi categoria, società, torneo).
Rispondi SOLO con JSON: {"caption": "...", "hashtags": ["#...", ...]}"""


async def _caption_payload(tournament_id: str, m) -> str:
    names = {x.id: x for x in await scoped("teams", tournament_id).list({"_id": {"$in": [m.home_team_id, m.away_team_id]}}, limit=2)}
    h, a = names.get(m.home_team_id), names.get(m.away_team_id)
    sc = m.score if isinstance(m.score, dict) else (m.score.model_dump() if m.score else {})
    scorers = []
    for ev in m.events or []:
        e = ev if isinstance(ev, dict) else ev.model_dump()
        if e.get("type") == "goal" and e.get("player_name"):
            scorers.append(e["player_name"])
    t = await db.tournaments.find_one({"_id": __import__("bson").ObjectId(tournament_id)}, {"name": 1})
    return f"Torneo: {(t or {}).get('name', '')}. Categoria {m.category} · {m.series} · {m.round_name}. Gara: {h.name if h else '?'} {sc.get('home')}–{sc.get('away')} {a.name if a else '?'}" + (f" (dcr {sc.get('home_pen')}–{sc.get('away_pen')})" if sc.get("home_pen") is not None else "") + (f". Marcatori: {', '.join(scorers[:6])}" if scorers else "") + f". Finalissima: {'sì' if getattr(m, 'is_grand_final', False) else 'no'}."


async def generate_caption(tournament_id: str, match_id: str, force: bool = False) -> dict | None:
    """Genera (o restituisce) la didascalia social della gara. Chiamata in background all'ufficializzazione."""
    from emergentintegrations.llm.chat import UserMessage

    repo = scoped("matches", tournament_id)
    m = await repo.get(match_id)
    if not m:
        return None
    existing = (m.model_dump().get("social") or {})
    if existing.get("caption") and not force:
        return existing
    chat = _llm(f"{CAPTION_SYSTEM}\n\n# Cervello FSL\n{await _brain_text()}", f"{tournament_id}:caption:{match_id}")
    try:
        raw = await chat.send_message(UserMessage(text=await _caption_payload(tournament_id, m) + "\nProduci il JSON."))
        mm = re.search(r"\{.*\}", raw or "", re.S)
        out = json.loads(mm.group(0)) if mm else {}
    except Exception:  # noqa: BLE001
        return None
    if not out.get("caption"):
        return None
    social = {"caption": str(out["caption"])[:800], "hashtags": [str(h) for h in (out.get("hashtags") or [])][:12], "generated_at": datetime.now(timezone.utc).isoformat()}
    await db.matches.update_one({"_id": __import__("bson").ObjectId(match_id)}, {"$set": {"social": social}})
    return social


@router.get("/tournaments/{tournament_id}/matches/{match_id}/caption")
async def match_caption(tournament_id: str, match_id: str, regenerate: bool = False, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user)
    if role not in STAFF | {"club_manager"}:
        raise bad_request("Funzione riservata a staff e società")
    out = await generate_caption(tournament_id, match_id, force=regenerate)
    if not out:
        raise bad_request("Didascalia non disponibile: la gara deve avere un risultato")
    return out


# ---------- recap giornata (FSL Weekly) ----------
RECAP_SYSTEM = """Sei la redazione di FSL Weekly, il magazine di Future Stars League. Scrivi il recap di una giornata di campionato nel tono del Cervello FSL.
Struttura del body (Markdown leggero): un attacco di 2–3 frasi; poi «## I risultati» con una riga per gara (Squadra A 2–1 Squadra B, marcatori se forniti); «## I protagonisti» (squadre e, SOLO se forniti, i marcatori: mai inventare nomi); «## La classifica in breve» con le prime 3–4 posizioni e il quadro di coda in modo gentile; chiusura breve sul prossimo turno. Niente pressione sul risultato, complimenti anche a chi ha perso.
Rispondi SOLO con JSON: {"title": "max 70 caratteri", "excerpt": "1–2 frasi", "body": "Markdown"}"""


async def _matchday_payload(tournament_id: str, comp, match_day: int) -> tuple[str, list]:
    from ..services import engine

    ms = await scoped("matches", tournament_id).list({"competition_id": comp.id, "match_day": match_day, "stage": "qualification", "status": {"$ne": "cancelled"}}, sort=[("kickoff_at", 1)], limit=200)
    names = {x.id: x.name for x in await scoped("teams", tournament_id).list({"competition_id": comp.id}, limit=200)}
    lines = []
    for m in ms:
        sc = m.score if isinstance(m.score, dict) else (m.score.model_dump() if m.score else {})
        scorers = [((e if isinstance(e, dict) else e.model_dump())).get("player_name") for e in (m.events or []) if ((e if isinstance(e, dict) else e.model_dump())).get("type") == "goal"]
        scorers = [x for x in scorers if x]
        lines.append(f"- {names.get(m.home_team_id, '?')} {sc.get('home')}–{sc.get('away')} {names.get(m.away_team_id, '?')} ({m.status})" + (f" · gol: {', '.join(scorers)}" if scorers else ""))
    table = await engine.compute_standings(tournament_id, comp)
    tl = [f"{i + 1}. {r['name']} {r.get('PT', '')} pt" for i, r in enumerate(table[:8])]
    t = await db.tournaments.find_one({"_id": __import__("bson").ObjectId(tournament_id)}, {"name": 1})
    return (f"Torneo: {(t or {}).get('name', '')}. Competizione: {comp.name}. Giornata {match_day} di {comp.rounds}.\nGare:\n" + "\n".join(lines) + "\nClassifica dopo la giornata:\n" + "\n".join(tl)), ms


async def generate_recap(tournament_id: str, competition_id: str, match_day: int, user_id: str | None = None, force: bool = False) -> dict | None:
    """Crea (o aggiorna) la BOZZA del recap FSL Weekly della giornata; non pubblica mai da sola."""
    from emergentintegrations.llm.chat import UserMessage

    from .posts import slugify

    comp = await scoped("competitions", tournament_id).get(competition_id)
    if not comp:
        return None
    posts = scoped("posts", tournament_id)
    key = f"recap:{competition_id}:{match_day}"
    existing = await posts.find_one({"auto_key": key})
    if existing and existing.status != "draft":
        return None
    if existing and not force:
        return existing.public()
    payload, ms = await _matchday_payload(tournament_id, comp, match_day)
    chat = _llm(f"{RECAP_SYSTEM}\n\n# Cervello FSL\n{await _brain_text()}", f"{tournament_id}:recap:{key}")
    try:
        raw = await chat.send_message(UserMessage(text=payload + "\nProduci il JSON."))
        mm = re.search(r"\{.*\}", raw or "", re.S)
        out = json.loads(mm.group(0)) if mm else {}
    except Exception:  # noqa: BLE001
        return None
    if not out.get("body"):
        return None
    from ..models.domain import Post

    team_ids = sorted({m.home_team_id for m in ms} | {m.away_team_id for m in ms})
    club_ids = sorted({x.club_id for x in await scoped("teams", tournament_id).list({"_id": {"$in": team_ids}}, limit=200) if x.club_id})
    fields = {"title": str(out["title"])[:120], "excerpt": str(out.get("excerpt", ""))[:300], "body": str(out["body"]), "category": comp.category, "club_ids": club_ids, "team_ids": team_ids, "auto": True, "auto_key": key}
    if existing:
        p = await posts.update(existing.id, fields, user_id)
    else:
        base = slugify(fields["title"]) or f"recap-{match_day}"
        slug = base if not await posts.find_one({"slug": base}) else f"{base}-{match_day}"
        p = await posts.insert(Post(tournament_id=tournament_id, kind="weekly", status="draft", slug=slug, author_name="Redazione IA FSL", **fields), user_id)
    return p.public()


async def maybe_recap_after_official(tournament_id: str, m) -> None:
    """Se tutte le gare della giornata sono ufficiali, prepara la bozza del recap."""
    if m.stage != "qualification" or not m.match_day:
        return
    repo = scoped("matches", tournament_id)
    ms = await repo.list({"competition_id": m.competition_id, "match_day": m.match_day, "stage": "qualification", "status": {"$ne": "cancelled"}}, limit=200)
    if ms and all(x.status in ("official", "rectified") for x in ms):
        await generate_recap(tournament_id, m.competition_id, m.match_day, None, force=False)


class RecapIn(BaseModel):
    competition_id: str
    match_day: int = Field(ge=1, le=60)
    force: bool = True


@router.post("/tournaments/{tournament_id}/weekly/recap")
async def weekly_recap(tournament_id: str, body: RecapIn, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, writable=True)
    if role not in STAFF:
        raise bad_request("Riservato allo staff")
    p = await generate_recap(tournament_id, body.competition_id, body.match_day, user.id, force=body.force)
    if not p:
        raise bad_request("Recap non generabile: la giornata ha un recap già pubblicato oppure l'IA non ha risposto")
    return p


# ---------- recap finale del torneo ----------
FINAL_SYSTEM = """Sei la redazione di FSL Weekly. Scrivi il racconto conclusivo di una categoria del torneo Future Stars League nel tono del Cervello FSL.
Struttura del body (Markdown leggero): attacco emozionante di 3–4 frasi sulla finalissima; «## La finalissima» (racconto della gara decisiva: risultato, eventuali rigori, marcatori SOLO se forniti); «## Il podio» (1°, 2°, 3° e, se presenti, le altre posizioni delle finali di piazzamento); «## I premi» (MVP, capocannoniere e riconoscimenti SOLO se forniti, con nome e squadra come dati); «## Grazie a tutti» (chiusura: società, famiglie, arbitri, Codice FSL). Complimenti a tutte le squadre, nessuna pressione sul risultato, nessun nome inventato.
Rispondi SOLO con JSON: {"title": "max 70 caratteri", "excerpt": "1–2 frasi", "body": "Markdown"}"""


def _ord(n: int) -> str:
    return f"{n}°"


async def _final_payload(tournament_id: str, cat: str) -> tuple[str, list]:
    from .extras import awards_board

    ms = await scoped("matches", tournament_id).list({"category": cat, "stage": "finals", "status": {"$in": ["official", "rectified"]}}, sort=[("kickoff_at", 1)], limit=200)
    names = {x.id: x.name for x in await scoped("teams", tournament_id).list({"category": cat}, limit=400)}
    lines, podium = [], {}

    def sc(m):
        return m.score if isinstance(m.score, dict) else (m.score.model_dump() if m.score else {})

    def winner(m):
        s = sc(m)
        if s.get("home") is None:
            return None, None
        if s["home"] != s["away"]:
            return (m.home_team_id, m.away_team_id) if s["home"] > s["away"] else (m.away_team_id, m.home_team_id)
        if s.get("home_pen") is not None and s.get("away_pen") is not None and s["home_pen"] != s["away_pen"]:
            return (m.home_team_id, m.away_team_id) if s["home_pen"] > s["away_pen"] else (m.away_team_id, m.home_team_id)
        return None, None

    for m in ms:
        s = sc(m)
        scorers = [((e if isinstance(e, dict) else e.model_dump())).get("player_name") for e in (m.events or []) if ((e if isinstance(e, dict) else e.model_dump())).get("type") == "goal"]
        scorers = [x for x in scorers if x]
        lines.append(f"- {m.round_name}{' ★ FINALISSIMA' if m.is_grand_final else ''}: {names.get(m.home_team_id, '?')} {s.get('home')}–{s.get('away')} {names.get(m.away_team_id, '?')}" + (f" (dcr {s.get('home_pen')}–{s.get('away_pen')})" if s.get("home_pen") is not None else "") + (f" · gol: {', '.join(scorers)}" if scorers else "") + (f" · nota: {m.note}" if m.note else ""))
        w, l = winner(m)
        mm = re.search(r"(\d+)°\s*/\s*(\d+)°", m.round_name or "")
        if w and mm:
            podium[int(mm.group(1))], podium[int(mm.group(2))] = names.get(w, "?"), names.get(l, "?")
        elif w and m.is_grand_final:
            podium[1], podium[2] = names.get(w, "?"), names.get(l, "?")
        elif w and re.search(r"3|terzo", (m.round_name or "").lower()):
            podium[3], podium[4] = names.get(w, "?"), names.get(l, "?")
    pod = "\n".join(f"{_ord(k)}: {v}" for k, v in sorted(podium.items())) or "non determinabile dai risultati"
    board = (await awards_board(tournament_id))[:6]
    aw = "\n".join(f"- {r['name']} ({r.get('team', '')}): MVP {r.get('mvp', 0)}, gol {r.get('goals', 0)}, assist {r.get('assists', 0)}" for r in board) or "nessun premio registrato"
    t = await db.tournaments.find_one({"_id": __import__("bson").ObjectId(tournament_id)}, {"name": 1})
    return (f"Torneo: {(t or {}).get('name', '')}. Categoria {cat}.\nFinali ufficiali:\n" + "\n".join(lines) + f"\nPodio ricavato dai risultati:\n{pod}\nPremi individuali (dati reali dal tabellone):\n{aw}"), ms


async def generate_final_recap(tournament_id: str, cat: str, user_id: str | None = None, force: bool = False) -> dict | None:
    from emergentintegrations.llm.chat import UserMessage

    from ..models.domain import Post
    from .posts import slugify

    posts = scoped("posts", tournament_id)
    key = f"final:{cat}"
    existing = await posts.find_one({"auto_key": key})
    if existing and existing.status != "draft":
        return None
    if existing and not force:
        return existing.public()
    payload, ms = await _final_payload(tournament_id, cat)
    if not ms:
        return None
    chat = _llm(f"{FINAL_SYSTEM}\n\n# Cervello FSL\n{await _brain_text()}", f"{tournament_id}:final:{cat}")
    try:
        raw = await chat.send_message(UserMessage(text=payload + "\nProduci il JSON."))
        mm = re.search(r"\{.*\}", raw or "", re.S)
        out = json.loads(mm.group(0)) if mm else {}
    except Exception:  # noqa: BLE001
        return None
    if not out.get("body"):
        return None
    team_ids = sorted({m.home_team_id for m in ms} | {m.away_team_id for m in ms})
    club_ids = sorted({x.club_id for x in await scoped("teams", tournament_id).list({"_id": {"$in": team_ids}}, limit=200) if x.club_id})
    gf = next((m for m in ms if m.is_grand_final), None)
    fields = {"title": str(out["title"])[:120], "excerpt": str(out.get("excerpt", ""))[:300], "body": str(out["body"]), "category": cat, "club_ids": club_ids, "team_ids": team_ids, "match_id": gf.id if gf else None, "auto": True, "auto_key": key}
    if existing:
        p = await posts.update(existing.id, fields, user_id)
    else:
        base = slugify(fields["title"]) or f"finale-{cat}"
        slug = base if not await posts.find_one({"slug": base}) else f"{base}-{cat}"
        p = await posts.insert(Post(tournament_id=tournament_id, kind="weekly", status="draft", slug=slug, author_name="Redazione IA FSL", **fields), user_id)
    return p.public()


async def maybe_final_recap_after_official(tournament_id: str, m) -> None:
    if m.stage != "finals":
        return
    ms = await scoped("matches", tournament_id).list({"category": m.category, "stage": "finals", "status": {"$ne": "cancelled"}}, limit=200)
    if ms and all(x.status in ("official", "rectified") for x in ms):
        await generate_final_recap(tournament_id, m.category, None, force=False)


class FinalRecapIn(BaseModel):
    category: str
    force: bool = True


@router.post("/tournaments/{tournament_id}/weekly/final-recap")
async def weekly_final_recap(tournament_id: str, body: FinalRecapIn, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, writable=True)
    if role not in STAFF:
        raise bad_request("Riservato allo staff")
    p = await generate_final_recap(tournament_id, body.category, user.id, force=body.force)
    if not p:
        raise bad_request("Recap finale non generabile: servono finali ufficiali, oppure il recap è già pubblicato")
    return p
