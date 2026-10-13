"""Email di benvenuto per un nuovo dirigente di società: link d'invito + mini guida all'Area Società."""
import os

from fastapi import Request

from . import mailer

GUIDE = [
    ("Squadre e rose", "scarica il modulo rosa Excel, compilalo con i tuoi giocatori e caricalo: l'organizzazione lo conferma."),
    ("Calendario", "tutte le gare delle tue squadre, con «Programma della giornata» stampabile in una pagina."),
    ("Convocazioni e distinte", "apri una gara per convocare i giocatori e preparare la distinta."),
    ("Documenti e pagamenti", "certificati in scadenza e quote in un unico posto."),
    ("Homepage società", "stemma, colori, foto e contatti che tutti vedono sul portale."),
]


def base_url(request: Request | None) -> str:
    return (os.environ.get("FRONTEND_URL") or (request.headers.get("origin") if request else None) or "").rstrip("/")


def build(club_name: str, inviter_name: str, code: str, link: str, to_name: str = "") -> tuple[str, str, str]:
    """Ritorna (oggetto, testo, html). Il testo è pronto anche per WhatsApp."""
    hello = f"Ciao {to_name.strip()}," if to_name.strip() else "Ciao,"
    subject = f"Future Stars League · sei dirigente di {club_name}"
    steps = "\n".join(f"• {t}: {d}" for t, d in GUIDE)
    text = (
        f"{hello}\n\n{inviter_name} ti ha invitato come dirigente di {club_name} nella Future Stars League.\n\n"
        f"1) Registrati con il tuo codice (vale per una sola registrazione, 30 giorni):\n{link}\nCodice: {code}\n\n"
        f"2) Entra nell'Area Società: trovi subito tutte le squadre della società, in tutti i tornei.\n\n"
        f"Cosa puoi fare:\n{steps}\n\n"
        "Codice FSL: rispetto, correttezza, gioco. Benvenuto in squadra!\nFuture Stars League"
    )
    items = "".join(f"<li style='margin:4px 0'><b>{t}</b>: {d}</li>" for t, d in GUIDE)
    html = (
        f"<div style='font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0b1f33'>"
        f"<div style='background:#03131F;padding:18px 22px;border-radius:12px 12px 0 0'><span style='color:#F4AE2B;font-weight:800;letter-spacing:.08em;text-transform:uppercase'>Future Stars League</span></div>"
        f"<div style='border:1px solid #e5e7eb;border-top:0;padding:22px;border-radius:0 0 12px 12px'>"
        f"<p>{hello}</p><p><b>{inviter_name}</b> ti ha invitato come <b>dirigente di {club_name}</b>.</p>"
        f"<p><a href='{link}' style='background:#F4AE2B;color:#03131F;padding:12px 20px;border-radius:8px;font-weight:700;text-decoration:none;display:inline-block'>Registrati con il codice {code}</a></p>"
        f"<p style='color:#667;font-size:13px'>Il codice vale per una sola registrazione, entro 30 giorni. Dopo la registrazione trovi subito tutte le squadre della società, in tutti i tornei.</p>"
        f"<h3 style='margin:18px 0 6px;color:#03131F'>Guida rapida all'Area Società</h3><ul style='padding-left:18px;margin:0'>{items}</ul>"
        f"<p style='color:#667;font-size:12px;margin-top:18px'>Codice FSL: rispetto, correttezza, gioco. Benvenuto in squadra!</p></div></div>"
    )
    return subject, text, html


async def send(to: str, club_name: str, inviter_name: str, code: str, link: str, to_name: str = "") -> dict:
    subject, text, html = build(club_name, inviter_name, code, link, to_name)
    emailed = await mailer.send(to, subject, text, html) if to else False
    return {"emailed": emailed, "mail_configured": mailer.configured(), "message_text": text, "subject": subject}
