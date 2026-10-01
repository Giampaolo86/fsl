"""Calendario per girone da affiggere al campo (PDF, una pagina per girone)."""
import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .referee_sheet import GREY, NAVY, GOLD, _date_it


def _table(rows, widths, cell):
    data = [["Data", "Ora", "Campo", "Squadra casa", "Squadra ospite", "Risultato"]]
    for m in rows:
        score = f"{m['score']['home']} - {m['score']['away']}" if m.get("played") else "____ - ____"
        data.append([_date_it(m["kickoff_at"]), m["kickoff_at"][11:16], m.get("field_name") or "—", Paragraph(f"<b>{m['home']}</b>", cell), Paragraph(f"<b>{m['away']}</b>", cell), score])
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 10), ("FONTSIZE", (1, 1), (1, -1), 12), ("FONTNAME", (1, 1), (1, -1), "Helvetica-Bold"), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GREY]), ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 1), (-1, -1), 7), ("BOTTOMPADDING", (0, 1), (-1, -1), 7), ("LINEBELOW", (0, 0), (-1, 0), 1.5, GOLD), ("ALIGN", (5, 0), (5, -1), "CENTER")]))
    return t


def build(tournament_name: str, category: str, board: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=14 * mm, bottomMargin=12 * mm, title=f"Calendario {tournament_name}", author="Future Stars League")
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=22, textColor=NAVY, alignment=0, spaceAfter=0)
    h2 = ParagraphStyle("h2", parent=ss["Normal"], fontName="Helvetica-Bold", fontSize=15, textColor=GOLD, spaceAfter=6)
    sub = ParagraphStyle("sub", parent=ss["Normal"], fontSize=9.5, textColor=colors.HexColor("#4b5563"), spaceAfter=8)
    cell = ParagraphStyle("cell", parent=ss["Normal"], fontSize=10, leading=12)
    small = ParagraphStyle("small", parent=ss["Normal"], fontSize=8, textColor=colors.HexColor("#6b7280"))
    widths = [24 * mm, 16 * mm, 22 * mm, 46 * mm, 46 * mm, 28 * mm]
    story = []
    sections = [(g["name"], [m for m in board["matches"] if m["competition_id"] == g["id"]], [t["name"] for t in g["teams"]]) for g in board["groups"]]
    if board["finals"]:
        sections.append(("Fase finale", board["finals"], []))
    for i, (name, rows, teams) in enumerate(sections):
        if not rows:
            continue
        if story:
            story.append(PageBreak())
        story += [Paragraph(tournament_name, h1), Paragraph(f"{name}{' · ' + category if category and category != 'Unica' else ''}", h2)]
        if teams:
            story.append(Paragraph("Squadre: " + " · ".join(teams), sub))
        story += [_table(rows, widths, cell), Spacer(1, 10), Paragraph("Future Stars League · Codice FSL: rispetto, correttezza, gioco. Il calendario può subire variazioni: fa fede la Control Room.", small)]
    doc.build(story)
    return buf.getvalue()
