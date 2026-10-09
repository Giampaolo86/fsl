# FSL — Intervento correttivo urgente: percorsi credenziali Owner, Stripe, CI (2026-10)

Base: commit `85846fd`. Ambienti: **anteprima Emergent** (DB `test_database`) e **simulazione locale del job CI** (venv pulito, DB `fsl_ci_test`). GitHub Actions e produzione: vedi D ed E (non eseguibili/verificabili da qui).

## A. ANALISI DELLE OMISSIONI PRECEDENTI

**Domanda 1 — perché `/api/auth/reset-requests/link` è rimasto scoperto.**
Fatto verificabile: nell'iterazione precedente l'inventario dei percorsi pericolosi è stato costruito con una ricerca sui **punti di scrittura della collezione `users`** (`users.update(`, `db.users.update`, `users.delete`, `revoke_user_sessions(`). I risultati in `routers/auth.py` (righe `password/change`, `reset-password`, MFA) sono stati classificati "self-service" perché agiscono su `u = utente autenticato` o su un token. `reset_link_for_user()` **non scrive in `users`**: scrive in `password_resets` tramite `create_reset()`, quindi **non è comparso nell'inventario**. Classificazione: *analisi incompleta delle dipendenze* (inventario per "collezione toccata" invece che per "effetto finale": chiunque possa ottenere un token di reset può cambiare la password). Il controllo è stato applicato ai router `users.py` + `impersonate` perché erano i percorsi elencati nelle istruzioni e trovati dal grep; non è stato individuato né escluso consapevolmente: **non era stato individuato**. Non è un'ipotesi: è ricostruibile dal commit `9fa9066` (nessuna modifica a `create_reset`/`reset_link_for_user`) e dalla lista degli endpoint protetti nel rapporto precedente.

**Domanda 2 — perché i test non l'hanno rilevato.**
I test di `test_owner_hierarchy.py` (prima versione) erano scritti **a partire dall'elenco delle correzioni** (status/delete/temp-password/mfa-reset/membership/impersonate), non dall'obiettivo dell'attaccante ("ottenere il controllo delle credenziali Owner con qualunque mezzo"). Mancavano: emissione link di reset assistito, completamento di un reset con token amministrativo, visibilità dell'Owner nella lista `GET /auth/reset-requests`, verifica che il **documento Owner non cambi in nessun campo** dopo tutti i tentativi, canali personali dell'Owner (cambio password volontario, recupero senza SMTP). Ora coperti da `test_super_admin_cannot_obtain_reset_link_or_token_for_owner`, `test_owner_self_service_channels_remain_available`, `test_every_account_route_is_classified_and_target_routes_reject_owner`.

**Domanda 3 — Stripe.**
Il test precedente `test_interrupted_after_stock_reservation_does_not_double_increment` **seminava a mano `stock_reserved=True`**: verificava il recupero *dopo* che l'operazione B era già stata scritta, non l'interruzione *tra* A (incremento `sold`) e B (`stock_reserved`). Era quindi uno scenario diverso, e la dichiarazione di "idempotenza" era basata su quello. Il rischio A→B esisteva (due `update_one` separati). Ora A e B coincidono in **una sola operazione atomica** sul documento prodotto (vedi C) e il nuovo `test_crash_between_stock_increment_and_order_update_is_safe` inietta un'eccezione **subito dopo** l'incremento e **prima** dell'aggiornamento dell'ordine.

**Domanda 4 — GitHub Actions.**
Il fallimento (`test_no_hardcoded_secrets_in_tracked_sources`, run `37951001912`) **non era stato verificato** prima del rapporto: la run parte solo dopo «Save to GitHub», che avviene dopo la mia consegna. Nel rapporto la voce era segnata «IMPLEMENTATO MA NON TESTATO su GitHub», ma il riepilogo finale parlava di intervento "completato": è stata una comunicazione incoerente con lo stato reale. La causa del rosso era un **mio bug nel test**: `os.environ.get("CLUB_TEST_PASSWORD", "§")` usa un carattere di 1 byte come "segreto" → in CI (variabile assente) il test cercava `§` in tutti i file e lo trovava nel test stesso.

