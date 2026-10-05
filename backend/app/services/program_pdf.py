"""Programma ufficiale «Premium»: copertina, gironi con stemmi, programma gare, fase finale, pagina info con QR."""
import io
from datetime import datetime

import requests
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from ..repositories.registry import Repository
from ..models.domain import MediaFile
from . import storage
from .calendar_sheet import WEEKDAYS, _hhmm_add, _slot_times
from .referee_sheet import _date_it

PAGE = landscape(A4)
W, H = PAGE
FSL_LOGO = "/app/frontend/public/brand/logo.png"
THEMES = {
    "dark": {"bg": colors.HexColor("#0B1A33"), "panel": colors.HexColor("#122548"), "panel2": colors.HexColor("#0F2040"), "text": colors.white, "muted": colors.HexColor("#A7B4C8"), "gold": colors.HexColor("#F4AE2B"), "line": colors.HexColor("#2A3F66"), "brk": colors.HexColor("#3A2E12"), "head": colors.HexColor("#F4AE2B"), "headtext": colors.HexColor("#0B1A33")},
    "light": {"bg": colors.white, "panel": colors.HexColor("#F3F5F9"), "panel2": colors.HexColor("#E9EDF4"), "text": colors.HexColor("#0B1A33"), "muted": colors.HexColor("#5B6B84"), "gold": colors.HexColor("#D88913"), "line": colors.HexColor("#CBD5E1"), "brk": colors.HexColor("#FFF4D6"), "head": colors.HexColor("#0B1A33"), "headtext": colors.white},
}
ALL_SECTIONS = ["cover", "groups", "schedule", "finals", "info"]


async def load_image(url: str | None, cache: dict):
    if not url:
        return None
    if url in cache:
        return cache[url]
    data = None
    try:
        if url.startswith("/api/media/"):
            doc = await Repository("media_files", MediaFile).get(url.rsplit("/", 1)[-1])
            if doc:
                data, _ = await storage.get_object(doc.storage_path)
        elif url.startswith("http"):
            r = requests.get(url, timeout=15)
            if r.ok:
                data = r.content
        elif url.startswith("/"):
            with open(url, "rb") as fh:
                data = fh.read()
    except Exception:  # noqa: BLE001
        data = None
    cache[url] = data
    return data


def _img(data, w, h):
    if not data:
        return ""
    try:
        return Image(io.BytesIO(data), width=w, height=h, kind="proportional")
    except Exception:  # noqa: BLE001
        return ""


