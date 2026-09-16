# Future Stars League – PRD

## Problem statement (originale)
Web app responsive/PWA "FUTURE STARS LEAGUE – La Serie A del futuro": piattaforma multi-torneo per calcio giovanile con Hub Tornei, Portale pubblico, Area Società, Control Room e Area Arbitro. Design system vincolante (navy/blue/gold, Barlow Condensed + Inter), RBAC per ruoli (Super Admin, Direttore, Segreteria, Arbitro, Responsabile Società, Pubblico), audit append-only, flusso risultato vincolante (solo il Direttore ufficializza), motore classifiche da soli risultati ufficiali, preset "La Serie A dei Bambini" (4 categorie × 2 serie × 18 squadre, 3 campi, 7 slot, 1.224 gare) e "Torneo degli Amici" (10 squadre, 2 campi). Spec completa: messaggio iniziale + `Emergent_Master_Build_Prompt.md`.

## Scelte utente
- Stack nativo Emergent (React CRA + FastAPI + MongoDB) con tournament_id obbligatorio/indicizzato, isolamento lato API, RBAC, audit append-only, versionamento, indici univoci, layer repository per futura migrazione PostgreSQL. Differenze documentate in `/app/docs/02-erd-schema-dati.md`.
- Auth JWT custom con redirect per ruolo. MFA rinviata a Fase 7.
- Fase 1 + Hub multi-torneo funzionante (inizio Fase 2).
- Immagini stock/sintetiche solo fallback; stemmi SVG segnaposto; personalizzazione visiva da Area Società con approvazione DT/SA (Fase 6).
- UI solo italiano.

## Architettura
- Backend `/app/backend`: `server.py` → `app/core` (db, security, deps RBAC, errors), `app/models` (BaseDocument/PyObjectId, dominio), `app/repositories` (Repository / ScopedRepository), `app/services` (tournaments, audit), `app/routers` (auth, tournaments, structure, users, public, me), `app/migrations.py` (indici idempotenti + schema_migrations), `app/seed.py`.
- Frontend `/app/frontend/src`: contexts Auth/Tournament, layout AdminShell/PublicShell/ClubShell/RefereeShell, componenti `components/fsl/*`, pagine `pages/{admin,club,referee,public}`, PWA (manifest + sw.js).
- Docs consegnati: `/app/docs/01..06` (rotte, ERD, matrice permessi, migrazioni, componenti UI, fasi/rischi/decisioni).

## Personas
Super Admin (owner castellani.giampaolo@gmail.com), Direttore Torneo, Segreteria, Arbitro, Responsabile Società, Pubblico.

## Implementato (2026-06)
- [x] Design token, component library FSL, shell responsive 4 ambienti, PWA installabile
- [x] Auth JWT (cookie httpOnly + Bearer), lockout 5 tentativi, landing per ruolo, RBAC + scope torneo/club lato API
- [x] Audit log append-only con before/after/motivazione, pagina Audit
- [x] Migrazioni 001-006 con indici univoci; seed 4 tornei (2 attivi, 1 bozza, 1 archiviato), 28 club, 28 squadre, utenti demo
- [x] Hub Tornei: KPI, card, ricerca/ordinamento, archivio, selettore globale con drawer Attivi/Archivio
- [x] Creazione torneo: da zero / modello (3 template) / duplica (settings+competizioni+campi+club)
- [x] Stati draft→active→completed→archived (motivazione), sola lettura archiviati (409), ripristino solo SA con motivazione
- [x] Impostazioni torneo complete (categorie, serie, squadre, campi, giorni, orari, durata, buffer, slot calcolati, formula, punteggi, tie-break ordinabili, promozioni/retrocessioni, quote, documenti, canali) con sync competizioni e campi
- [x] Competizioni, Società (+crea), Squadre (+iscrizione con limite), Sedi/Campi (+aggiungi), Utenti (+crea con membership)
- [x] Area Società dashboard e squadre; Area Arbitro shell mobile; Portale pubblico: hub, home torneo, squadre, scheda società, classifiche (vuote per design), regolamento
- [x] Test: 26/26 backend (pytest `/app/backend/tests/backend_test.py`), flussi frontend verificati