**Domanda 5 — criteri di accettazione usati.**
Criterio applicato: "tutti i test che ho scritto passano in anteprima + simulazione locale del job CI verde". Difetti: (a) i test derivavano dalla lista di fix, non da un modello delle minacce per effetto; (b) il "verde" della CI era simulato, non osservato su GitHub; (c) l'inventario dei percorsi non era un artefatto verificato da un test. Per questo vulnerabilità ancora aperte sono risultate "risolte".

**Domanda 6 — prevenzione introdotta (concreta, nel codice).**
1. **Inventario eseguibile**: `ROUTE_INVENTORY` in `tests/test_owner_hierarchy.py` elenca *ogni* rotta non-GET di `/auth` e `/users` con classificazione SELF/PUBLIC/TARGET; il test confronta l'elenco con le rotte reali dell'app → **una rotta nuova o rinominata fa fallire la CI finché non è classificata**, e ogni rotta TARGET deve avere una chiamata negativa contro l'Owner; a fine giro il documento Owner deve essere **identico byte per byte**.
2. **Guardia centrale sull'effetto**: `create_reset()` è l'unico emettitore di token e rifiuta l'Owner per ogni `requested_by != "user"`; `reset_password()` rifiuta token amministrativi per l'Owner; `sweep_owner_reset_tokens()` all'avvio invalida quelli residui. La protezione non dipende più da un singolo router.
3. **Test di errore reali**: iniezione di eccezioni tra le operazioni (Stripe) invece di stati seminati a mano.
4. **Autodiagnosi del controllo segreti**: `test_secret_scan_detects_a_planted_secret` pianta un segreto sintetico e pretende che il controllo fallisca.
5. **Rapporti per ambiente**: `test_reports/iteration_47.json` separa anteprima / simulazione CI / GitHub / produzione con stati espliciti; nessuna aggregazione.
6. **Regola di consegna**: un requisito di sicurezza viene dichiarato RISOLTO E TESTATO solo con test negativo che tenta l'operazione vietata *e* verifica l'assenza di effetti sul bersaglio; lo stato GitHub resta «NON VERIFICATO» finché non osservo la run.

## B. PROTEZIONE OWNER

| Percorso (metodo) | Effetto potenziale | Protezione | Test negativo |
|---|---|---|---|
| `POST /auth/reset-requests/link` | token reset → password | `assert_owner_protected` + guardia in `create_reset` (403 `OWNER_PROTECTED`, evento sicurezza) | RISOLTO E TESTATO |
| `create_reset()` (servizio) | emissione token da qualunque chiamante | rifiuta Owner se `requested_by != "user"` | RISOLTO E TESTATO |
| `POST /auth/reset-password` | completamento reset con token | token Owner con `requested_by != user` → 403 e invalidato | RISOLTO E TESTATO |
| `GET /auth/reset-requests` | rivelare richieste Owner | Owner escluso dalla lista | RISOLTO E TESTATO |
| `POST /auth/forgot-password` | token senza SMTP | per l'Owner senza SMTP: nessun token, `owner_procedure: true`; con SMTP: solo alla sua email | RISOLTO E TESTATO |
| Token già emessi | token assistiti residui | `sweep_owner_reset_tokens()` all'avvio (anteprima: 0 trovati; produzione: eseguito al deploy, conteggio nei log, mai il token) | RISOLTO E TESTATO (anteprima) |
| `POST /users/{id}/temporary-password`, `/mfa/reset`, `PATCH /status`, `DELETE /users/{id}`, memberships, `POST /auth/impersonate/{id}` | credenziali/MFA/sessioni/stato/ruoli | `_manageable()` → `assert_owner_protected` | RISOLTO E TESTATO (inventario: documento Owner invariato) |
| `cleanup.delete_user`, purge, disable test accounts, seed `ADMIN_FORCE_PASSWORD_RESET`, `bootstrap_owner` con email diversa, restore backup, `Repository.update*` | cancellazione/sostituzione/`is_owner` | guardie nei servizi + campo `is_owner` scartato + indice unico `uniq_owner` | RISOLTO E TESTATO |
| Email Owner | nessun endpoint modifica l'email di altri utenti (inventario) | — | RISOLTO E TESTATO (inventario) |
| Canali personali Owner | cambio password autenticato; recupero via email verificata; procedura tecnica `scripts/owner_recovery.py` (solo accesso server, conferma email, audit + evento) | disponibili | RISOLTO E TESTATO (script: IMPLEMENTATO NON TESTATO in produzione) |

