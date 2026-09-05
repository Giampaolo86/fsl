# FSL – Piano fasi, rischi e decisioni

## Fasi
| Fase | Contenuto | Uscita |
|---|---|---|
| **1 Fondazioni** (consegnata) | Design token, component library, modello dati + migrazioni 001-005, auth JWT + RBAC + scope torneo, audit append-only, seed demo, shell responsive (Hub, Control Room, Area Società, Arbitro, Portale) | Preview navigabile, docs, test API |
| **2 Motore multi-torneo** (iniziata) | Hub: creazione da zero/modello/duplica, stati, archivio/ripristino, membership; competizioni, categorie, serie, formula; società, squadre, campi | ✔ Hub e creazione/duplica/archivio in questa consegna |
| 3 Calendario | Disponibilità, blackout, generatore bozza (campi e slot da configurazione), conflitti, quality score, drag-and-drop, versioni, pubblicazione, vincolo weekend | Demo generatore su Serie A dei Bambini (3 campi × 7 slot) e Torneo degli Amici (2 campi) |
| 4 Match operations | Assegnazioni, app arbitro mobile, eventi, referto bloccato, ufficializzazione/rettifica (solo DT), snapshot classifiche, statistiche, aggiornamento pubblico ≤5s | Demo flusso vincolante |
| 5 Società e segreteria | Rose, documenti versionati, consensi, pagamenti/ricevute, comunicazioni, ticket | Demo Area Società |
| 6 Portale pubblico | Home completa, Partite, Match Center, Squadre/Sedi, Statistiche, News, Media, personalizzazione visiva società con approvazione | Demo portale |
| 7 Hardening | WCAG 2.2 AA audit, MFA SA/DT, rate limit, upload scan, URL firmati, backup, monitoring, test e2e | Go-live checklist |

## Rischi principali
1. **Transazioni Mongo** richiedono replica set: in ambiente preview usiamo lock ottimistico (`version`) + operazioni atomiche; in produzione attivare replica set o Atlas.
2. **Storage privato con URL firmati**: da integrare in F5 tramite Emergent Object Storage (adapter).
3. **Realtime ≤5s**: polling leggero/SSE lato API; websocket non necessario.
4. **Generatore calendario** (1.224 gare, vincoli weekend, casa/trasferta): algoritmo round-robin + assegnazione slot con euristiche; validazione su quality score.
5. **Privacy minori**: separazione già in schema (players pubblici vs guardians/birth_date privati); consenso versionato in F5.
6. **MFA**: rinviata a F7 su decisione utente; ruoli SA/DT segnalati come "MFA richiesta" nel modello.

## Decisioni prese (con autorizzazione utente)
- Stack nativo Emergent: React (CRA) + FastAPI + MongoDB, con `tournament_id` obbligatorio e indicizzato, isolamento lato API, RBAC completo, audit append-only, versionamento, indici univoci, layer repository separato per futura migrazione PostgreSQL.
- Auth JWT custom (cookie httpOnly + Bearer fallback), redirect per ruolo.
- Immagini: stock/sintetiche solo come fallback; stemmi SVG **segnaposto** (`is_placeholder=true`); personalizzazione visiva da Area Società con approvazione DT/SA (F6).
- Interfaccia solo italiano.

## Decisioni aperte (non modificate autonomamente)
- Provider email (Resend/SendGrid) e SMS/WhatsApp: da scegliere in F5.
- Gateway pagamenti online (Stripe consigliato via adapter): da confermare in F5.
- Policy retention/cancellazione dati e responsabile privacy.
- Verifica Pantone su mazzetta fisica prima della stampa (fuori scope software).
