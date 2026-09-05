# FSL – Matrice permessi (RBAC + scope torneo/società)

Ruoli: **SA** Super Admin · **DT** Direttore Torneo · **SG** Segreteria · **AR** Arbitro · **RS** Responsabile Società Ospite · **PU** Pubblico.
Scope: SA = globale; DT/SG/AR = solo tornei con membership; RS = solo il proprio club nei tornei con membership; PU = solo dati `published`.
Un torneo `archived` è **sola lettura** per tutti: le mutazioni restituiscono `409 TOURNAMENT_READ_ONLY`; solo SA può ripristinare (`POST /restore`, motivazione obbligatoria, audit).

| Capacità | SA | DT | SG | AR | RS | PU |
|---|---|---|---|---|---|---|
| Vedere Hub tornei | tutti | assegnati | assegnati | assegnati (solo lista) | assegnati | pubblicati |
| Creare/duplicare torneo | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| Modificare impostazioni torneo | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| Cambiare stato torneo (draft→active→completed→archived) | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| Ripristinare torneo archiviato | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ |
| Gestire utenti/ruoli/membership | ✔ | membership del proprio torneo (DT/SG/AR/RS) | ✖ | ✖ | ✖ | ✖ |
| Competizioni, categorie, serie, formule | ✔ | ✔ | lettura | ✖ | lettura | lettura pubbl. |
| Società, squadre, inviti | ✔ | ✔ | ✔ | ✖ | solo propria (dati non strutturali) | lettura pubbl. |
| Campi, sedi, disponibilità | ✔ | ✔ | lettura | lettura | lettura | lettura pubbl. |
| Generatore calendario / pubblicazione | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| Assegnazione arbitri | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| Compilare/inviare referto | ✔* | ✔* | ✖ | solo gare assegnate | ✖ | ✖ |
| Riaprire referto (motivato) | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| **Ufficializzare / rettificare risultato** | ✔ | **✔ (unico ruolo operativo)** | ✖ | ✖ | ✖ | ✖ |
| Inserimento diretto risultato (motivato) | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| Classifiche/statistiche | ✔ | ✔ | lettura | lettura | lettura | lettura pubbl. |
| Rose, documenti, consensi, idoneità | ✔ | lettura + idoneità | ✔ | lista gara assegnata | propria società | ✖ |
| Dati privati minori (data nascita, tutori, documenti) | ✔ | ✔ | ✔ | ✖ | propria società | ✖ |
| Pagamenti, ricevute, riconciliazione | ✔ | lettura | ✔ | ✖ | propria società (lettura + carica bonifico) | ✖ |
| Comunicazioni e solleciti | ✔ | operative | ✔ | ✖ | ricezione | ✖ |
| Ticket/segnalazioni: creare | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ (captcha, dati minimi) |
| Ticket: respingere / info / in revisione / rettificare | ✔ | ✔ (sportivi) | ✔ (amministrativi) | ✖ | ✖ | ✖ |
| News, media, sponsor | ✔ | ✔ | ✔ | ✖ | propri materiali (soggetti a revisione) | lettura |
| Approvare/rimuovere materiali società | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| Audit log | ✔ globale | proprio torneo | proprio torneo (solo moduli propri) | ✖ | ✖ | ✖ |
| Esportazioni | ✔ | ✔ | ✔ (moduli propri) | ✖ | propri dati | ✖ |
| Impostazioni globali, integrazioni, sicurezza, MFA policy | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ |

\* SA/DT possono compilare per conto dell'arbitro solo con motivazione (audit `on_behalf_of`).

## Enforcement lato API (già in Fase 1)
- `get_current_user` (JWT httpOnly cookie o Bearer) → `require_roles(...)` → `require_tournament_access(tournament_id)` che verifica membership o `is_super_admin`.
- `require_writable_tournament` blocca ogni mutazione su torneo `archived`.
- `require_club_scope` per RS: `club_id` della membership deve coincidere con la risorsa.
- Ogni mutazione scrive in `audit_logs` (actor, entity, before/after, reason).
- Errori strutturati: `{"code": "FORBIDDEN_ROLE" | "TOURNAMENT_SCOPE" | "TOURNAMENT_READ_ONLY" | "NOT_FOUND" | "CONFLICT" ..., "detail": "..."}`.
