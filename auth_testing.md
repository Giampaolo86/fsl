# Test Credentials – Future Stars League

Login: `POST /api/auth/login` `{ "email", "password" }` → sets httpOnly cookies and returns `access_token` (usable as `Authorization: Bearer`).
Other endpoints: `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/refresh`.

| Ruolo | Email | Password | Landing |
|---|---|---|---|
| Super Admin (owner) | castellani.giampaolo@gmail.com | FSL-Admin-2026! | /admin |
| Direttore Torneo | direttore@fsl.demo | Demo1234! | /admin |
| Segreteria | segreteria@fsl.demo | Demo1234! | /admin |
| Arbitro | arbitro@fsl.demo | Demo1234! | /arbitro |
| Responsabile Società (Roma Nord, La Serie A dei Bambini) | societa@fsl.demo | Demo1234! | /societa |

Seeded tournaments: `la-serie-a-dei-bambini` (active), `torneo-degli-amici` (active), `future-cup-weekend` (draft), `winter-stars-2025` (archived).
