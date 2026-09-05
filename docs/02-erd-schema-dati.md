# FSL – ERD / Schema dati (MongoDB, orientato a migrazione PostgreSQL)

## Regole trasversali
- Ogni collezione operativa ha `_id` (ObjectId, esposto come `id`), `tournament_id` (obbligatorio e **indicizzato** dove pertinente), `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` (soft delete).
- L'accesso ai dati passa **solo** dal layer `repositories/` (`ScopedRepository`) che inietta sempre il filtro `tournament_id` + `deleted_at: null`: nessuna query di dominio può mescolare tornei.
- Indici univoci: `users.email`, `tournaments.slug`, `(tournament_id, competitions.code)`, `(tournament_id, clubs.slug)`, `(tournament_id, fields.code)`, `(user_id, tournament_id, role, club_id)` su memberships.
- Operazioni sensibili (ufficializzazione, rettifica, pagamenti, cambio stato torneo) usano transazioni Mongo (replica set) o, in fallback, lock ottimistico con campo `version` + `findOneAndUpdate` condizionale.
- Audit append-only: `audit_logs` accetta solo `insert` (nessun endpoint update/delete; indice TTL assente).

## Relazioni principali
```
organizations 1─n tournaments 1─n tournament_editions 1─n competitions 1─n competition_entries n─1 teams n─1 clubs
users 1─n tournament_memberships n─1 tournaments        (membership.club_id → clubs per club_manager)
tournaments 1─n venues 1─n fields 1─n field_availabilities / blackout_periods
competitions 1─n matches n─1 fields ; matches 1─n match_events, lineups, match_assignments (referee)
matches 1─1 referee_reports 1─n referee_report_versions ; matches 1─1 official_results 1─n result_change_logs
competitions 1─n standings_snapshots (versione per ogni ufficializzazione/rettifica)
teams 1─n player_registrations n─1 players 1─n guardians ; players 1─n documents / medical_certificates / consent_records
clubs 1─n fees / invoices / payments / receipts ; tickets 1─n ticket_messages ; news, media_assets, sponsors → tournament
```

## Collezioni (campi chiave)
**users** email(unique), password_hash, full_name, is_super_admin, mfa_enabled, status, last_login_at
**profiles** user_id, phone, avatar_asset_id, notification_prefs
**roles** code (super_admin|director|secretary|referee|club_manager|public), label, permissions[]
**tournament_memberships** user_id, tournament_id, role, club_id?, status
**organizations** name, slug, owner_user_id
**tournaments** organization_id, name, slug(unique), payoff, description, status(draft|active|completed|archived), template_key?, duplicated_from_id?, season_label, start_date, end_date, visual{primary,secondary,cover_asset_id}, published, archived_at, restored_at, version
**tournament_settings** tournament_id(unique), categories[], series[], teams_per_series, fields_count, match_days[], day_start, day_end, match_duration_min, buffer_min, slots[], formula, points{win,draw,loss}, tiebreakers[], playoff_rules{}, fees{}, required_documents[], notification_channels[]
**tournament_editions** tournament_id, label, start_date, end_date, is_current
**seasons** tournament_id, label, start, end
**categories** tournament_id, year, label
**competitions** tournament_id, edition_id, category_id, code, name, series, format, teams_count, rounds, status
**competition_rules** competition_id, points, tiebreakers[], playoff/playout/promotion/relegation zones
**competition_entries** competition_id, team_id, seed, status
**clubs** tournament_id, name, slug, short_name, colors{primary,secondary}, crest_asset_id(placeholder flag), cover_asset_id, description, venue_id, public_contacts[], approval_status
**club_contacts** club_id, name, role, phone, email, is_public, is_emergency
**venues** tournament_id, name, address, geo, services[], accessibility, notes
**fields** tournament_id, venue_id, code, name, size(8|11), surface
**field_availabilities** field_id, weekday, start, end ; **blackout_periods** tournament_id, field_id?, club_id?, referee_id?, start, end, reason
**teams** tournament_id, club_id, competition_id, name, category_year, series, colors_override?, crest_asset_id?
**team_staff** team_id, user_id?, name, role
**players** tournament_id, club_id, first_name, last_name, birth_date(private), public_alias?, photo_asset_id, consent_state
**guardians** player_id, name, phone, email (privati) ; **player_registrations** player_id, team_id, number, status
**documents / document_versions / consent_records / medical_certificates** owner refs, storage_key(private, URL firmato), expires_at, version, status
**matches** tournament_id, competition_id, round, home_team_id, away_team_id, field_id, kickoff_at, slot, status(draft|scheduled|confirmed|in_progress|finished|report_submitted|official|under_review|rectified|postponed|cancelled), score{home,away}, version
**match_slots** tournament_id, date, field_id, time, match_id? ; **match_assignments** match_id, referee_user_id, status
**lineups / match_events** match_id, team_id, player_id, minute, type
**referee_reports / referee_report_versions** match_id, referee_id, checklist, events[], score, notes, attachments[], status(submitted|reopened), locked
**official_results** match_id, score, officialized_by, officialized_at, version ; **result_change_logs** match_id, before, after, reason, author, attachments[], created_at
**standings_snapshots** competition_id, version, trigger(match_id), rows[{team_id,PG,V,N,P,GF,GS,DR,PT,form}], created_at
**team_statistics / player_statistics / disciplinary_records** aggregati solo da official/rectified
**schedule_constraints / schedule_versions** tournament_id, params, quality_score, conflicts[], status(draft|published)
**fees / invoices / payments / payment_allocations / receipts** tournament_id, club_id, amount, due_date, status, method(bank_transfer|manual|provider), provider_ref, attachments[]
**contacts / communication_templates / communications / notifications** tournament_id, recipients[], channel, template_id, status, attempts, sent_at, object_ref
**tickets / ticket_messages / attachments** tournament_id, type, object_ref(match|payment|player|document), status(open|info_requested|under_review|rejected|rectified|closed), reporter
**news / media_assets / sponsors** tournament_id, slug, title, body, cover, published_at ; media_assets con `visibility(public|private)` e `approval_status`
**audit_logs** tournament_id?, actor_id, actor_role, action, entity, entity_id, before, after, reason, ip, created_at — **append-only**

## Differenze rispetto a PostgreSQL (documentate)
| Requisito | Implementazione Mongo |
|---|---|
| Foreign key | Riferimenti ObjectId validati nel service layer; nessuna cascata implicita |
| RLS | `ScopedRepository` + dipendenze FastAPI `require_tournament_access` / `require_club_scope`; il filtro è applicato lato API, mai lato frontend |
| Transazioni | Sessioni Mongo dove disponibile + lock ottimistico `version` |
| Vincoli univoci | Indici unique composti creati allo startup |
| Snapshot/versioni | Documenti immutabili (`standings_snapshots`, `*_versions`, `result_change_logs`) |
| Migrazioni | Cartella `backend/app/migrations/` con script idempotenti numerati + collezione `schema_migrations` |
