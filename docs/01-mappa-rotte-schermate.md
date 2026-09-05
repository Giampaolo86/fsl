# FSL – Mappa rotte e schermate

Legenda stato: **F1** = consegnato in Fase 1 (fondazioni + Hub multi-torneo); **F2–F7** = fase prevista.

## Autenticazione
| Rotta | Schermata | Fase |
|---|---|---|
| `/login` | Login email/password, redirect per ruolo | F1 |
| `/logout` | Invalidazione sessione | F1 |

Redirect post-login: `super_admin`/`director`/`secretary` → `/admin`; `referee` → `/arbitro`; `club_manager` → `/societa`.

## Hub Tornei e Control Room (`/admin/...`) – header con selettore globale torneo
| Rotta | Schermata | Fase |
|---|---|---|
| `/admin` | Hub Tornei: KPI, card tornei, + Crea nuovo torneo, drawer Attivi/Archivio | F1 |
| `/admin/tornei/nuovo` | Wizard creazione: Parti da zero / Usa un modello / Duplica esistente | F1 |
| `/admin/t/:tournamentId` | Overview operativa torneo selezionato (Control Room del giorno) | F1 shell / F4 dati gara |
| `/admin/t/:id/impostazioni` | Configurazione torneo (identità, date, categorie, serie, campi, slot, formula, punteggi, quote, documenti, canali) | F1 |
| `/admin/t/:id/competizioni` | Stagioni/edizioni, categorie × serie, regole e tie-break | F1 lista / F2 editing completo |
| `/admin/t/:id/societa` | Società, squadre, inviti | F1 lista+crea / F2 inviti |
| `/admin/t/:id/campi` | Sedi, campi, disponibilità, blackout | F1 lista / F3 disponibilità |
| `/admin/t/:id/calendario` | Generatore bozza, conflitti, punteggio qualità, versioni, pubblicazione | F3 |
| `/admin/t/:id/partite` | Partite, assegnazioni arbitri | F4 |
| `/admin/t/:id/referti` | Referti, ufficializzazione, rettifiche, disciplina | F4 |
| `/admin/t/:id/classifiche` | Classifiche/statistiche, snapshot | F4 |
| `/admin/t/:id/rose` | Rose, documenti, idoneità | F5 |
| `/admin/t/:id/pagamenti` | Quote, fatture, pagamenti, riconciliazione | F5 |
| `/admin/t/:id/comunicazioni` | Contatti, template, invii | F5 |
| `/admin/t/:id/ticket` | Ticket e segnalazioni | F5 |
| `/admin/t/:id/media` | News, media, sponsor, approvazione materiali società | F6 |
| `/admin/utenti` | Utenti, ruoli, membership per torneo | F1 |
| `/admin/t/:id/audit` | Audit log append-only, esportazioni | F1 |

## Area Società (`/societa/...`)
| Rotta | Schermata | Fase |
|---|---|---|
| `/societa` | Dashboard: prossima gara, stato rosa, scadenze, saldo | F1 shell |
| `/societa/squadre` | Squadre assegnate | F1 lista |
| `/societa/rose` | Anagrafiche giocatori (visibilità limitata), tutori protetti | F5 |
| `/societa/documenti` | Certificati, consensi, upload versionato | F5 |
| `/societa/calendario` | Calendario + export iCal | F3 |
| `/societa/pagamenti` | Situazione contabile, ricevute, bonifico | F5 |
| `/societa/contatti` | Contatti organizzazione | F5 |
| `/societa/comunicazioni` | Comunicazioni ricevute | F5 |
| `/societa/segnalazioni` | Ticket collegati a gara/pagamento/giocatore/documento | F5 |
| `/societa/profilo` | Profilo pubblico, sede, identità visiva (stemma, colori, banner, foto) con revisione | F1 base / F6 media completi |

## Area Arbitro (`/arbitro/...`, mobile-first)
| Rotta | Schermata | Fase |
|---|---|---|
| `/arbitro` | Le mie partite (assegnate) | F1 shell / F4 |
| `/arbitro/partite/:matchId` | La mia partita → Live referee → Invia referto | F4 |

## Portale pubblico
| Rotta | Schermata | Fase |
|---|---|---|
| `/` | Hub pubblico / torneo predefinito | F1 |
| `/tornei` | Elenco tornei pubblicati | F1 |
| `/tornei/:slug` | Home torneo: hero, selettore categoria, prossime partite, mini classifica, marcatori, numeri, squadre, news, sponsor | F1 struttura+numeri / F6 completo |
| `/tornei/:slug/partite` | Partite per giornata/categoria | F6 |
| `/tornei/:slug/partite/:matchId` | Match Center | F6 |
| `/tornei/:slug/classifiche` | Classifiche con zone playoff/playout/promozione/retrocessione | F1 struttura / F4 dati |
| `/tornei/:slug/squadre` | Griglia società | F1 |
| `/tornei/:slug/squadre/:clubSlug` | Scheda società e sede | F1 base / F6 completo |
| `/tornei/:slug/giocatori/:playerId` | Scheda giocatore (solo con consenso) | F6 |
| `/tornei/:slug/statistiche` | Statistiche | F6 |
| `/tornei/:slug/regolamento` | Regolamento e formula | F1 |
| `/tornei/:slug/news`, `/news/:newsSlug` | News | F6 |
| `/tornei/:slug/segnala-errore` | Segnalazione pubblica con antispam | F5 |

## Undici schermate di riferimento → rotte
00 Hub → `/admin` · 01 Home pubblica → `/tornei/:slug` · 02 Match Center → `/tornei/:slug/partite/:matchId` · 03 Scheda società → `/tornei/:slug/squadre/:clubSlug` · 04 Dashboard società → `/societa` · 05 Rose/documenti → `/societa/rose` · 06 Control Room → `/admin/t/:id` · 07 Calendar builder → `/admin/t/:id/calendario` · 08 Competition settings → `/admin/t/:id/impostazioni` · 09 Pagamenti segreteria → `/admin/t/:id/pagamenti` · 10 Arbitro mobile → `/arbitro/partite/:matchId`.
