# FSL – Elenco componenti UI

Design token in `frontend/src/index.css` (CSS variables) + `tailwind.config.js`. Base: shadcn/Radix personalizzati FSL (`components/ui/*`), componenti dominio in `components/fsl/*`.

## Fondazioni (F1)
- **Token**: palette ink/navy/blue/gold/slate/semantici, font Barlow Condensed + Inter, radius 8/12/16, ombre blu-nere, focus ring blu/oro, `tabular-nums`.
- **Layout**: `AdminShell` (sidebar 160px collassabile <1280, header con `TournamentSwitcher` in alto a destra), `PublicShell` (header 76px, nav, selettore categoria), `ClubShell`, `RefereeShell` (mobile-first, bottom nav).
- **Navigazione**: `SidebarNav`, `BottomNav`, `Breadcrumbs`, `UserMenu`.
- **TournamentSwitcher**: pill in header → `Drawer/Sheet` con ricerca, tab Attivi/Archivio, badge stato.
- **Hub**: `HubStatCard`, `TournamentCard` (cover, stato, KPI squadre/campi/categorie, periodo, completamento, azioni Apri Control Room / Impostazioni / Duplica / Archivia), `NewTournamentDialog` (3 modalità), `TournamentWizard` (step identità → struttura → calendario → formula → riepilogo).
- **Dati**: `DataTable` (dark, righe 52px, header sticky, ricerca/ordinamento/paginazione, filtri in URL), `StatusBadge` (colore+icona+testo), `KpiTile`, `ProgressBar`, `EmptyState`, `LoadingState`, `ErrorState`, `PermissionDenied`, `OfflineBanner`.
- **Form**: `Field` wrapper con label/hint/error, `Input`, `Select`, `Switch`, `Checkbox`, `Textarea`, `SlotEditor` (lista orari), `ListEditor` (categorie/serie), `ColorPicker` (primario/secondario), `ReasonDialog` (conferma con motivazione obbligatoria).
- **Identità club**: `ClubCrest` (SVG segnaposto con iniziali e colori; flag `is_placeholder`), `ClubAvatarUpload` (F6: upload, anteprima, ritaglio, riposizionamento, ripristino default).
- **Pubblico**: `HeroBanner` (foto + overlay navy), `CategorySelector`, `MatchCard`, `MiniStandings`, `TopScorers`, `TournamentNumbers`, `ClubGrid`, `NewsCard`, `SponsorStrip`, `Footer`.
- **Feedback**: `sonner` toast, `AlertDialog` per azioni distruttive.

## Fasi successive
- F3: `CalendarBuilder` (griglia campi × slot, drag-and-drop), `ConflictList`, `QualityScore`, `VersionTimeline`.
- F4: `MatchCenter`, `LiveRefereePanel` (Gol/Ammonizione/Espulsione/Sostituzione/Infortunio), `EventTimeline`, `ReportForm`, `OfficializeDialog`, `RectifyDialog` (prima/dopo), `StandingsTable` con zone.
- F5: `RosterTable`, `DocumentUploader` versionato, `ConsentPanel`, `PaymentLedger`, `ReceiptViewer`, `TicketThread`, `NotificationCenter`.
- F6: `ClubVenueHero`, `MapCard`, `Gallery`, `NewsEditor`, `SponsorManager`, `MediaApprovalQueue`.
