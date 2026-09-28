import io
import logging

from PIL import Image, ImageOps

log = logging.getLogger("fsl.cutout")


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


def _has_transparency(img: Image.Image) -> bool:
    lo, hi = img.getchannel("A").getextrema()
    return lo < 40 <= hi


def cutout(data: bytes) -> tuple[bytes, str, str]:
    """Foto giocatore: se già scontornata (PNG con trasparenza, dal browser) la inquadra 3:4; altrimenti ritaglio quadrato JPEG."""
    src = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGBA")
    src.thumbnail((1400, 1400))
    buf = io.BytesIO()
    if _has_transparency(src):
        _frame(src).save(buf, "PNG", optimize=True)
        return buf.getvalue(), "image/png", "player.png"
    ImageOps.fit(src.convert("RGB"), (512, 512), method=Image.LANCZOS).save(buf, "JPEG", quality=88)
    return buf.getvalue(), "image/jpeg", "player.jpg"
