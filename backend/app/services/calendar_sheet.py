"""Calendario da affiggere: una pagina per giornata, schema ora × campo (come il foglio dell'organizzatore)."""
import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .referee_sheet import GOLD, GREY, NAVY, _date_it

WEEKDAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"]
BREAK_BG = colors.HexColor("#ece9f5")


def _hhmm_add(hhmm: str, minutes: int) -> str:
    h, m = map(int, hhmm.split(":"))
    t = h * 60 + m + minutes
    return f"{t // 60:02d}:{t % 60:02d}"


def _slot_times(sessions, day, step, duration):
    out = set()
    for s in sessions:
        if s.get("date") != day:
            continue
        h, m = map(int, s["start_time"].split(":"))
        eh, em = map(int, s["end_time"].split(":"))
        t, end = h * 60 + m, eh * 60 + em
        while t + duration <= end:
            out.add(f"{t // 60:02d}:{t % 60:02d}")
            t += step
    return out


def build(tournament_name: str, category: str, board: dict) -> bytes:
    cal = board["calendar"]
    duration, step = cal.get("match_minutes") or 25, (cal.get("match_minutes") or 25) + (cal.get("buffer_minutes") or 0)
    fields = board["fields"][: max(cal.get("fields_count") or 1, 1)] or [{"id": None, "name": "Campo"}]
    matches = board["matches"] + board["finals"]
    breaks = cal.get("breaks") or []
    days = sorted({*[s["date"] for s in cal.get("sessions") or []], *[m["kickoff_at"][:10] for m in matches], *[b["date"] for b in breaks]})

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=12 * mm, rightMargin=12 * mm, topMargin=12 * mm, bottomMargin=10 * mm, title=f"Calendario {tournament_name}", author="Future Stars League")
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=20, textColor=NAVY, alignment=0, spaceAfter=0)
    h2 = ParagraphStyle("h2", parent=ss["Normal"], fontName="Helvetica-Bold", fontSize=14, textColor=GOLD, spaceAfter=6)
    cell = ParagraphStyle("cell", parent=ss["Normal"], fontSize=10, leading=12, alignment=1)
    note = ParagraphStyle("note", parent=ss["Normal"], fontSize=9, leading=11, alignment=1, textColor=colors.HexColor("#374151"))
    brk = ParagraphStyle("brk", parent=ss["Normal"], fontName="Helvetica-Bold", fontSize=10, alignment=1, textColor=colors.HexColor("#4c1d95"))
    small = ParagraphStyle("small", parent=ss["Normal"], fontSize=8, textColor=colors.HexColor("#6b7280"))

    by_key = {(m["kickoff_at"], m["field_id"]): m for m in matches}
    story = []
    for day in days:
        if story:
            story.append(PageBreak())
        day_matches = [m for m in matches if m["kickoff_at"].startswith(day)]
        ov = (cal.get("slots") or {}).get(day) or {}
        times = (_slot_times(cal.get("sessions") or [], day, step, duration) | set(ov.get("add") or [])) - set(ov.get("remove") or []) | {m["kickoff_at"][11:16] for m in day_matches}
        rows_src = [("slot", t) for t in times] + [("break", b) for b in breaks if b["date"] == day]
        rows_src.sort(key=lambda x: x[1] if x[0] == "slot" else x[1]["start_time"])
        wd = WEEKDAYS[datetime.strptime(day, "%Y-%m-%d").weekday()]
        stages = sorted({m["round_name"] if m["stage"] == "finals" else "Fase a gironi" for m in day_matches}, key=lambda x: x != "Fase a gironi")
        story += [Paragraph(tournament_name, h1), Paragraph(f"{wd} {_date_it(day)}{' · ' + category if category and category != 'Unica' else ''} · {' / '.join(stages) if stages else 'Programma'}", h2)]
        data = [["Ora", *[f["name"] for f in fields], "Note"]]
        style = [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 10), ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"), ("LINEBELOW", (0, 0), (-1, 0), 1.5, GOLD), ("TOPPADDING", (0, 1), (-1, -1), 6), ("BOTTOMPADDING", (0, 1), (-1, -1), 6)]
        zebra = 0
        for kind, item in rows_src:
            r = len(data)
            if kind == "break":
                data.append([f"{item['start_time']} – {item['end_time']}", Paragraph(item.get("label") or "Pausa", brk), *[""] * (len(fields) - 1), Paragraph(f"{int((int(item['end_time'][:2]) * 60 + int(item['end_time'][3:])) - (int(item['start_time'][:2]) * 60 + int(item['start_time'][3:])))} minuti", note)])
                style += [("SPAN", (1, r), (len(fields), r)), ("BACKGROUND", (0, r), (-1, r), BREAK_BG)]
                continue
            t = item
            cells, notes = [], []
            for f in fields:
                m = by_key.get((f"{day}T{t}", f["id"]))
                if m:
                    score = f" <font color='#b45309'><b>{m['score']['home']}–{m['score']['away']}</b></font>" if m.get("played") else ""
                    cells.append(Paragraph(f"<b>{m['home']}</b> vs <b>{m['away']}</b>{score}", cell))
                    notes.append(m["round_name"] if m["stage"] == "finals" else f"{m.get('round_name', '')} – {m['series'].replace('Girone', 'Gir.')}")
                else:
                    cells.append(Paragraph("—", note))
            data.append([f"{t} – {_hhmm_add(t, duration)}", *cells, Paragraph(" · ".join(dict.fromkeys(notes)) or "", note)])
            if zebra % 2:
                style.append(("BACKGROUND", (0, r), (-1, r), GREY))
            zebra += 1
        avail = landscape(A4)[0] - 24 * mm
        widths = [30 * mm, *[(avail - 30 * mm - 48 * mm) / len(fields)] * len(fields), 48 * mm]
        t = Table(data, colWidths=widths, repeatRows=1)
        t.setStyle(TableStyle(style))
        story += [t, Spacer(1, 8), Paragraph("Future Stars League · Codice FSL: rispetto, correttezza, gioco. Il programma può subire variazioni: fa fede la Control Room.", small)]
    doc.build(story)
    return buf.getvalue()
