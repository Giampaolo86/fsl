# FSL — Audit tecnico, sicurezza e consolidamento (giugno 2026)

Ambiente verificato: preview Emergent (`APP_ENV=development`), commit successivo a `1039ccc`.
Legenda: **[IT]** implementato e testato · **[IN]** implementato ma non testato · **[R]** solo raccomandato · **[NV]** non verificabile qui.

## 1. Problemi identificati e gravità
| # | Gravità | Problema | Stato |
|---|---------|----------|-------|
| 1 | CRITICA | Chiave Stripe test hardcoded in `club_extras.py` e file `.stripe_sandbox.json` tracciato in git | Corretto [IT] — chiave solo da `.env`, file in `.gitignore`. Resta nella cronologia git (vedi §6) |
| 2 | CRITICA | `seed.py` riscriveva la password del Super Admin a ogni riavvio e creava account demo anche in produzione | Corretto [IT] — reset solo con `ADMIN_FORCE_PASSWORD_RESET=true`; demo solo se `SEED_DEMO=true` e `APP_ENV!=production`; login `*@fsl.demo` bloccato in produzione |
| 3 | ALTA | Token JWT in localStorage + cookie, nessuna revoca, refresh senza rotazione, logout non invalidava nulla | Corretto [IT] — solo cookie HttpOnly/Secure/SameSite; sessioni server-side (`sessions`), refresh con rotazione e rilevamento riuso (revoca), logout/logout-all/revoca singola, accesso 20 min |
| 4 | ALTA | Nessuna protezione CSRF, CORS `*` con credenziali | Corretto [IT] — double-submit `X-CSRF-Token`; CORS da `CORS_ORIGINS`/`CORS_ORIGIN_REGEX`, metodi/header espliciti; header di sicurezza (nosniff, frame DENY, referrer) |
| 5 | ALTA | MFA solo etichetta (`mfa_required` non applicato) | Corretto [IT] — TOTP obbligatoria per Super Admin/Direttore (setup con QR + 8 codici di recupero al primo login, sfida ai login successivi, blocco dopo 6 codici errati), opzionale per gli altri ruoli, azzeramento da admin |
| 6 | ALTA | Utenti disabilitati/membership revocate: nessun endpoint, sessioni attive restavano valide | Corretto [IT] — `PATCH /users/{id}/status` (revoca sessioni), `DELETE /users/memberships/{id}`; ogni richiesta verifica sessione + stato utente |
| 7 | MEDIA | Password: policy debole (8 char), nessun cambio/reset | Corretto [IT] — min 10, lettere+numeri, no email; `POST /auth/password/change` (revoca altre sessioni); password temporanea da admin con cambio obbligato al primo accesso (`/cambia-password`) |
| 8 | MEDIA | Brute force solo per ip+email | Migliorato [IT] — anche lock per email (20) e per IP su Google; 429 dopo 5 tentativi |
| 9 | MEDIA | `/docs` e `/openapi.json` esposti | Corretto [IN] — disattivati con `APP_ENV=production` |
| 10 | MEDIA | Variabili d'ambiente critiche con default silenziosi | Corretto [IT] — avvio fallisce se mancano `MONGO_URL/DB_NAME/JWT_SECRET/ADMIN_EMAIL/ADMIN_PASSWORD` o se `JWT_SECRET` < 32 char |
| 11 | BASSA | Etichette «Fase 3-7» e moduli segnaposto con dati fittizi | Corretto [IT] (iterazione precedente) |
| 12 | INFO | Google login collega automaticamente account esistenti via email | **Lasciato com'è per scelta del cliente**; comunque soggetto a MFA per ruoli privilegiati |

## 2. Controllo permessi (endpoint backend)
- Scansione automatica di tutti i router: **tutti** gli endpoint `/tournaments/{id}/...` autenticati passano da `require_tournament` (scoping torneo + ruolo); tutte le scritture usano `writable=True` (tornei archiviati → 423 sola lettura) [IT tramite suite].
- Responsabile Società: rose/giocatori/documenti/convocazioni limitati alla propria società (`club_in`) [IT suite esistente].
- Arbitro: tabellino/referto solo sulla gara assegnata e solo negli stati consentiti [IT suite esistente].
- Segreteria: esclusa da ufficializzazione/rettifica/chiusura competizioni (`OPS`) [IT suite esistente].
- Endpoint pubblici: nessuna esposizione di email tutori o dati anagrafici sensibili dei minori.
- Gestione utenti: Direttore agisce solo su utenti dei propri tornei; solo Super Admin gestisce altri Super Admin e azzera la MFA dei Direttori [IT].

