import asyncio
import logging
import os
import smtplib
from email.message import EmailMessage

log = logging.getLogger("fsl.mail")


def configured() -> bool:
    return bool(os.environ.get("SMTP_HOST") and os.environ.get("SMTP_FROM"))


def _send(to: str, subject: str, text: str, html: str) -> None:
    host, port = os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", "587"))
    user, pwd = os.environ.get("SMTP_USER"), os.environ.get("SMTP_PASSWORD")
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = os.environ["SMTP_FROM"], to, subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    if os.environ.get("SMTP_SSL", "false").lower() == "true":
        server = smtplib.SMTP_SSL(host, port, timeout=20)
    else:
        server = smtplib.SMTP(host, port, timeout=20)
        server.starttls()
    with server:
        if user and pwd:
            server.login(user, pwd)
        server.send_message(msg)


async def send(to: str, subject: str, text: str, html: str) -> bool:
    """Invia via SMTP dell'organizzazione (nessun servizio terzo). False se non configurato o fallito."""
    if not configured():
        return False
    try:
        await asyncio.to_thread(_send, to, subject, text, html)
        return True
    except Exception as e:  # noqa: BLE001
        log.warning("Invio email a %s non riuscito: %s", to, e)
        return False
