import logging
from pathlib import Path

from .core.db import db
from .models.base import utcnow
from .models.domain import MediaFile, PaidMedia, Post
from .repositories.registry import scoped, tournaments
from .services import storage

log = logging.getLogger("fsl.showcase")
ASSETS = Path(__file__).parent / "demo_assets"
PORTRAITS = {"gk": ["gk_green.png", "gk_orange.png"], "field": ["p_blue.png", "p_red.png", "p_navy.png", "p_yellow.png", "p_purple.png", "player_green.png"]}
ACTIONS = ["act_save.jpg", "act_celebrate.jpg", "act_dribble.jpg", "act_tunnel.jpg", "act_interview.jpg"]

BIO = {
    "Portiere": ("{n} è un portiere classe {y} del {c}. Si distingue per la grande reattività tra i pali, l'ottima lettura delle situazioni di gioco e una notevole sicurezza nelle uscite alte. Bravo anche con i piedi, mostra personalità, leadership e una forte concentrazione, qualità che lo rendono un punto di riferimento per la squadra.", ["Reattività", "Uscite alte", "Personalità", "Gioco con i piedi", "Parate decisive"], "Portiere · Leader difensivo · Top performer"),
    "Difensore": ("{n} è un difensore classe {y} del {c}. Ordinato e attento nelle chiusure, legge in anticipo le giocate avversarie e guida il reparto con la voce. Forte nel gioco aereo e pulito in fase di impostazione, unisce solidità e coraggio nelle uscite palla al piede.", ["Anticipo", "Gioco aereo", "Leadership", "Impostazione", "Concentrazione"], "Difensore · Muro della difesa · Leader"),
    "Centrocampista": ("{n} è un centrocampista classe {y} del {c}. Motore della squadra, unisce visione di gioco e intensità: recupera palloni, detta i tempi e cerca sempre la giocata verticale. Piede educato e grande disponibilità al sacrificio.", ["Visione di gioco", "Passaggio", "Intensità", "Recupero palla", "Inserimenti"], "Centrocampista · Motore della squadra · Regista"),
    "Esterno": ("{n} è un esterno classe {y} del {c}. Velocità, uno contro uno e cross precisi sono le sue armi: attacca la profondità con continuità e sa rientrare con generosità in fase difensiva.", ["Velocità", "Uno contro uno", "Cross", "Progressione", "Generosità"], "Esterno · Velocità sulla fascia · Assist-man"),
    "Attaccante": ("{n} è un attaccante classe {y} del {c}. Istinto del gol, movimenti intelligenti senza palla e freddezza sotto porta. Sa giocare spalle alla porta e far salire la squadra, ma è nell'area avversaria che fa la differenza.", ["Istinto del gol", "Movimento senza palla", "Freddezza", "Tiro", "Protezione palla"], "Attaccante · Istinto del gol · Top performer"),
}
CLUB_BIO = "{c} è una società di calcio giovanile nata nel {y} a {city}. Crede in un calcio che forma persone prima che giocatori: allenatori qualificati, attenzione alla crescita di ogni bambino e una comunità di famiglie che vive il campo come una seconda casa. In Future Stars League porta entusiasmo, organizzazione e il sogno di far crescere le stelle di domani."
POSTS = [
    ("news", "I {c}: il gruppo che sta sorprendendo la categoria {cat}", "Personalità e una grande sicurezza in campo: i ragazzi del {c} si confermano tra le realtà più solide della stagione FSL.", "act_celebrate.jpg"),
    ("interview", "Il mio obiettivo è aiutare la squadra", "I ragazzi del {c} si raccontano: la passione, il lavoro quotidiano e i sogni per il futuro nel calcio.", "act_interview.jpg"),
    ("gallery", "Le migliori immagini della stagione del {c}", "I più bei momenti dei ragazzi del {c} in questa stagione: parate, gol, esultanze e leadership in campo.", "act_dribble.jpg"),
]
SHOP = [("video", "Gli highlights della stagione", "act_tunnel.jpg", 99), ("photo", "La parata decisiva", "act_save.jpg", 49), ("photo", "L'esultanza dopo il gol", "act_celebrate.jpg", 49), ("photo", "In progressione palla al piede", "act_dribble.jpg", 49), ("photo", "L'ingresso in campo", "act_tunnel.jpg", 49)]


async def _asset(t_id: str, name: str) -> str | None:
    key = {"tournament_id": t_id, "key": name}
    found = await db.demo_assets.find_one(key)
    if found:
        return found["media_id"]
    path = ASSETS / name
    if not path.exists():
        return None
    ct = "image/png" if name.endswith(".png") else "image/jpeg"
    try:
        res = await storage.put_object(f"{storage.APP_NAME}/{t_id}/demo/{name}", path.read_bytes(), ct)
    except Exception as e:  # noqa: BLE001
        log.warning("Showcase asset upload failed (%s): %s", name, e)
        return None
    doc = await scoped("media", t_id).insert(MediaFile(tournament_id=t_id, storage_path=res["path"], original_filename=name, content_type=ct, size=res.get("size", 0), kind="image"))
    await db.demo_assets.insert_one({**key, "media_id": doc.id})
    return doc.id