## 3. File modificati
Backend: `server.py`, `app/core/security.py`, `app/core/sessions.py` (nuovo), `app/core/deps.py`, `app/routers/auth.py`, `app/routers/users.py`, `app/routers/registration.py`, `app/routers/fans.py`, `app/routers/club_extras.py`, `app/models/domain.py`, `app/seed.py`, `tests/conftest.py` (nuovo), `tests/test_auth_v2.py` (nuovo), `tests/backend_test.py`, `requirements.txt` (+pyotp, qrcode), `.env` (+`QA_TOTP_SECRET`, `COOKIE_SAMESITE`, `COOKIE_SECURE`).
Frontend: `src/lib/api.js`, `src/context/AuthContext.jsx`, `src/routes/ProtectedRoute.jsx`, `src/pages/Login.jsx`, `src/pages/Security.jsx` (nuovo: `/sicurezza`, `/cambia-password`), `src/components/fsl/Mfa.jsx` (nuovo), `src/components/fsl/ErrorBoundary.jsx` (nuovo), `src/pages/admin/Users.jsx`, `src/components/layout/*Shell.jsx`, `src/App.js`, `package.json` (+qrcode.react).

## 4. Test eseguiti
- `tests/test_auth_v2.py` (testing agent): 14/14 PASS — login+MFA, CSRF, rotazione/riuso refresh, lockout, policy password, utenti (creazione, password temporanea, disabilitazione, 403 società), sessioni, MFA disable 403.
- E2E frontend (testing agent, iteration_20 + verifica finale): login errato, sfida MFA Direttore, `/sicurezza`, logout, redirect protetti, Google button, login genitore, auto-refresh dopo scadenza access cookie, pagina Utenti con azioni.
- Suite pregressa (`pytest tests`): 177 passati; **~10 test obsoleti** falliscono per drift dei dati demo (conteggio squadre 22≠18, fixture prodotti/ordine `pytest.iter13_code`), non legati alla sicurezza → da aggiornare.
- Build frontend `yarn build`: OK. Lint backend (ruff F/E9): OK.

## 5. Problemi ancora aperti / raccomandazioni
- **[R]** Ruotare la chiave Stripe test finita nella cronologia git (Dashboard Stripe → Developers → API keys) e, se il repo è pubblico, ruotare `JWT_SECRET` in produzione (invalida tutte le sessioni).
- **[R]** Impostare in produzione: `APP_ENV=production`, `SEED_DEMO=false`, `CORS_ORIGINS=https://<dominio>`, `COOKIE_SAMESITE=lax`, `ADMIN_FORCE_PASSWORD_RESET` assente, `QA_TOTP_SECRET` assente.
- **[NV]** Rate limiting a livello di ingress/CDN e backup automatici MongoDB (dipendono dall'hosting).
- **[R]** Email transazionali (reset password self-service, inviti) — in stand-by per scelta del cliente.
- **[R]** Aggiornare i ~10 test obsoleti della suite pregressa.
- **[IN]** Header `Cache-Control: no-store` su `/api/auth/*` e docs disattivati in produzione: non verificabili senza deploy.

## 6. Rischi residui prima della pubblicazione
1. Il Super Admin reale al primo login dovrà configurare la MFA: conservare i codici di recupero. In caso di perdita totale, l'azzeramento richiede un intervento sul database (`mfa_enabled=false`).
2. La cronologia git contiene una chiave Stripe **test** (nessun impatto su denaro reale): ruotarla.
3. Tutti gli utenti dovranno rifare il login dopo il rilascio (sessioni precedenti non valide).

## 7. Versione
Commit di riferimento: quello successivo a `1039ccc checkpoint before testing_agent_full_stack` (auto-commit Emergent). Usare «Salva su GitHub» per pubblicare il tag di versione.