async def build(t, s, board: dict, venues: list, fields_all: list, opts: dict) -> bytes:
    th = THEMES.get(opts.get("style") or "dark", THEMES["dark"])
    sections = [x for x in ALL_SECTIONS if x in (opts.get("sections") or ALL_SECTIONS)]
    show_crests, show_notes = opts.get("show_crests", True), opts.get("show_notes", True)
    title = (opts.get("title") or t.name).strip()
    cat = board["category"]
    cat_label = f" · {cat}" if cat and cat != "Unica" else ""
    cache: dict = {}
    logo = await load_image(opts.get("logo_url") or FSL_LOGO, cache)
    cover = await load_image(t.visual.cover_url if t.visual else None, cache)
    crest_of = {}
    if show_crests:
        for tm in board["teams"]:
            if tm.get("crest_url"):
                crest_of[tm["id"]] = await load_image(tm["crest_url"], cache)

    def st(name, **kw):
        base = {"fontName": "Helvetica", "fontSize": 10, "leading": 12, "textColor": th["text"]}
        base.update(kw)
        return ParagraphStyle(name, **base)

    P = {
        "h1": st("h1", fontName="Helvetica-Bold", fontSize=22, leading=26),
        "h2": st("h2", fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=th["gold"]),
        "kicker": st("kicker", fontName="Helvetica-Bold", fontSize=8.5, leading=10, textColor=th["gold"]),
        "cell": st("cell", fontSize=9.5, leading=11.5, alignment=TA_CENTER),
        "cellb": st("cellb", fontName="Helvetica-Bold", fontSize=9.5, leading=11.5, alignment=TA_CENTER),
        "muted": st("muted", fontSize=8.5, leading=10.5, textColor=th["muted"], alignment=TA_CENTER),
        "mutedl": st("mutedl", fontSize=9, leading=12, textColor=th["muted"]),
        "body": st("body", fontSize=10, leading=14),
        "brk": st("brk", fontName="Helvetica-Bold", fontSize=9.5, textColor=th["gold"], alignment=TA_CENTER),
        "team": st("team", fontName="Helvetica-Bold", fontSize=10.5, leading=13),
        "club": st("club", fontSize=8.5, leading=10, textColor=th["muted"]),
    }
    public_url = opts.get("public_url") or ""

    def bg(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(th["bg"])
        canvas.rect(0, 0, W, H, fill=1, stroke=0)
        if doc.page > 1 or "cover" not in sections:
            canvas.setFillColor(th["gold"])
            canvas.rect(0, H - 4, W, 4, fill=1, stroke=0)
            canvas.setFillColor(th["muted"])
            canvas.setFont("Helvetica", 7.5)
            canvas.drawString(12 * mm, 6 * mm, f"{title}{cat_label} · Programma ufficiale · Il programma può subire variazioni: fa fede la Control Room FSL")
            canvas.drawRightString(W - 12 * mm, 6 * mm, f"Future Stars League · pag. {doc.page}")
        canvas.restoreState()

    def cover_page(canvas, doc):
        bg(canvas, doc)
        canvas.saveState()
        if cover:
            try:
                canvas.drawImage(ImageReader(io.BytesIO(cover)), 0, 0, width=W, height=H, preserveAspectRatio=True, anchor="c", mask="auto")
                canvas.setFillColor(colors.Color(0.04, 0.1, 0.2, alpha=0.72))
                canvas.rect(0, 0, W, H, fill=1, stroke=0)
            except Exception:  # noqa: BLE001
                pass
        canvas.setFillColor(th["gold"])
        canvas.rect(0, 0, W, 6, fill=1, stroke=0)
        if logo:
            try:
                canvas.drawImage(ImageReader(io.BytesIO(logo)), W - 62 * mm, H - 52 * mm, width=50 * mm, height=40 * mm, preserveAspectRatio=True, anchor="ne", mask="auto")
            except Exception:  # noqa: BLE001
                pass
        canvas.setFillColor(colors.HexColor("#F4AE2B"))
        canvas.setFont("Helvetica-Bold", 11)
        canvas.drawString(18 * mm, H - 30 * mm, "FUTURE STARS LEAGUE · PROGRAMMA UFFICIALE")
        canvas.setFillColor(colors.white if cover or th is THEMES["dark"] else th["text"])
        size = 44 if len(title) <= 22 else 34 if len(title) <= 34 else 26
        canvas.setFont("Helvetica-Bold", size)
        canvas.drawString(18 * mm, H / 2 + 6 * mm, title.upper())
        canvas.setFont("Helvetica", 16)
        sub = []
        if cat_label:
            sub.append(f"Categoria {cat}")
        if t.start_date:
            sub.append(_date_it(t.start_date) + (f" – {_date_it(t.end_date)}" if t.end_date and t.end_date != t.start_date else ""))
        if venues:
            sub.append(venues[0].name + (f", {venues[0].city}" if venues[0].city else ""))
        canvas.drawString(18 * mm, H / 2 - 6 * mm, "  ·  ".join(sub) or (t.payoff or ""))
        if t.payoff and sub:
            canvas.setFont("Helvetica-Oblique", 12)
            canvas.setFillColor(colors.HexColor("#F4AE2B"))
            canvas.drawString(18 * mm, H / 2 - 16 * mm, t.payoff)
        canvas.setFont("Helvetica", 9)
        canvas.setFillColor(colors.HexColor("#A7B4C8") if cover or th is THEMES["dark"] else th["muted"])
        canvas.drawString(18 * mm, 14 * mm, f"Generato il {_date_it(datetime.now().strftime('%Y-%m-%d'))}" + (f" · {public_url}" if public_url else ""))
        canvas.restoreState()

    story = []
    first = True

    def page_start():
        nonlocal first
        if not first:
            story.append(PageBreak())
        first = False

    if "cover" in sections:
        story.append(Spacer(1, H - 60 * mm))
        first = False

    base_style = [("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LINEBELOW", (0, 0), (-1, -2), 0.4, th["line"]), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("BACKGROUND", (0, 0), (-1, -1), th["panel"]), ("ROUNDEDCORNERS", [6, 6, 6, 6])]

    if "groups" in sections and board["groups"]:
        page_start()
        story += [Paragraph("Fase a gironi", P["kicker"]), Paragraph(f"{title}{cat_label} · Gironi", P["h1"]), Spacer(1, 6)]
        cards = []
        max_teams = max(len(g["teams"]) for g in board["groups"])
        per_row = 3 if max_teams <= 7 else 2
        inner_cols = 2 if max_teams > 8 else 1
        card_w = (W - 24 * mm) / per_row - 8 * mm
        for g in board["groups"]:
            def team_cell(tm):
                return [_img(crest_of.get(tm["id"]), 9 * mm, 9 * mm) if show_crests else "", [Paragraph(tm["name"], P["team"]), Paragraph(tm.get("club_name") or ("Segnaposto" if tm.get("placeholder") else ""), P["club"])]]
            teams_g = g["teams"]
            half = (len(teams_g) + inner_cols - 1) // inner_cols
            rows = [[Paragraph(g["name"].upper(), P["kicker"]), *[""] * (2 * inner_cols - 1)]]
            for i in range(half):
                row = []
                for c in range(inner_cols):
                    idx = i + c * half
                    row += team_cell(teams_g[idx]) if idx < len(teams_g) else ["", ""]
                rows.append(row)
            name_w = (card_w - 12 * mm * inner_cols) / inner_cols
            tb = Table(rows, colWidths=[12 * mm, name_w] * inner_cols)
            tb.setStyle(TableStyle(base_style + [("SPAN", (0, 0), (-1, 0)), ("BACKGROUND", (0, 0), (-1, 0), th["panel2"])]))
            cards.append(tb)
        grid = [cards[i : i + per_row] for i in range(0, len(cards), per_row)]
        for row in grid:
            while len(row) < per_row:
                row.append("")
            gt = Table([row], colWidths=[(W - 24 * mm) / per_row] * per_row, hAlign="LEFT")
            gt.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 10)]))
            story.append(gt)

    cal = board["calendar"]
    duration, step = cal.get("match_minutes") or 25, (cal.get("match_minutes") or 25) + (cal.get("buffer_minutes") or 0)
    fields = board["fields"][: max(cal.get("fields_count") or 1, 1)] or [{"id": None, "name": "Campo"}]
    matches = board["matches"] + board["finals"] if "schedule" in sections else []
    breaks = cal.get("breaks") or []
    by_key = {(m["kickoff_at"], m["field_id"]): m for m in matches}
    used_field_ids = {m["field_id"] for m in matches}
    fields = [f for f in board["fields"] if f["id"] in used_field_ids] or fields

    def match_cell(m):
        parts = []
        if show_crests:
            parts.append([_img(crest_of.get(m["home_team_id"]), 7 * mm, 7 * mm), Paragraph(f"<b>{m['home']}</b>", P["cell"]), Paragraph("vs", P["muted"]), Paragraph(f"<b>{m['away']}</b>", P["cell"]), _img(crest_of.get(m["away_team_id"]), 7 * mm, 7 * mm)])
            inner = Table([parts[0]], colWidths=[8 * mm, None, 8 * mm, None, 8 * mm])
            inner.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 1), ("RIGHTPADDING", (0, 0), (-1, -1), 1), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
            head = inner
        else:
            head = Paragraph(f"<b>{m['home']}</b> vs <b>{m['away']}</b>", P["cell"])
        label = (("★ " if m.get("is_grand_final") else "") + (m["round_name"] if m["stage"] == "finals" else f"{m.get('round_name') or ''} · {m['series'].replace('Girone', 'Gir.')}")).strip(" ·")
        sc = m.get("score") or {}
        score = f" · <font color='#F4AE2B'><b>{sc['home']}–{sc['away']}</b></font>" if m.get("played") and sc.get("home") is not None and sc.get("away") is not None else ""
        sub = Paragraph(label + score + (f"<br/><i>{m['note']}</i>" if show_notes and m.get("note") else ""), P["muted"])
        return [head, sub]

    if "schedule" in sections and matches:
        days = sorted({*[m["kickoff_at"][:10] for m in matches], *[b["date"] for b in breaks]})
        for day in days:
            page_start()
            day_matches = [m for m in matches if m["kickoff_at"].startswith(day)]
            ov = (cal.get("slots") or {}).get(day) or {}
            times = (_slot_times(cal.get("sessions") or [], day, step, duration) | set(ov.get("add") or [])) - set(ov.get("remove") or []) | {m["kickoff_at"][11:16] for m in day_matches}
            times = {x for x in times if any(m["kickoff_at"][11:16] == x for m in day_matches) or x in set(ov.get("add") or [])} or times
            rows_src = sorted([("slot", x) for x in times] + [("break", b) for b in breaks if b["date"] == day], key=lambda x: x[1] if x[0] == "slot" else x[1]["start_time"])
            wd = WEEKDAYS[datetime.strptime(day, "%Y-%m-%d").weekday()]
            stages = sorted({m["round_name"] if m["stage"] == "finals" else "Fase a gironi" for m in day_matches}, key=lambda x: x != "Fase a gironi")
            story += [Paragraph("Programma gare", P["kicker"]), Paragraph(f"{wd} {_date_it(day)}", P["h1"]), Paragraph(f"{title}{cat_label} · {' / '.join(stages[:4])}{'…' if len(stages) > 4 else ''} · {len(day_matches)} gare", P["h2"]), Spacer(1, 4)]
            data = [[Paragraph("Ora", P["cellb"]), *[Paragraph(f["name"], P["cellb"]) for f in fields]]]
            style = [("BACKGROUND", (0, 0), (-1, 0), th["head"]), ("TEXTCOLOR", (0, 0), (-1, 0), th["headtext"]), ("GRID", (0, 0), (-1, -1), 0.4, th["line"]), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 1), (-1, -1), 5), ("BOTTOMPADDING", (0, 1), (-1, -1), 5), ("BACKGROUND", (0, 1), (-1, -1), th["panel"])]
            for i in range(len(data[0])):
                style.append(("TEXTCOLOR", (i, 0), (i, 0), th["headtext"]))
            hd = [Paragraph(f"<font color='{th['headtext'].hexval().replace('0x', '#')}'><b>{x}</b></font>", P["cellb"]) for x in ["Ora", *[f["name"] for f in fields]]]
            data[0] = hd
            zebra = 0
            for kind, item in rows_src:
                r = len(data)
                if kind == "break":
                    data.append([Paragraph(f"<b>{item['start_time']}</b><br/>{item['end_time']}", P["cell"]), Paragraph(f"☕ {item.get('label') or 'Pausa'}", P["brk"]), *[""] * (len(fields) - 1)])
                    style += [("SPAN", (1, r), (len(fields), r)), ("BACKGROUND", (0, r), (-1, r), th["brk"])]
                    continue
                cells = [match_cell(m) if (m := by_key.get((f"{day}T{item}", f["id"]))) else Paragraph("—", P["muted"]) for f in fields]
                data.append([Paragraph(f"<b>{item}</b><br/>{_hhmm_add(item, duration)}", P["cell"]), *cells])
                if zebra % 2:
                    style.append(("BACKGROUND", (0, r), (-1, r), th["panel2"]))
                zebra += 1
            tb = Table(data, colWidths=[22 * mm, *[(W - 24 * mm - 22 * mm) / len(fields)] * len(fields)], repeatRows=1)
            tb.setStyle(TableStyle(style))
            story.append(tb)

    if "finals" in sections and board["finals"]:
        page_start()
        story += [Paragraph("Fase finale", P["kicker"]), Paragraph(f"{title}{cat_label} · Fase finale", P["h1"]), Spacer(1, 6)]
        rows = [[Paragraph(f"<font color='{th['headtext'].hexval().replace('0x', '#')}'><b>{x}</b></font>", P["cellb"]) for x in ["Turno", "Data e ora", "Campo", "Gara", "Note"]]]
        for m in sorted(board["finals"], key=lambda m: (m["kickoff_at"], m["field_name"])):
            rows.append([Paragraph(("★ " if m.get("is_grand_final") else "") + (m["round_name"] or "Fase finale"), P["cellb"]), Paragraph(f"{_date_it(m['kickoff_at'][:10])}<br/><b>{m['kickoff_at'][11:16]}</b>", P["cell"]), Paragraph(m["field_name"] or "—", P["cell"]), match_cell(m)[0], Paragraph((m.get("note") or "") if show_notes else "", P["muted"])])
        tb = Table(rows, colWidths=[48 * mm, 34 * mm, 26 * mm, None, 60 * mm], repeatRows=1)
        tb.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), th["head"]), ("GRID", (0, 0), (-1, -1), 0.4, th["line"]), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BACKGROUND", (0, 1), (-1, -1), th["panel"]), ("TOPPADDING", (0, 1), (-1, -1), 6), ("BOTTOMPADDING", (0, 1), (-1, -1), 6)] + [("BACKGROUND", (0, i), (-1, i), th["brk"]) for i, m in enumerate(sorted(board["finals"], key=lambda m: (m["kickoff_at"], m["field_name"])), start=1) if m.get("is_grand_final")]))
        story.append(tb)

    if "info" in sections:
        page_start()
        story += [Paragraph("Informazioni utili", P["kicker"]), Paragraph(f"{title}{cat_label} · Info", P["h1"]), Spacer(1, 8)]
        left = []
        if venues or fields_all:
            left.append(Paragraph("Dove si gioca", P["h2"]))
            for v in venues:
                left.append(Paragraph(f"<b>{v.name}</b>{' · ' + v.address if v.address else ''}{', ' + v.city if v.city else ''}{'<br/>' + v.notes if v.notes else ''}{'<br/>Mappa: ' + v.maps_url if v.maps_url else ''}", P["body"]))
            if fields_all:
                left.append(Paragraph("Campi: " + " · ".join(f"<b>{f.name}</b> ({f.size} vs {f.size}, {f.surface})" for f in fields_all), P["mutedl"]))
            left.append(Spacer(1, 8))
        left.append(Paragraph("Regole in breve", P["h2"]))
        left.append(Paragraph(f"Durata gara <b>{duration}'</b> · intervallo tra le gare <b>{cal.get('buffer_minutes') or 0}'</b> · punti: vittoria {s.points.get('win', 3)}, pareggio {s.points.get('draw', 1)}, sconfitta {s.points.get('loss', 0)}.", P["body"]))
        if s.rules_text:
            left.append(Paragraph(s.rules_text.replace("\n", "<br/>")[:1200], P["mutedl"]))
        left.append(Paragraph("<b>Codice FSL</b>: rispetto, correttezza, gioco. Le classifiche si aggiornano solo con i risultati ufficiali; eventuali variazioni di programma sono pubblicate in tempo reale sull'app.", P["body"]))
        if opts.get("contacts"):
            left += [Spacer(1, 8), Paragraph("Contatti organizzazione", P["h2"]), Paragraph(opts["contacts"].replace("\n", "<br/>"), P["body"])]
        right = []
        if public_url:
            code = qr.QrCodeWidget(public_url)
            b = code.getBounds()
            d = Drawing(46 * mm, 46 * mm, transform=[46 * mm / (b[2] - b[0]), 0, 0, 46 * mm / (b[3] - b[1]), 0, 0])
            d.add(code)
            qrt = Table([[d]], colWidths=[52 * mm], rowHeights=[52 * mm])
            qrt.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.white), ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ROUNDEDCORNERS", [8, 8, 8, 8])]))
            right += [qrt, Spacer(1, 6), Paragraph("Inquadra per risultati live, classifiche, foto e convocazioni", P["muted"]), Paragraph(public_url, P["muted"])]
        info = Table([[left, right]], colWidths=[W - 24 * mm - 64 * mm, 64 * mm])
        info.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
        story.append(KeepTogether(info))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=PAGE, leftMargin=12 * mm, rightMargin=12 * mm, topMargin=14 * mm, bottomMargin=12 * mm, title=f"{title} · Programma ufficiale", author="Future Stars League")
    doc.build(story or [Spacer(1, 10)], onFirstPage=cover_page if "cover" in sections else bg, onLaterPages=bg)
    return buf.getvalue()