## Implementato (2026-06) – Iterazione 2: motore gara (porting v39 dell'utente)
- [x] Competizioni con tipo (girone / eliminazione diretta / girone+finale), qualificate e generazione/avanzamento fase finale
- [x] Rose giocatori (anagrafica privata, consenso immagine → nome pubblico), gestibili da staff e Responsabile Società
- [x] Generatore calendario: round robin, campi × slot da configurazione, vincolo 1 gara/weekend, quality score; gara manuale con vincolo weekend/slot
- [x] Partite: assegnazione arbitro, convocazioni (società/arbitro/staff), eventi live (gol, cartellini, sostituzioni…), checklist
- [x] Referto arbitro → risultato official (scelta utente, come v39), verifica coerenza eventi/punteggio, blocco dopo invio; Direttore ufficializza/rettifica (motivazione, versioni prima/dopo) e riapre
- [x] Classifiche con punti/tie-break configurabili (incl. scontro diretto, fair play), zone, forma, snapshot a ogni ufficializzazione
- [x] Segnalazioni errore (ticket) da società → gestione staff (in revisione/respinta/risolta)
- [x] Portale pubblico: prossime gare, ultimi risultati, mini classifica, marcatori, pagina Partite, Match Center (cronaca, forma, classifica), Classifiche live, Statistiche; privacy (nomi solo con consenso)
- [x] Area Arbitro mobile (gare assegnate → live → referto) e Area Società (calendario, convocazioni, rose, segnalazioni)
- [x] Test: 36/36 engine + 26/26 base (backend), flussi frontend verificati (`/app/test_reports/iteration_2.json`)

## Implementato (2026-06) – Iterazione 3
- [x] Pagelle stile fantacalcio (voto 4–10, bonus/malus, fantavoto, badge MVP/Bomber/Assistman/Muro) per staff e arbitro; pubbliche nel Match Center (nomi solo con consenso); pagina Premi + sezione Premi nelle Statistiche pubbliche
- [x] Esiti stagione: chiusura competizione (solo se tutte le gare ufficiali) con campione, promosse, retrocesse, playoff/playout; esiti pubblici
- [x] Pagamenti a convocazione: quota `fees.callup_fee` per torneo, addebito automatico idempotente all'ufficializzazione, registrazione pagamenti con ricevuta RIC-YYYY-NNNN, saldi società (staff) e ledger società
- [x] Cronaca live pubblica: punteggio live da eventi per gare in corso, Match Center con polling 5s e indicatore LIVE
- [x] Orari torneo: fine giornata fino a sera, pausa opzionale (es. pranzo), preset Mattina/Pomeriggio/Giornata intera/Fino a sera

## Implementato (2026-06) – Iterazione 4
- [x] Tabellino unico stile fantacalcio (`MatchWorkspace` + `MatchSheet`/`SheetRow`): casa e ospite affiancate, righe h-12, modalità «Prepara distinta» (società/segreteria/staff/arbitro) e «Compila gara» (arbitro assegnato, DT, SA); numero maglia 1° clic presente / 2° assente / 3° da confermare; voto base 6 con −/+ (passo 0,5), bonus (Gol, Assist, Rig. parato, MVP) e malus (Amm., Esp., Autogol) con strip scorrevole, fantavoto; nome cliccabile → scheda giocatore (`PlayerCardDialog`)
- [x] Backend `POST /matches/{id}/sheet` (attendance+ratings+stats, close bool): risultato calcolato da gol/autogol (non modificabile a mano), eventi derivati senza minuti, validazioni (distinte presenti, ≥1 presente per squadra, 0 da confermare), arbitro → `report_submitted` («Chiudi gara e invia»), DT/SA → `official` («Chiudi gara e pubblica»), rettifica con motivazione → `rectified` + versione prima/dopo; ricalcolo classifica, marcatori, badge, addebiti
- [x] Portale: Match Center con «Tabellino» (episodi per tipo senza minuti), pagelle compatte voto/bonus/fanta, scheda giocatore pubblica (solo con consenso)
- [x] Motore badge (`services/badges.py`): 30+ definizioni (Esordio, Primo gol, Doppietta, Tripletta, Porta inviolata, Para-rigori, MVP, MVP x2/x3/seriale, Fuoriclasse 7,5, Elite 8, Sempre presente, Bomber 5/10/20, Assist King 3/5/10, Muro, Fair Play, Top Player giornata, Migliori per ruolo, Squadra della settimana, Campione/Finalista/Promosso/Salvezza), scope gara/stagione/carriera, assegnazione automatica all'ufficializzazione, ricalcolo su rettifica/riapertura/chiusura stagione con sync senza duplicati; premi speciali manuali (SA/DT); notizia automatica «X ha conquistato il badge …» (solo con consenso, esclusi Esordio); badge in scheda giocatore, rose, Premi (admin), Match Center pubblico
- [x] Social Match Center (`SocialCard.jsx`, canvas 1080×1350): risultato, colori società, MVP (bonus esplicito o miglior fantavoto), podio, premi/badge, stato Anteprima/Pronta, Scarica PNG, Condividi (Web Share API con file), Rigenera; in Match Center pubblico e tab «Social» del workspace
- [x] Blog e interviste (`routers/posts.py`, `pages/admin/Blog.jsx`, `pages/public/PublicBlog.jsx`): notizie/interviste/gallery/video/match story, upload chunked (4 MB) su Emergent Object Storage servito da `/api/media/{id}`, tag società e partita, bozza/programmato/pubblicato/ritirato, filtri, anteprima, Match story automatica da gara ufficiale (nomi secondo consenso), portale News + articolo + «Ultime news» in home; Responsabile Società limitato ai contenuti della propria società (`/societa/blog`); programmati visibili solo alla data
- [x] Test: 30/30 backend iterazione 4 (`/app/backend/tests/test_iteration4.py`), flussi frontend verificati (`/app/test_reports/iteration_4.json`)

