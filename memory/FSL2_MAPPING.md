# FSL 2.0 — Mappatura dell'esistente e piano per fasi (giugno 2026)

## Legenda
✅ già implementato · ♻️ riutilizzabile · ❌ manca

## 1. FSL PLAYER ID
| Voce | Stato | Dove |
|---|---|---|
| Anagrafica unica giocatore (nome, società, squadra, categoria, maglia, ruolo, foto, visibilità, consenso media, tutori) | ✅ | `Player` in `models/domain.py`; `PlayerProfile.jsx`, `PlayerProfileEditor.jsx` |
| Statistiche da tabellini ufficiali (presenze, gol, assist, media voto, fantavoto, MVP) | ✅ | `extras.player_card`, `fanta_rows`, `awards_board` |
| Badge/riconoscimenti (motore automatico + manuali) | ✅ | `services/badges.py`, `PlayerBadge`, `BadgeChips.jsx` |
| Card digitale a pagamento (€2,49: Team Card, Album) | ✅ ♻️ | `products.py`, `PaidMedia.kind team_card/album`, `TeamCard.jsx`, `PlayerPostcard.jsx`, Stripe checkout |
| Stagione sportiva sulla scheda | ♻️ | `Tournament.season_label` |
| Presenze Top 11 + badge «TOP 11 — Giornata X» | ❌ | nuovo codice badge `top11` con `match_day`/`competition_id` (già supportati da `PlayerBadge`) |
| Card Player ID premium (standard + speciale) generata da dati, prezzo da impostazioni | ❌ | nuovo kind `player_card` in `products.py` + prezzo in `TournamentSettings.fees.card_price`; rendering canvas riusando `SocialCard.jsx` |
Rischi: nessuna nuova anagrafica; consenso già gestito (`profile_visibility` + `media_consent`, card pubblica anonima «Giocatore»).

## 2. FSL WEEKLY + TOP 11
| Voce | Stato | Dove |
|---|---|---|
| Voti, bonus, fantavoto, MVP per gara | ✅ (non si tocca) | `extras.fanta_rows`, `BONUS`, `Ratings.jsx` |
| «Top Player» e «Squadra della settimana» (7 migliori fantavoti) per giornata | ✅ ♻️ | `badges.py` (`by_day` per competizione+giornata) → base del motore Top 11 |
| Classifiche ufficiali e snapshot | ✅ | `engine.compute_standings`, `StandingsSnapshot` |
| Blog/post con stati (draft/scheduled/published/withdrawn), kind `match_story`, cover, gallery | ✅ ♻️ | `Post`, `posts.py`, `PostEditor.jsx`, `Article.jsx` |
| Grafica social gara (FULL TIME) su canvas, download PNG | ✅ ♻️ | `SocialCard.jsx`, `GET /public/.../matches/{id}/social` |
| Ruoli giocatori normalizzati (Portiere/Difensore/Centrocampista/Esterno/Attaccante) | ✅ | `Player.role`, `ROLE_CODE` |
| Motore Top 11 per competizione+giornata (4-3-3 configurabile, tie-break deterministici, adattamento ruoli, snapshot, sostituzione manuale con audit) | ❌ | nuovo `services/top11.py`, collection `top11` (`status: draft→review→published→archived`, `formation`, `snapshot`, `changes[]`) |
| FSL Weekly: generazione idempotente per giornata (risultati, classifica, migliori, Top 11, MVP, curiosità, prossimo turno, foto in vendita) con approvazione Direttore | ❌ | nuovo `services/weekly.py` + `routers/weekly.py`; contenuto = `Post.kind="weekly"` + collection `weekly_issues` (chiave unica torneo+competizione+giornata) |
| Pagina pubblica «FSL Weekly» e grafiche 4:5 / 9:16 | ❌ | `pages/public/Weekly.jsx`, `Top11Board.jsx` (canvas) |
Nuovi endpoint: `POST /tournaments/{id}/weekly/generate`, `GET/PATCH /weekly/{issue}`, `POST /weekly/{issue}/status`, `POST /top11/{id}/replace`, `GET /public/tournaments/{slug}/weekly[/{n}]`.
Migrazioni: nessuna distruttiva (nuove collection + indici unici).
Rischi: nessuna modifica ai voti; ricalcolo bloccato dopo la pubblicazione (nuova versione = nuova bozza «Rettifica»).

