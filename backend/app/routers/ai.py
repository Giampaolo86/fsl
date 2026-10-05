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

Strumenti che il piano può usare (tutti opzionali, ordine di esecuzione fisso):
1. groups: {"count": N, "teams_per_group": M}  → crea N gironi da M squadre (segnaposto sostituibili). Omettere se i gironi esistono già e vanno bene.
2. calendar: {"sessions": [{"date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM"}], "fields_count": K, "match_minutes": D, "buffer_minutes": B} → genera tutte le gare dei gironi.
3. breaks: [{"date","start_time","end_time","label"}] → pause (pranzo, premiazioni…) che nessuna gara può occupare.
4. finals: {"mode": "knockout"|"placement", "teams": N, "date": "YYYY-MM-DD", "start_time": "HH:MM", "third_place": bool} → eliminazione diretta (N = 2/4/8/16) oppure tutte a premio (N pari = squadre totali).
5. extra_matches: [{"home_name","away_name","date","time","round_name","note","is_grand_final"}] → gare libere aggiuntive (es. amichevoli, spareggi).

REGOLE
- Rispondi SEMPRE in italiano, in modo breve e concreto. Fai al massimo 2 domande se mancano dati essenziali (date, squadre, campi, durata).
- Quando hai abbastanza informazioni, produci il piano. Verifica la capienza: slot per sessione = floor((fine-inizio - pause)/(durata+buffer)) × campi; gare gironi = per ogni girone M*(M-1)/2 (×2 se andata/ritorno). Se non ci stanno, dillo e proponi alternative (più campi, gare più corte, altra sessione).
- Non inventare date: se il direttore dice «sabato» senza data chiedi la data o usa quella del contesto.
- Output: testo per l'umano + alla fine, SOLO quando il piano è pronto, un blocco ```json ... ``` con {"summary": "...", "steps": [...]} dove ogni step è {"tool": "groups"|"calendar"|"breaks"|"finals"|"extra_matches", "args": {...}}. Niente JSON se stai ancora facendo domande.
- Nulla viene applicato senza il clic «Applica» del direttore: ricordaglielo solo alla fine, in una riga.
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
    message: str = Field(min_length=1, max_length=4000)


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
    chat = _llm(system, f"{tournament_id}:{body.session_id}")
    try:
        raw = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:  # noqa: BLE001
        raise bad_request(f"Assistente non disponibile: {e}")
    reply, plan = _extract_plan(raw or "")
    now = datetime.now(timezone.utc).isoformat()
    await db.ai_chats.insert_many([
        {"session_id": body.session_id, "tournament_id": tournament_id, "user_id": user.id, "role": "user", "content": body.message, "created_at": now},
        {"session_id": body.session_id, "tournament_id": tournament_id, "user_id": user.id, "role": "assistant", "content": reply, "plan": plan, "created_at": now},
    ])
    return {"reply": reply, "plan": plan}


@router.get("/tournaments/{tournament_id}/calendar/chat/{session_id}")
async def calendar_history(tournament_id: str, session_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user)
    hist = await db.ai_chats.find({"session_id": session_id, "tournament_id": tournament_id}, {"_id": 0}).sort("created_at", 1).to_list(80)
    return hist


class ApplyIn(BaseModel):
    category: Optional[str] = None
    plan: dict


@router.post("/tournaments/{tournament_id}/calendar/apply")
async def calendar_apply(tournament_id: str, body: ApplyIn, user: CurrentUser = Depends(get_current_user)):
    """Esegue il piano usando gli stessi strumenti dei pulsanti manuali; si ferma al primo errore e riporta cosa è stato fatto."""
    t, role = await require_tournament(tournament_id, user, writable=True)
    if role not in {"super_admin", "director"}:
        raise bad_request("Solo direttore o super admin possono applicare un piano")
    cat = await se._category(tournament_id, body.category)
    steps = body.plan.get("steps") or []
    done, error = [], None
    for st in steps:
        tool, args = st.get("tool"), dict(st.get("args") or {})
        try:
            if tool == "groups":
                await se.setup_groups(tournament_id, se.SetupIn(category=cat, groups=int(args["count"]), teams_per_group=int(args["teams_per_group"])), user)
                done.append(f"Gironi: {args['count']} × {args['teams_per_group']} squadre")
            elif tool == "calendar":
                sessions = [se.SessionIn(**x) for x in args.get("sessions") or []]
                res = await se.generate_calendar(tournament_id, se.CalendarIn(category=cat, sessions=sessions, fields_count=int(args.get("fields_count") or 1), match_minutes=int(args.get("match_minutes") or 25), buffer_minutes=int(args.get("buffer_minutes") if args.get("buffer_minutes") is not None else 10)), user)
                done.append(f"Calendario gironi: {res.get('count', '?')} gare")
            elif tool == "breaks":
                await se.save_breaks(tournament_id, se.BreaksIn(category=cat, breaks=[se.BreakIn(**x) for x in (args if isinstance(args, list) else args.get("items") or args.get("breaks") or [])]), user)
                done.append("Pause inserite")
            elif tool == "finals":
                res = await se.generate_finals(tournament_id, se.FinalsIn(category=cat, mode=args.get("mode") or "knockout", teams=int(args.get("teams") or 4), date=args["date"], start_time=args.get("start_time") or "09:00", third_place=bool(args.get("third_place"))), user)
                done.append(f"Fase finale: {res.get('count', '?')} gare")
            elif tool == "extra_matches":
                items = args if isinstance(args, list) else args.get("items") or []
                for x in items:
                    await se.create_match(tournament_id, se.NewMatchIn(category=cat, stage="finals", home_name=x.get("home_name", ""), away_name=x.get("away_name", ""), date=x["date"], time=x["time"], round_name=x.get("round_name", ""), note=x.get("note", ""), is_grand_final=bool(x.get("is_grand_final")), force=True), user)
                done.append(f"Gare libere: {len(items)}")
            else:
                raise ValueError(f"Strumento sconosciuto: {tool}")
        except Exception as e:  # noqa: BLE001
            detail = getattr(e, "detail", None)
            error = f"{tool}: {detail.get('message') if isinstance(detail, dict) else detail or e}"
            break
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
