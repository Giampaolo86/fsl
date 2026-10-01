"""Foglio designazioni arbitrali (PDF) per una giornata di gara."""
import io
from collections import defaultdict
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

NAVY = colors.HexColor("#0b1b33")
GOLD = colors.HexColor("#f2b134")
GREY = colors.HexColor("#e9edf3")
RED = colors.HexColor("#c0392b")
MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"]


def _label(side: dict) -> str:
    club = (side.get("club") or {}).get("name")
    return club or side.get("name") or "—"


def _date_it(iso: str) -> str:
    d = datetime.strptime(iso[:10], "%Y-%m-%d")
    return f"{d.day:02d} {MONTHS[d.month - 1]} {d.year}"


def build(tournament: dict, date: str, matches: list[dict]) -> bytes:
    """matches: output di _enrich (home/away con club), già filtrate per giornata."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=14 * mm, rightMargin=14 * mm, topMargin=12 * mm, bottomMargin=12 * mm, title=f"Designazioni {date}", author="Future Stars League")
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=18, textColor=NAVY, alignment=TA_LEFT, spaceAfter=2)
    sub = ParagraphStyle("sub", parent=ss["Normal"], fontSize=9.5, textColor=colors.HexColor("#4b5563"))
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=12, textColor=NAVY, spaceBefore=8, spaceAfter=4)
    cell = ParagraphStyle("cell", parent=ss["Normal"], fontSize=9, leading=11)
    small = ParagraphStyle("small", parent=ss["Normal"], fontSize=8, textColor=colors.HexColor("#6b7280"))

    ms = sorted(matches, key=lambda m: (m["kickoff_at"], m.get("field_name") or ""))
    assigned = [m for m in ms if m.get("referee_user_id")]
    per_ref = defaultdict(list)
    for m in assigned:
        per_ref[m.get("referee_name") or "—"].append(m)

    story = [Paragraph(f"Foglio designazioni arbitrali · {_date_it(date)}", h1), Paragraph(f"{tournament.get('name', '')} · {len(ms)} gare · {len(assigned)} designate · {len(ms) - len(assigned)} da designare · generato il {datetime.now().strftime('%d/%m/%Y %H:%M')}", sub), Spacer(1, 6)]

    story.append(Paragraph("Riepilogo per arbitro", h2))
    rows = [["Arbitro", "Gare", "Orari", "Campi"]]
    for name in sorted(per_ref):
        lst = per_ref[name]
        rows.append([Paragraph(f"<b>{name}</b>", cell), str(len(lst)), Paragraph(" · ".join(m["kickoff_at"][11:16] for m in lst), cell), Paragraph(", ".join(sorted({m.get("field_name") or "—" for m in lst})), cell)])
    if len(rows) == 1:
        rows.append([Paragraph("Nessuna designazione", cell), "", "", ""])
    t = Table(rows, colWidths=[70 * mm, 18 * mm, 110 * mm, 70 * mm], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 9), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GREY]), ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (1, 0), (1, -1), "CENTER")]))
    story += [t, Spacer(1, 6)]

    story.append(Paragraph("Programma gare e designazioni", h2))
    rows = [["Ora", "Campo", "Gara", "Competizione", "Arbitro", "Firma"]]
    for m in ms:
        comp = f"{m.get('category', '')}{' · ' + m['series'] if m.get('series') else ''}{' · ' + m['round_name'] if m.get('round_name') else ''}"
        ref = m.get("referee_name") or "DA DESIGNARE"
        rows.append([m["kickoff_at"][11:16], m.get("field_name") or "—", Paragraph(f"<b>{_label(m['home'])}</b> vs <b>{_label(m['away'])}</b>", cell), Paragraph(comp, cell), Paragraph(ref if m.get("referee_name") else f'<font color="#c0392b"><b>{ref}</b></font>', cell), ""])
    t = Table(rows, colWidths=[16 * mm, 26 * mm, 92 * mm, 56 * mm, 46 * mm, 32 * mm], repeatRows=1)
    style = [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 9), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GREY]), ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LINEBELOW", (0, 0), (-1, 0), 1.2, GOLD)]
    for i, m in enumerate(ms, start=1):
        if not m.get("referee_user_id"):
            style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#fdecea")))
    t.setStyle(TableStyle(style))
    story += [t, Spacer(1, 10), Paragraph("Il Direttore di gara ______________________________        Future Stars League · Codice FSL: rispetto, correttezza, gioco.", small)]
    doc.build(story)
    return buf.getvalue()