## 3. FSL SOCIAL STUDIO
| Voce | Stato |
|---|---|
| Template FULL TIME (canvas) | ✅ ♻️ `SocialCard.jsx` |
| Team Card grafica | ✅ ♻️ `TeamCard.jsx` |
| Libreria template unificata (12 template, 3 formati), editor (torneo → competizione → giornata/gara → template → anteprima → testi → foto → sponsor → download/pubblica) | ❌ nuova sezione Control Room `admin/Studio.jsx` + `components/studio/*` (un renderer canvas condiviso) |
| Sponsor per torneo / competizione / rubrica (Top 11, Weekly) | ❌ `Sponsor` in `TournamentSettings.sponsors[]` + campo `sponsor_slot` |
| Pubblicazione nel portale | ♻️ crea `Post` con immagine generata |

## 4. FSL LEGACY / ALBO D'ORO
| Voce | Stato |
|---|---|
| Archiviazione torneo (stato `archived`, sola lettura 423, `archived_at`) | ✅ |
| Snapshot classifiche, versioni referti, premi stagionali (`awards_board`), badge career | ✅ ♻️ |
| Zone promozione/retrocessione in classifica | ✅ `engine.zone_for` |
| Identificativi persistenti società tra stagioni | ❌ parziale: `Club` è per torneo → serve `Club.org_club_id` (chiave stabile per organizzazione) + migrazione che lo popola da slug/nome |
| Processo esplicito «Chiudi stagione» (snapshot finale: classifiche, campioni, promosse/retrocesse, premi, Top 11 pubblicate, contenuti) | ❌ `services/legacy.py`, collection `season_archives` |
| Pagina pubblica Albo d'oro + storico nella scheda società | ❌ `pages/public/HallOfFame.jsx`, sezione in `PublicClub` |

## 5. MY FSL
| Voce | Stato |
|---|---|
| Preferiti (tornei, squadre, giocatori), notifiche in-app (post, media, badge, convocazioni, promemoria), campanella | ✅ `fans.py`, `FanAccount.jsx`, `NotificationsBell.jsx` |
| Dashboard con prossime partite/risultati/classifica delle squadre seguite | ❌ parziale: `FanAccount` mostra preferiti; manca il feed unificato |
| Notifiche cambio orario/campo/rinvio/risultato ufficiale/Weekly/Top 11 + preferenze per tipo | ❌ estensione `_fan_generate` + `User.notification_prefs` |
| Seguire società | ❌ aggiungere `favorites.clubs` |

## 6. TIME CAPSULE (solo progettazione)
Riutilizza `PaidMedia.kind="album"` (Season Album esistente) + Player ID: proposta dati `time_capsules {player_id, season, stats, badges, top11[], media[], certificate}` e mockup grafico. Nessun pagamento in questa fase.

## 7. Navigazione
Pubblica attuale: Home · Tornei · Classifiche · News · Media · Contatti → diventa Home · Tornei · Calendario e risultati · Classifiche · FSL Weekly · Media · Albo d'oro · Società (nessuna duplicazione, «News» assorbita in Weekly/Media). Control Room: + Social Studio (+ Weekly nella voce Blog). My FSL = area `/account` esistente.

## File toccati per fase (previsione)
- F1: `services/top11.py` (nuovo), `services/badges.py` (+badge top11), `routers/extras.py` (player_card: top11, stagione), `routers/products.py` (+player_card), `models/domain.py` (+Top11, Sponsor), `PlayerProfile.jsx`, `PlayerCard.jsx`, admin `Top11Review.jsx`.
- F2: `services/weekly.py`, `routers/weekly.py`, `public.py`, `pages/public/Weekly.jsx`, `PublicShell` nav.
- F3: `pages/admin/Studio.jsx`, `components/studio/*`, `SocialCard.jsx` (refactor renderer condiviso).
- F4: `services/legacy.py`, `routers/tournaments.py` (chiudi stagione), migrazione `org_club_id`, `HallOfFame.jsx`.
- F5: `fans.py`, `FanAccount.jsx`, `NotificationsBell.jsx`.
Regressioni da presidiare: voti/tabellino (non toccati), pubblicazione post, permessi torneo, scheda pubblica minori (anonimato).
