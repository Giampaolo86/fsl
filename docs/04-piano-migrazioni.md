# FSL – Piano delle migrazioni

Le migrazioni sono script Python idempotenti in `backend/app/migrations/`, eseguiti allo startup e tracciati nella collezione `schema_migrations` (`{key, applied_at}`). Ogni script crea indici/collezioni e, se necessario, trasforma dati esistenti. Il seed demo è separato (`app/seed.py`) e rimovibile con `SEED_DEMO=false` / `POST /api/admin/seed/purge` (solo Super Admin, non in production).

| # | Chiave | Contenuto | Fase |
|---|---|---|---|
| 001 | `core_auth` | `users(email unique)`, `login_attempts(identifier)`, `password_reset_tokens(TTL)`, `roles` | F1 |
| 002 | `tournaments` | `tournaments(slug unique, status)`, `tournament_settings(tournament_id unique)`, `tournament_memberships(user_id+tournament_id+role+club_id unique)`, `organizations` | F1 |
| 003 | `competitions` | `seasons`, `tournament_editions`, `categories`, `competitions(tournament_id+code unique)`, `competition_rules`, `competition_entries` | F1 |
| 004 | `clubs_venues` | `clubs(tournament_id+slug unique)`, `club_contacts`, `venues`, `fields(tournament_id+code unique)`, `teams(tournament_id+competition_id+club_id)` | F1 |
| 005 | `audit` | `audit_logs(tournament_id, created_at)`, `(entity, entity_id)` – append-only | F1 |
| 006 | `scheduling` | `field_availabilities`, `blackout_periods`, `schedule_constraints`, `schedule_versions`, `match_slots(tournament_id+date+field_id+time unique)` | F3 |
| 007 | `matches` | `matches(tournament_id+competition_id+round, kickoff_at, status)`, `match_assignments`, `lineups`, `match_events` + vincolo applicativo "una squadra un solo match per weekend" | F3/F4 |
| 008 | `reports_results` | `referee_reports`, `referee_report_versions`, `official_results(match_id unique)`, `result_change_logs` | F4 |
| 009 | `standings` | `standings_snapshots(competition_id+version unique)`, `team_statistics`, `player_statistics`, `disciplinary_records` | F4 |
| 010 | `rosters_compliance` | `players`, `guardians`, `player_registrations`, `team_staff`, `documents`, `document_versions`, `consent_records`, `medical_certificates` (indice `expires_at`) | F5 |
| 011 | `payments` | `fees`, `invoices`, `payments`, `payment_allocations`, `receipts` | F5 |
| 012 | `communications` | `contacts`, `communication_templates`, `communications`, `notifications(status, scheduled_at)` | F5 |
| 013 | `tickets` | `tickets(tournament_id, status, object_ref)`, `ticket_messages`, `attachments` | F5 |
| 014 | `media` | `news(tournament_id+slug unique)`, `media_assets(visibility, approval_status)`, `sponsors` | F6 |
| 015 | `hardening` | Campo `mfa_*` su users, `rate_limits`, indici di export, policy retention | F7 |

## Strategia di migrazione verso PostgreSQL (se richiesto)
1. Il dominio non conosce Mongo: i service usano `repositories/*` con interfaccia (`find_one`, `list`, `insert`, `update_versioned`, `append`).
2. I documenti sono già normalizzati per entità (nessun embedding profondo salvo array di valore: slot, tie-break, righe snapshot).
3. Gli ID sono stringhe stabili: in PG diventano `uuid`/`text` PK senza rinumerazioni.
4. Ordine di porting: `roles/users` → `tournaments/*` → `clubs/venues` → `matches/results` → `standings` → restanti.