## Implementato (2026-06) – Iterazione 5
- [x] Foto giocatori: upload da Rose (staff e società, solo propria rosa) → Object Storage, ritaglio quadrato 512px (Pillow), visibile in scheda giocatore, pagelle/Match Center (solo con consenso) e MVP nella grafica social (`POST /players/{id}/photo`)
- [x] Documenti società (facoltativi, nessun blocco): tipi (certificato medico, identità, consenso privacy/immagine, iscrizione, altro), file su storage, scadenza con stato valido / in scadenza 30-15-7 / scaduto, versioni (replaces_id), verifica Segreteria (verificato/respinto), riepilogo per società in Control Room (`/admin/t/:id/documenti`) e Area Società (`/societa/documenti`)
- [x] Notifiche in-app per società (campanella in Area Società, `NotificationsBell`): badge stagionali/carriera sbloccati da propri giocatori, documenti in scadenza/scaduti (dedupe per soglia), esito verifica documenti; segna come lette
- [x] Media a pagamento (Stripe, sandbox reclamabile, gestione fiscale completa/managed payments con fallback a calcolo tasse): staff carica foto (0,49 €) e video (0,99 €) dal tab «Foto/Video» del workspace gara; portale: sezione «Foto e video della gara» con anteprima sfocata+filigrana, checkout Stripe hosted, `/payment/success` con polling stato e link download riservato (token), `/payment/cancel`; webhook `/api/stripe/webhook`; Control Room «Vendite» (incasso, conteggi, elenco). Catalogo Stripe: lookup_key `fsl_video_099`, `fsl_photo_049` (EUR)
- [x] Test: 19/19 backend iterazione 5 (`/app/backend/tests/test_iteration5.py`), flussi frontend verificati (`/app/test_reports/iteration_5.json`); pagamento completo con carta test non eseguito automaticamente

## Implementato (2026-06) – Iterazione 6
- [x] Modulo Rosa Società (Excel): download modulo precompilato (`GET /roster-imports/template`), caricamento e parsing con validazioni per riga (ruolo, maglia duplicata, data, nome), stato in attesa → maschera di conferma admin (righe modificabili, includi/escludi, modalità aggiungi/sostituisci, nota) → «Carica rooster» crea/aggiorna giocatori; respinta con motivo; notifiche alla società. Test 12/12 (`/app/backend/tests/test_roster_imports.py`, `iteration_6.json`)
- [x] Tabellino: MVP obbligatorio (uno solo, ★ esclusivo, blocco chiusura), clic sul logo società = tutti presenti, layout compatto mobile-first (griglia 7 chip a larghezza fissa senza tagli, riga a 2 livelli su smartphone, singola su desktop), tab con etichette troncate
- [x] Grafica social: marcatori per squadra, MVP con foto, podio compatto; rimossi i badge (restano sul profilo giocatore)
- [x] Calendario: pulsante «Prossimi impegni · 7 giorni» (admin e Area Società) con filtro `upcoming_days` e stato vuoto dedicato

