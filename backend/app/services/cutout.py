import io
import logging
import os
from pathlib import Path

from PIL import Image, ImageOps

log = logging.getLogger("fsl.cutout")
os.environ.setdefault("REMBG_HOME", str(Path(__file__).resolve().parents[1] / "ml"))
_session = None


def _get_session():
    global _session
    if _session is None:
        from rembg import new_session

        _session = new_session("u2netp")
    return _session


def _frame(img: Image.Image, max_h: int = 900) -> Image.Image:
    """Ritaglia sul soggetto, centra e allinea in basso su tela 3:4 trasparente."""
    bbox = img.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox()
    if bbox:
        img = img.crop(bbox)
    w, h = img.size
    cw, ch = max(w, int(h * 0.75)), max(h, int(w / 0.75))
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    canvas.paste(img, ((cw - w) // 2, ch - h), img)
    if ch > max_h:
        canvas = canvas.resize((int(cw * max_h / ch), max_h), Image.LANCZOS)
    return canvas


def cutout(data: bytes) -> tuple[bytes, str, str]:
    """Foto giocatore → PNG scontornato (sfondo rimosso). Fallback: ritaglio quadrato JPEG."""
    src = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGBA")
    src.thumbnail((1400, 1400))
    try:
        from rembg import remove

        out = remove(src, session=_get_session(), post_process_mask=True)
        if out.getchannel("A").getextrema()[1] < 40:
            raise ValueError("nessun soggetto rilevato")
        buf = io.BytesIO()
        _frame(out).save(buf, "PNG", optimize=True)
        return buf.getvalue(), "image/png", "player.png"
    except Exception as e:  # noqa: BLE001
        log.warning("Scontorno non riuscito, uso ritaglio quadrato: %s", e)
        img = ImageOps.fit(src.convert("RGB"), (512, 512), method=Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=88)
        return buf.getvalue(), "image/jpeg", "player.jpg"
