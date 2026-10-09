# FSL — Intervento definitivo: gerarchia Owner, Stripe, GitHub Actions (2026-10)

Base: commit `817b29c` (repo Giampaolo86/fsl). Nessuna modifica a rose, classifiche, Match Center, Top 11, FSL Weekly, prezzi, catalogo, layout. Nessuna credenziale reale modificata. Nessun dato di produzione toccato (lavoro su DB di anteprima + DB CI sintetico).

## A. GERARCHIA

| Voce | Stato | Dettaglio |
|------|-------|-----------|
| Owner identificato | RISOLTO E TESTATO | Account esistente indicato da `ADMIN_EMAIL`, associato **per ID persistente** `6a9b5b015d9e0985643d0a99` (DB anteprima) tramite `is_owner=true` + `owner_since`. Nessun nuovo account, credenziali intatte. In produzione il bootstrap avviene al primo avvio dopo il deploy, con le stesse regole (una sola volta; se gli account candidati sono ≠1 o non Super Admin **non fa nulla** e logga l'anomalia). |
| Numero di Owner | RISOLTO E TESTATO | **1**. Vincolo DB: indice unico parziale `uniq_owner` su `users.is_owner=true` → un secondo Owner è impossibile anche con accesso diretto al DB (`DuplicateKeyError`, testato). |
| Diritti Owner | RISOLTO E TESTATO | Tutti quelli di Super Admin (il `CurrentUser` dell'Owner è sempre `is_super_admin`), più: unico account non gestibile da altri. Gestisce pienamente gli altri Super Admin (testato: disabilita/riattiva/azzera MFA). |
| Diritti Super Admin | RISOLTO E TESTATO | Invariati: tornei (crea/elimina con conferma+backup), utenti, creazione e gestione di altri Super Admin non protetti, Control Room, Sicurezza (testato con SA sintetico). Unico limite: nessuna operazione sull'Owner. |
| Endpoint protetti | RISOLTO E TESTATO | `PATCH /users/{id}/status`, `DELETE /users/{id}`, `POST /users/{id}/temporary-password`, `POST /users/{id}/mfa/reset`, `POST /users/memberships`, `DELETE /users/memberships/{id}`, `POST /auth/impersonate/{id}` → `403 OWNER_PROTECTED` (via `_manageable()` + `assert_owner_protected`). Password/email/MFA dell'Owner immutate dopo i tentativi (verificato campo per campo). L'Owner **non può eliminare sé stesso** (testato con sessione Owner). |
| Protezione servizi/dati | RISOLTO E TESTATO | `services/owner.py` (`is_owner`, `require_owner`, `assert_owner_protected`, `assert_not_owner_id`, `strip_owner_fields`); `cleanup.delete_user()` rifiuta l'Owner (anche se chiamato da purge/manutenzione); `disable_test_accounts_in_production` e `purge_test_data` lo escludono; `Repository.update/update_versioned` **scartano `is_owner`** su `users` (nessuna API ordinaria può impostarlo, testato anche con payload `is_owner: true` su POST /users e PATCH profilo); `backups.restore` rimuove `is_owner/owner_since` da eventuali documenti utente; `seed.upsert_user` **non reimposta mai** la password dell'Owner (né di account con MFA, né in produzione) anche con `ADMIN_FORCE_PASSWORD_RESET=true` (testato); `bootstrap_owner` con `ADMIN_EMAIL` diverso **non migra** la proprietà (testato). |
| UI | RISOLTO E TESTATO (screenshot) | Utenti: badge «OWNER — FONDATORE FSL» con corona; al posto delle azioni «Account fondatore protetto» (tooltip). Sicurezza: etichetta Owner nell'elenco account privilegiati + protezione «Owner unico e protetto» (verified/error). Nessuna nuova sezione. |
| Trasferimento proprietà | NON IMPLEMENTATO (per scelta) | Non esiste alcuna API: avviene solo con procedura tecnica separata (accesso al DB + aggiornamento del documento con indice unico), fuori dal pannello. |

## B. STRIPE (`routers/club_extras.py`)

- **Macchina a stati ordine**: `pending/processing/failed/expired/canceled` → `settling` (lock atomico: `settling_at`, `settling_op`) → `paid` | `oversold`; `paid` → `refunded`. Il filtro di acquisizione **esclude `settling`** salvo lock scaduto (> 300 s: recupero operazioni interrotte). `_set_status` non tocca mai `settling/paid/oversold/refunded`.
- **Stock**: incremento atomico `sold < stock`; flag `stock_reserved` sull'ordine → un retry dopo interruzione **non incrementa due volte** (testato). Esaurito → `oversold` + evento alta gravità.
- **Consegna una sola volta**: voucher generato solo se assente (testato: due eventi diversi sullo stesso ordine → stesso voucher); push pass concesso solo al passaggio definitivo a `paid`.
- **Eventi webhook**: `stripe_events` con stati `processing → processed | failed` (`attempts`, `worker`, `started_at`, `finished_at`, `error`). `DuplicateKeyError` catturata specificamente; un evento `failed` o `processing` da > 120 s viene **ripreso** (retry sicuro), uno `processed` è `duplicate`. Errore in elaborazione → stato `failed` + HTTP 500 così Stripe reinvia (testato).
- **Rimborsi**: transizione per singolo ordine `paid → refunded` con decremento stock **solo** in quel passaggio: 3 eventi di rimborso identici → stock −1 una volta (testato).
- **Test eseguiti (sintetici, firmati con il segreto webhook, nessun pagamento reale)**: webhook identici ×2, eventi diversi stesso ordine, 4 webhook simultanei, stock insufficiente (`oversold`), lock `settling` occupato / scaduto, retry dopo interruzione con stock già prenotato, evento registrato e fallito poi reinviato, pagamento `complete+unpaid` → `processing` (nessun download), asincrono riuscito, asincrono fallito, firma invalida, rimborso ripetuto. **Tutti superati** (`tests/test_security_phase2.py`, 27 test).
- Non usate transazioni multi-documento (richiederebbero replica set): tutte le garanzie derivano da aggiornamenti atomici su singolo documento con filtri di stato.

## C. SICUREZZA

| Voce | Stato | Note |
|------|-------|------|
| MFA Owner/Super Admin obbligatoria; sessioni privilegiate non verificate bloccate | RISOLTO E TESTATO | Invariato dalla fase 2 e ri-verificato. **Ancora senza MFA**: `liviadm15@gmail.com`, `alessioodt@gmail.com` (nel DB anteprima) → bloccati sulle operazioni admin finché non la attivano al login. Nessuna modifica ai loro account. |
| Cancellazione utenti | RISOLTO E TESTATO | Richiede: Super Admin, `require_recent_auth` (10 min, `POST /auth/reauth`), email esatta, bersaglio ≠ Owner, audit `user.delete` (tutti testati). |
| Backup | RISOLTO E TESTATO (anteprima) | Export/ripristino verificati; in anteprima su Object Storage Emergent (durevole, gestito dalla piattaforma); in CI su disco. La proprietà non è ripristinabile da backup. Storage di **produzione**: NON VERIFICABILE da qui (stessa API Object Storage con la chiave di produzione). |
| Credenziali | RISOLTO E TESTATO | Nessun segreto nei file tracciati (gitleaks 0, test dedicato); `qa_admin.py` con verifica positiva; account di test bloccati/disabilitati in produzione. Rotazione password Owner in produzione: azione tua (vedi E). |
| Rate limiting, revoca sessioni, audit accessi | RISOLTO E TESTATO | Suite fase 2 rieseguita (27/27). |
| Protezione branch `main` | NON VERIFICABILE da qui (vedi E) | Nessun accesso alle impostazioni GitHub. |
| Rischi residui | — | (1) due Super Admin reali senza MFA fino al loro prossimo login; (2) cronologia Git con vecchie credenziali (scelta: niente rewrite → inutilizzabili solo dopo la rotazione in produzione); (3) `frontend/yarn.lock` non tracciato dal flusso di commit della piattaforma (build CI non riproducibile al bit). |

## D. GITHUB ACTIONS

- Run precedente `37940415888`: 3/4 verdi; backend fallito su «QA account» per `ModuleNotFoundError: app` (percorso assoluto `/app/backend`). **Corretto**: `qa_admin.py` risolve percorsi e `.env` da `__file__`.
- Run `37893830464`: fallita su «Install backend» (conflitto pip `litellm#sha256`) — già corretta in `requirements.txt`.
- **Simulazione completa del job backend in locale** (venv pulito, `pip install -r requirements.txt`, MongoDB dedicato `fsl_ci_test`, variabili identiche al workflow, API avviata, `qa_admin.py create`, pytest): **35 passed, 2 skipped** (`test_security_phase2.py` + `test_owner_hierarchy.py`; gli skip riguardano dati presenti solo in anteprima). Gitleaks locale: 0 leak sui file tracciati. pip-audit: 0 vulnerabilità. Audit frontend: 0 bloccanti.
- Workflow aggiornato: il job backend esegue entrambe le suite. **Commit finale / link pipeline**: la run parte al prossimo «Save to GitHub» (non posso pubblicare da qui): stato → IMPLEMENTATO MA NON TESTATO su GitHub; verificabile su https://github.com/Giampaolo86/fsl/actions.
- Report coerenti: `test_reports/iteration_46.json` è **generato dal JUnit** `test_reports/pytest/iteration46.xml` dello stesso run (69 passed, 0 failed). La discrepanza di iteration_45 (purge-test-data con `keep_slugs` vuoto → 403) è stata corretta nel codice: ora `422` (validazione `min_length=1`) e il test della società prova l'autorizzazione con un payload valido (403).

## E. OPERAZIONI MANUALI RESIDUE

1. **Save to GitHub** e controllo della run «Security checks» (4 job): non posso pubblicare né eseguire la pipeline da questo ambiente.
2. **Protezione del branch `main`** (Settings → Rules → Rulesets → New branch ruleset → target `main`): attiva **«Block force pushes»** e **«Restrict deletions»**. **Non** attivare «Require a pull request» né «Require status checks to pass» finché il flusso Emergent pubblica direttamente su `main`: bloccherebbero la pubblicazione. Se in futuro vuoi il gate sui controlli, serve passare a un branch di lavoro + PR.
3. **Password Owner in produzione**: se è ancora quella comparsa nel repository, cambiala da `/sicurezza → Cambia password` (solo tu puoi farlo: nessun altro account e nessun processo può più reimpostarla).
4. **MFA** di `liviadm15@gmail.com` e `alessioodt@gmail.com`: devono accedere e completare l'attivazione guidata.
5. **Variabili di produzione**: rimuovere `QA_TOTP_SECRET`, `SEED_DEMO`, `ADMIN_FORCE_PASSWORD_RESET` (se presenti); confermare `APP_ENV=production`.
6. **`frontend/yarn.lock`**: committarlo nel repository (il flusso automatico non lo include) per build CI riproducibili.