## Implementato (2026-06) – Iterazione 7
- [x] Homepage società pubblica ridisegnata (`PublicClubHome.jsx`, stile mockup 03): hero con stemma/copertina/colori, KPI reali, rose separate per squadra/torneo (nomi e foto solo con consenso, badge), sede/orari/come arrivare/servizi, contatti e social, responsabile, prossime partite e ultimi risultati, blog e foto/video in vendita; link alle rose in altri tornei FSL
- [x] Area Società «La mia homepage» (`/societa/profilo`): identità, immagini (upload), contatti, responsabile, sede, servizi → bozza in approvazione admin (`profile_draft`, `approval_status`), approvazione/rifiuto in Control Room «Società» (`ProfileReviews`), notifiche alla società
- [x] Ruolo `fan` (genitori/tifosi): registrazione libera `/registrati` (email+password, consenso privacy) e Google (Emergent-managed, `/api/auth/google/session`, callback `#session_id` su `/account`); area `/account` con preferiti (torneo, squadra, giocatore) e scorciatoie alla prossima partita/ultimo risultato, «I miei acquisti» (download riservati), «Le mie segnalazioni»; cuore «Segui» su torneo, squadra e scheda giocatore; segnalazione errori dal Match Center → ticket al Direttore; acquisti collegati all'utente
- [x] Accessi differenziati: landing per ruolo (admin/direttore/segreteria → Control Room, società → Area Società, arbitro → area arbitro, fan → /account); header pubblico con «Area Società» e «Genitori e tifosi»
- [x] Logo ufficiale FSL (asset `/brand/logo.png`, icone PWA 192/512, favicon); KPI dell'Hub e dell'Overview cliccabili verso le sezioni dedicate
- [x] Test: 13/13 backend iterazione 7 (`test_iteration7.py`), flussi frontend verificati (`iteration_7.json`)

## Implementato (2026-06) – Iterazione 8
- [x] Immagini base società: 6 copertine + 4 foto gallery FSL generate (`/frontend/public/brand/covers/`), assegnate a rotazione (crc32 dello slug) come `cover_url`/`gallery` di default nella risposta pubblica (`cover_is_default`, `gallery_is_default`); gallery società (fino a 4 foto) caricabile dall'editor homepage, slot mancanti riempiti con le immagini di default; sezione «La società in immagini» nella homepage pubblica
- [x] Notifiche genitori/fan (solo in-app): `GET /api/me/notifications` genera on-demand «Prossima partita» (48h prima, squadre/giocatori seguiti, dedupe per gara+orario) e «Nuova foto/video in vendita» (media degli ultimi 30 giorni sulle gare delle squadre seguite); `POST /api/me/notifications/read`; campanella `NotificationsBell fan` in /account e nell'header pubblico; modello `Notification` con `user_id` opzionale
- [x] Homepage torneo ridisegnata (blueprint design_agent in `design_guidelines.json`): hero, striscia numeri, prossime partite (scroll orizzontale mobile), Blog e news con articolo in evidenza (post non-badge prioritari, copertina fallback FSL), blocco Interviste (stile citazione, stato vuoto editoriale), vetrina Foto e video (anteprima sfocata → nitida in hover, acquisto Stripe, stato vuoto promozionale), dashboard Risultati/Classifica/Marcatori, griglia squadre. Backend home: `news`, `interviews`, `shop` (con `match_label`)
- [x] Bug fix Control Room → Società: `ProfileReviews` era finito dentro il pulsante «Nuova società»; ora nome società = link alla homepage pubblica + pulsante «Apri» + pulsante «Modifica» → `/admin/t/:tid/societa/:clubId` (`ClubHomeEditor adminMode`: nome, nome breve, città, motto, immagini, gallery, contatti, sede; pubblicazione immediata senza approvazione; `PUT /profile` accetta name/city/short_name per lo staff)
- [x] Premi: tabella con ricerca, filtro squadra e ordinamento (MVP, media fantavoto, gol, assist, badge, nome, squadra) + conteggio; dialog «Premio speciale» con ricerca e select giocatori senza ripetizioni (nome+squadra), formato «Cognome Nome · Squadra · n. X»
- [x] Test: 6/6 backend iterazione 8 (`test_iteration8.py`), flussi frontend verificati (`iteration_8.json`)

## Backlog prioritizzato
- P0 (Fase 3 residuo): blackout campi/indisponibilità, drag-and-drop calendario, versioni bozza/pubblicazione, recuperi in settimana
- P1 (Fase 5): comunicazioni email/SMS (provider da scegliere), segnalazione pubblica con captcha, rimborsi Stripe da Control Room
- P1 (Fase 6): sponsor, personalizzazione visiva società con approvazione, anteprima video (thumbnail) per lo shop, pacchetti foto scontati
- P2 (Fase 7): MFA SA/DT, rate limiting, WCAG audit, backup, monitoring

## Decisioni aperte
Provider email/SMS; policy retention; Pantone su mazzetta fisica. Stripe: sandbox da reclamare (link onboarding nel riepilogo), modalità fiscale attuale «Stripe gestisce tutto» (cambiabile su richiesta).
