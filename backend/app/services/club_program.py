"""Programma della giornata per una società: una pagina A4 con le sole gare delle sue squadre."""
import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .calendar_sheet import WEEKDAYS, _hhmm_add
from .referee_sheet import GOLD, GREY, NAVY, _date_it


def build(tournament_name: str, club_name: str, match_day: int | None, rows: list[dict], durations: dict) -> bytes:
    """rows: dicts con kickoff_at, field_name, venue_name, category, series, round_name, home, away, is_home, team_name."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=14 * mm, bottomMargin=12 * mm, title=f"Programma {club_name}", author="Future Stars League")
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=20, textColor=NAVY, alignment=0, spaceAfter=0)
    h2 = ParagraphStyle("h2", parent=ss["Normal"], fontName="Helvetica-Bold", fontSize=13, textColor=GOLD, spaceAfter=2)
    h3 = ParagraphStyle("h3", parent=ss["Normal"], fontName="Helvetica-Bold", fontSize=11, textColor=NAVY, spaceBefore=8, spaceAfter=4)
    cell = ParagraphStyle("cell", parent=ss["Normal"], fontSize=9, leading=11)
    small = ParagraphStyle("small", parent=ss["Normal"], fontSize=8, textColor=colors.HexColor("#6b7280"))
    days = sorted({r["kickoff_at"][:10] for r in rows})
    sub = " · ".join(x for x in [f"Giornata {match_day}" if match_day else "", " + ".join(f"{WEEKDAYS[datetime.strptime(d, '%Y-%m-%d').weekday()][:3]} {_date_it(d)}" for d in days), f"{len(rows)} gare"] if x)
    story = [Paragraph(club_name, h1), Paragraph(f"{tournament_name} · {sub}", h2), Paragraph("Programma delle sole gare della società. Presentarsi al campo 30 minuti prima del calcio d'inizio con distinta e documenti.", small)]
    for d in days:
        day_rows = sorted([r for r in rows if r["kickoff_at"].startswith(d)], key=lambda r: (r["kickoff_at"], r["field_name"]))
        story.append(Paragraph(f"{WEEKDAYS[datetime.strptime(d, '%Y-%m-%d').weekday()]} {_date_it(d)}", h3))
        data = [["Ora", "Campo", "Categoria", "Squadra", "Avversaria", "Casa/Osp."]]
        for r in day_rows:
            t = r["kickoff_at"][11:16]
            opp = r["away"] if r["is_home"] else r["home"]
            field = r["field_name"] or "—"
            if r.get("venue_name"):
                field += f"<br/><font size='7.5' color='#6b7280'>{r['venue_name']}</font>"
            data.append([Paragraph(f"<b>{t}</b><br/><font size='7.5' color='#6b7280'>fine {_hhmm_add(t, durations.get(r['category'], 25))}</font>", cell), Paragraph(field, cell), Paragraph(f"{r['category']}<br/><font size='7.5' color='#6b7280'>{(r['series'] or '').replace('Girone', 'Gir.')}</font>", cell), Paragraph(f"<b>{r['team_name']}</b>", cell), Paragraph(opp, cell), Paragraph("Casa" if r["is_home"] else "Ospite", cell)])
        avail = A4[0] - 28 * mm
        tbl = Table(data, colWidths=[22 * mm, 34 * mm, 24 * mm, (avail - 100 * mm) / 2, (avail - 100 * mm) / 2, 20 * mm], repeatRows=1)
        style = [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, 0), 8.5), ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LINEBELOW", (0, 0), (-1, 0), 1.2, GOLD), ("TOPPADDING", (0, 1), (-1, -1), 4), ("BOTTOMPADDING", (0, 1), (-1, -1), 4)]
        style += [("BACKGROUND", (0, i), (-1, i), GREY) for i in range(2, len(data), 2)]
        tbl.setStyle(TableStyle(style))
        story.append(tbl)
    story += [Spacer(1, 10), Paragraph("Future Stars League · Codice FSL: rispetto, correttezza, gioco. Il programma può subire variazioni: fa fede il calendario online.", small)]
    doc.build(story)
    return buf.getvalue()
