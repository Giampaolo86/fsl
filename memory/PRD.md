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

## Backlog prioritizzato
- P0 (Fase 3): disponibilità campi/blackout, generatore bozza calendario (round robin, campi×slot da config, vincolo 1 gara/weekend), conflitti, quality score, versioni, pubblicazione, drag-and-drop
- P0 (Fase 4): assegnazioni arbitri, app arbitro (checklist, eventi, live, referto bloccato), ufficializzazione/rettifica solo DT con lock ottimistico, snapshot classifiche, statistiche, Match Center pubblico, aggiornamento ≤5s
- P1 (Fase 5): rose, documenti versionati (Object Storage, URL firmati), consensi, pagamenti/ricevute, comunicazioni (adapter email), ticket/segnalazioni pubbliche con captcha
- P1 (Fase 6): portale completo (partite, statistiche, news, media, sponsor), personalizzazione visiva società con approvazione
- P2 (Fase 7): MFA SA/DT, rate limiting, WCAG audit, backup, monitoring, export/cancellazione dati

## Decisioni aperte
Provider email/SMS; gateway pagamenti online (adapter); policy retention; Pantone su mazzetta fisica.