Super Admin non protetti: assistenza reset, gestione utenti, tornei, altri SA → invariati e testati (`test_super_admins_keep_full_powers`, `test_super_admin_can_still_assist_unprotected_users`).

## C. STRIPE — eliminazione del rischio A→B

Prenotazione stock in **una sola operazione atomica** sul documento prodotto (`_reserve_stock`): filtro `reserved_orders ∌ purchase_id` **e** `sold < stock` → `$inc sold` + `$addToSet reserved_orders`. L'idempotenza per ordine è garantita dal documento stesso, non da un secondo aggiornamento: un crash in qualunque punto successivo e un retry trovano l'ordine già in `reserved_orders` → esito `already`, nessun incremento. Lock `settling` (`settling_op`, stale 300 s) per la concorrenza tra worker; voucher generato solo se assente; rimborso = `$inc -1` + `$pull` nello stesso update, solo se l'ordine è tra i prenotati (idempotente). `reconcile_stock()` riallinea `sold` al numero di prenotazioni e lo segnala. Nessuna transazione multi-documento (nessun requisito di replica set). `reserved_orders` non è esposto dalle API pubbliche.
Test: crash iniettato dopo l'incremento → stato parziale documentato → lock rispettato → recupero → **1 incremento, 1 pagamento, 1 voucher**, riconciliazione verificata; più i 12 scenari precedenti (duplicati, concorrenti, retry eventi, rimborsi ripetuti). RISOLTO E TESTATO.

## D. GITHUB ACTIONS

- Run `37951001912`: 3/4 verdi; backend rosso per il falso positivo `§` → corretto (solo credenziali realmente valorizzate ≥ 8 caratteri, esclusi i placeholder CI; vecchi valori revocati mantenuti come stringhe spezzate; autodiagnosi con segreto piantato).
- Simulazione locale del job backend con le variabili del workflow: **40 passed, 2 skipped** (`iteration47_ci_simulation.xml`). Anteprima: **75 passed** (`iteration47_preview.xml`, include regressioni iteration_45/10).
- **Run reale su GitHub: NON VERIFICATO** — partirà al prossimo «Save to GitHub»; link da controllare: https://github.com/Giampaolo86/fsl/actions. Non dichiaro i 4 job verdi finché non li osservo.

## E. VERIFICA PRODUZIONE — NON VERIFICABILE
Nessun accesso al DB di produzione da questo ambiente. Al deploy del nuovo codice avvengono automaticamente: `ensure_owner_index`, `bootstrap_owner` (una sola volta, solo se esattamente 1 account Super Admin con `ADMIN_EMAIL`), `sweep_owner_reset_tokens`, disabilitazione account di test. Verifica consigliata (tu, da Control Room → Sicurezza): protezione «Owner unico e protetto» = Verificato; elenco account privilegiati con etichetta Owner e MFA attiva; nessun altro Owner.

## F. PROBLEMI RESIDUI
- GitHub Actions non osservata (vedi D) — IMPLEMENTATO NON TESTATO.
- Due Super Admin reali senza MFA (`liviadm15`, `alessioodt`, DB anteprima): bloccati sulle operazioni admin finché non la attivano — NON RISOLTO (azione loro).
- Branch `main`: NON VERIFICABILE da qui. Impostazioni: Settings → Rules → Rulesets → New branch ruleset → target `main` → **Block force pushes** + **Restrict deletions**. Non attivare «Require pull request»/«Require status checks» (bloccherebbero la pubblicazione diretta Emergent → GitHub).
- `frontend/yarn.lock` non incluso dal flusso di commit automatico — NON RISOLTO (richiede commit manuale).
- Produzione: stato Owner/MFA/token — NON VERIFICABILE (vedi E).
