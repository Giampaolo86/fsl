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

## Implementato (2026-06) – Iterazione 9
- [x] Anteprima video shop: alla messa in vendita di un video il backend estrae un fotogramma (ffmpeg via `imageio-ffmpeg`, 2s con fallback 0,5s, in thread), lo sfoca leggermente e appone la filigrana → `preview_media_id`; vetrina pubblica (home, Match Center, homepage società) mostra il fotogramma; pulsante «Genera anteprima» (`POST /shop/items/{id}/preview`) per i video già in vendita senza miniatura. Test 7/7 (`test_iteration9.py`, `iteration_9.json`)

## Implementato (2026-06) – Iterazione 10-12
- [x] Flussi di accesso separati: `/account` dentro la PublicShell (genitore naviga liberamente; header con campanella, «I miei preferiti», «Esci»), nav hub senza tab inutili, `ProtectedRoute` reindirizza per ruolo (SA non entra più nell'area fan), Login ignora `from` incompatibile col ruolo; rimosso errore `<a>` annidato in FanAccount
- [x] Sidebar Control Room: 220px, etichette complete, scrollbar sottile tematica (`fsl-scroll` + regole globali)
- [x] Notifiche fan: motivo esplicito nel testo («segui SPO» / «con Luca»), nessun media antecedente alla registrazione; homepage società: contatore badge compatto nelle rose
- [x] Scheda Giocatore (`pages/PlayerProfile.jsx`, rotte pubblica `/tornei/:slug/giocatori/:id`, admin `/admin/t/:tid/giocatori/:id`, società `/societa/giocatori/:id`): hero, «Mi presento» (altezza, peso, piede, soprannome, idolo, squadra del cuore, citazione), «Dicono di me», statistiche, badge, media taggati (post `player_ids` + shop `player_ids`), storico gare. Modifica (`PUT /players/{id}/profile`) per staff, società del giocatore e genitore abbinato via `guardian_emails` (impostabili solo da staff/società); `GET /me/children` + sezione «I miei bambini» in /account. Privacy: pubblico e altre società vedono solo la vista con consenso («Giocatore» senza foto/profilo). Nomi cliccabili: Premi, marcatori, Rose («Scheda»), popup «Scheda completa». Tag giocatori nel gestore foto/video shop. Test 12/12 (`test_iteration12.py`, `iteration_12.json`)

## Implementato (2026-06) – Iterazione 13
- [x] Tag giocatori nel blog: selettore con ricerca nel `PostEditor` (filtrato per società/gara), `player_ids` salvati → contenuti nella scheda giocatore
- [x] Cartolina giocatore 1080×1350 (`PlayerPostcard.jsx`, canvas client-side): foto, numero, nome, soprannome, citazione, dati «Mi presento», statistiche, badge, colori società; download PNG + Web Share; visibile se consenso o a chi può modificare
- [x] Foto dal genitore: upload dalla scheda (ritaglio quadrato server-side); staff/società pubblicano subito, genitore → `photo_pending_url` con notifica alla società e approvazione/rifiuto (`POST /players/{id}/photo/review`)
- [x] Registrazione società (`routers/registration.py`): (a) codice invito per società (admin Società → «Invito», `FSL-XXXX-XXXX`, 30 gg, uso singolo, rigenerazione invalida il precedente) → `/registrati-societa?codice=…` crea responsabile + membership e accede; (b) `/richiedi-accesso` → richiesta in Control Room → Utenti («Richieste di accesso società») con Approva (crea società se nuova + utente con password temporanea mostrata una volta) / Rifiuta. Link in /login. Test 25/25 backend + tutti i flussi frontend (`iteration_13.json`)

## Implementato (2026-06) – Iterazione 14
- [x] Prodotti digitali a 2,49 € (`routers/products.py`, Stripe price `fsl_digital_249`): **Cartolina squadra** 1080×1350 (canvas `TeamCard.jsx`: stemma, rosa, classifica, marcatori, badge; anteprima con filigrana + acquisto dalla homepage società) e **Album stagione** per bambino (`DigitalProduct.jsx`: cartolina, badge, interviste, foto taggate, storico gare, stampa PDF; acquisto dalla scheda giocatore, solo con consenso o per genitore/staff). Link personale `/tornei/:slug/prodotti/:token` (sempre aggiornato), apertura da /payment/success e da «I miei acquisti». Test 16/16 backend + flussi frontend (`iteration_14.json`)

## Implementato (2026-06) – Iterazione 15 · Check mobile (iPhone 390px)
- [x] Overflow orizzontale eliminato su tutte le pagine pubbliche, Area Società e Control Room: regole globali (`.grid > * { min-width:0 }`, `html/body overflow-x:hidden`, `.fsl-card min-w-0`), StandingsTable responsive (V/N/P/GF/GS/DR/Forma nascoste sotto i breakpoint, padding celle ridotto), righe pagelle con badge a capo, nav Area Società scrollabile con fade, badge «anomalie» separato nelle rose admin. Verificato 13 pagine pubbliche + 3 società + 4 admin (`iteration_15.json`)

## Implementato (2026-06) – Iterazione 16 · Area Arbitro iPhone
- [x] RefereeShell: nav a 3 tab reali (Partite / Referti / Guida), rimossi placeholder e campanella inattiva, chip data; lista con blocco «In corso / Oggi / Prossima gara» + CTA «Apri il tabellino»; pagina Referti inviati; Guida rapida in 4 passi; workspace gara arbitro con sole tab Tabellino/Storia; pulsante indietro accessibile; badge stato su una riga. Verificato 5/5 scenari mobile + regressione desktop (`iteration_16.json`)

## Implementato (2026-06) – Iterazione 17 · Processo gara completo
- [x] Scadenza convocazioni società: ore 20:00 del giorno precedente (`callup_deadline`, `callup_locked_for_club`; admin/segreteria/arbitro non bloccati) con avviso nel workspace
- [x] Quota gara sulle presenze effettive: pannello «Quota gara» in Compila gara (staff) con presenti × quota, «Incassa e genera ricevuta» → addebito aggiornato + pagamento con ricevuta `RIC-YYYY-NNNN` (`POST /matches/{id}/fees/collect`), visibile in Pagamenti
- [x] Richiesta aggiunta giocatore dalla società (Rose → «Richiedi aggiunta giocatore») → richiesta in Control Room → Rose con approvazione «Rivedi e carica». Test 9/9 backend + frontend (`iteration_17.json`; il testing agent ha corretto un ReferenceError `tournamentId→tid` in MatchWorkspace)

## Iterazione 18 (2026-06) · Fix lint + regressione flusso gara
- [x] `matches.py`: ripristinata `sheet_problems(m, attendance)` (era stata fusa per errore in `match_fees` → F821), import ordinati; ruff F821 pulito, backend 200
- [x] Regressione via API: convocati → presenze (4 presenti/1 assente) → incasso 10,00 € RIC-2026-0007, doppio incasso 409, tabellino bozza `in_progress`, `GET /matches/{id}` espone `fees` e `callup_deadline`
- Stand-by (scelta utente): email automatiche

## Iterazione 19 (2026-06) · Incassi giornata + promemoria convocazione
- [x] Control Room → Pagamenti: sezione «Incassi per giornata e campo» (`DailyTakings.jsx`, `GET /payments/daily`): card per giorno (Europe/Rome) con totale, n. ricevute, metodi; dettaglio per campo con righe ora/ricevuta/società/gara/presenti/importo; export CSV contabilità (`GET /payments/export[?date=]`, `;` separato, BOM, riga Totale) per tutto o per giornata; solo staff (403 società)
- [x] Genitori: notifica in-app «{nome} è convocato: Casa – Ospite» (orario, campo, sede, turno) al salvataggio convocazioni (`notify_callups` da `save_callups`) e promemoria «Domani/Oggi in campo» generato dalle 18:00 del giorno prima (`_children_reminders` in `GET /me/notifications`), dedupe; icona maglietta nella campanella. Test 8/8 backend + frontend (`iteration_18.json`)
- [x] Impostazioni torneo → «Quote, documenti e canali»: campo **Quota atleta (€)** (`fees.callup_fee`, passo 0,5) usato per addebiti e incasso dal tabellino (`settings-callup-fee-input`)
- [x] Quota atleta **per categoria** (`fees.callup_fee_by_category` {categoria: €}, vuoto = quota generale): griglia per categoria nelle Impostazioni (`settings-callup-fee-{cat}`), helper `callup_fee_for(settings, category)` usato da tabellino (`match_fees`), addebiti (`charge_callups`) e incassi; riepilogo per categoria in Pagamenti e categoria nel pannello Quota gara
- [x] Pulizia etichette «Fase 3/4/5/6/7»: Overview con KPI reali «Referti da ufficializzare» (→ Referti) e «Segnalazioni aperte» (→ Ticket) (`counts.reports_pending/tickets_open/matches_live`), «Campi in parallelo» reale (`FieldsBoard.jsx`: gare di oggi o prossima giornata per campo/slot, stato, link al tabellino); dashboard società con KPI reali cliccabili (documenti in scadenza, saldo da pagare/pagato, prossima gara) da `GET /me/club`; rimossi `ClubModule`/`PublicModule` placeholder, `/segnala-errore` → redirect a Partite; colonna MFA «Non attiva» (MFA non implementata, rinviata)

## Stato implementazioni (check 2026-06)
Completo e testato: Match Engine (calendario, tabellino unico, referti, rettifiche), classifiche/statistiche pubbliche, badge engine + premi (griglia ordinabile, premio speciale), social card gara, blog/news/interviste (tag società/gara/giocatori), shop foto/video (Stripe, anteprima video automatica), documenti società, import rosa Excel con approvazione, homepage società (editor società con approvazione + editor admin diretto, immagini di default, gallery), account genitore (preferiti, notifiche mirate, segnalazioni, «I miei bambini», acquisti), scheda giocatore («Mi presento», dicono di me, media taggati, foto con approvazione, cartolina), prodotti digitali 2,49 € (cartolina squadra, album stagione), registrazione società (codice invito + richiesta con approvazione), PWA + logo custom, responsive mobile.
Parziale / da completare: consenso privacy digitale del genitore (oggi flag gestito da società/admin); invio email (credenziali, inviti, link acquisti) — nessun provider configurato; notifiche solo in-app (niente push/email).

## Backlog prioritizzato
- ~~P1 Registrazione società~~ (fatto, iterazione 13)
- P0 (Fase 3 residuo): blackout campi/indisponibilità, drag-and-drop calendario, versioni bozza/pubblicazione, recuperi in settimana
- P1 (Fase 5): comunicazioni email/SMS (provider da scegliere), segnalazione pubblica con captcha, rimborsi Stripe da Control Room
- P1 (Fase 6): sponsor, personalizzazione visiva società con approvazione, anteprima video (thumbnail) per lo shop, pacchetti foto scontati
- P2 (Fase 7): MFA SA/DT, rate limiting, WCAG audit, backup, monitoring

## Decisioni aperte
Provider email/SMS; policy retention; Pantone su mazzetta fisica. Stripe: sandbox da reclamare (link onboarding nel riepilogo), modalità fiscale attuale «Stripe gestisce tutto» (cambiabile su richiesta).