async def seed_showcase(slug: str = "la-serie-a-dei-bambini") -> None:
    t = await tournaments.find_one({"slug": slug})
    if not t or not ASSETS.exists():
        return
    t_id = t.id
    clubs = {c.id: c for c in await scoped("clubs", t_id).list(limit=200)}
    teams = {tm.id: tm for tm in await scoped("teams", t_id).list(limit=200)}
    comps = {c.id: c for c in await scoped("competitions", t_id).list(limit=100)}
    players = await scoped("players", t_id).list(limit=1000)
    gk_i = fd_i = 0
    for p in players:
        if (p.profile or {}).get("showcase"):
            continue
        club = clubs.get(p.club_id)
        is_gk = p.role == "Portiere"
        name = PORTRAITS["gk"][gk_i % len(PORTRAITS["gk"])] if is_gk else PORTRAITS["field"][fd_i % len(PORTRAITS["field"])]
        if is_gk:
            gk_i += 1
        else:
            fd_i += 1
        mid = await _asset(t_id, name)
        bio, strengths, tagline = BIO.get(p.role, BIO["Centrocampista"])
        full = f"{p.first_name} {p.last_name}".strip()
        prof = {**(p.profile or {}), "bio": bio.format(n=full, y=p.birth_year or 2014, c=club.name if club else "club"), "strengths": strengths, "tagline": tagline, "showcase": True}
        patch = {"media_consent": True, "profile_visibility": "public", "profile": prof}
        if mid and not p.photo_url:
            patch["photo_url"] = f"/api/media/{mid}"
        await scoped("players", t_id).update(p.id, patch)
    now = utcnow().isoformat()
    for club in clubs.values():
        pids = [p.id for p in players if p.club_id == club.id]
        if not (club.profile or {}).get("showcase") and (ASSETS / f"crest_{club.slug}.png").exists():
            crest = await _asset(t_id, f"crest_{club.slug}.png")
            cover = await _asset(t_id, "team_1.jpg")
            gallery = [await _asset(t_id, n) for n in ("team_1.jpg", "act_celebrate.jpg", "act_tunnel.jpg", "act_dribble.jpg")]
            prof = {**(club.profile or {}), "showcase": True, "gallery_urls": [f"/api/media/{g}" for g in gallery if g]}
            prof.setdefault("services", ["Settore giovanile", "Scuola calcio", "Allenatori qualificati", "Campo in erba sintetica", "Spogliatoi rinnovati", "Trasporto convenzionato"])
            patch = {"profile": prof, "description": club.description or CLUB_BIO.format(c=club.name, y=club.founded_year or 2010, city=club.city or "Roma")}
            if crest:
                patch.update({"crest_url": f"/api/media/{crest}", "crest_is_placeholder": False})
            if cover and not club.cover_url:
                patch["cover_url"] = f"/api/media/{cover}"
            await scoped("clubs", t_id).update(club.id, patch)
        if not pids:
            continue
        cat = next((comps[teams[tm].competition_id].category for tm in teams if teams[tm].club_id == club.id and teams[tm].competition_id in comps), "")
        for i, (kind, title, excerpt, cover) in enumerate(POSTS):
            pslug = f"vetrina-{club.slug}-{kind}"
            if await db.posts.find_one({"tournament_id": t_id, "slug": pslug}):
                continue
            cid = await _asset(t_id, cover)
            await scoped("posts", t_id).insert(Post(tournament_id=t_id, kind=kind, title=title.format(c=club.name, cat=cat), slug=pslug, excerpt=excerpt.format(c=club.name), body=excerpt.format(c=club.name) + "\n\nContenuto dimostrativo della redazione FSL.", cover_url=f"/api/media/{cid}" if cid else None, status="published", published_at=now, author_name="Redazione FSL", club_ids=[club.id], player_ids=pids[:30], auto=True, auto_key=pslug))
        for kind, title, cover, cents in SHOP:
            lookup = "fsl_dyn"
            if await db.paid_media.find_one({"tournament_id": t_id, "club_ids": club.id, "title": title, "kind": kind}):
                continue
            cid = await _asset(t_id, cover)
            await scoped("paid_media", t_id).insert(PaidMedia(tournament_id=t_id, kind=kind, title=title, preview_media_id=cid, lookup_key=lookup, price_cents=cents, club_ids=[club.id], player_ids=pids[:30]))
    log.info("Showcase demo content ready for %s", slug)
