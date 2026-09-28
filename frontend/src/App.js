import "@/App.css";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { TournamentProvider } from "@/context/TournamentContext";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import AdminShell from "@/components/layout/AdminShell";
import PublicShell from "@/components/layout/PublicShell";
import ClubShell from "@/components/layout/ClubShell";
import RefereeShell from "@/components/layout/RefereeShell";
import Login from "@/pages/Login";
import ChildCodesSheet from "@/pages/admin/ChildCodesSheet";
import ChangePassword, { SecurityPage } from "@/pages/Security";
import Top11Admin from "@/pages/admin/Top11";
import Top11Public from "@/pages/public/Top11Public";
import WeeklyAdmin from "@/pages/admin/Weekly";
import Studio from "@/pages/admin/Studio";
import { WeeklyDetail, WeeklyList } from "@/pages/public/WeeklyPublic";
import { ClubHistory, HallOfFame, SeasonArchive } from "@/pages/public/HallOfFame";
import Legacy from "@/pages/admin/Legacy";
import TimeCapsule from "@/pages/public/TimeCapsule";
import { TabbedSection } from "@/components/fsl/SectionTabs";
import Hub from "@/pages/admin/Hub";
import NewTournament from "@/pages/admin/NewTournament";
import Overview from "@/pages/admin/Overview";
import Settings from "@/pages/admin/Settings";
import Competitions from "@/pages/admin/Competitions";
import Clubs from "@/pages/admin/Clubs";
import Venues from "@/pages/admin/Venues";
import Audit from "@/pages/admin/Audit";
import UsersPage from "@/pages/admin/Users";
import ModulePlaceholder from "@/pages/admin/ModulePlaceholder";
import BlogManager from "@/pages/admin/Blog";
import Documents from "@/pages/club/Documents";
import { PaymentCancel, PaymentSuccess, Sales } from "@/pages/Payments";
import Shop from "@/pages/admin/Shop";
import Receipt from "@/pages/Receipt";
import Register, { AuthCallback } from "@/pages/Register";
import { ForgotPassword, ResetPassword } from "@/pages/PasswordReset";
import { RegisterClub, RequestAccess } from "@/pages/RegisterClub";
import FanAccount from "@/pages/FanAccount";
import PlayerProfile from "@/pages/PlayerProfile";
import DigitalProduct from "@/pages/DigitalProduct";
import ClubHomeEditor from "@/pages/club/ClubHomeEditor";
import PublicClubHome from "@/pages/public/PublicClubHome";
import { PublicNews, PublicPost } from "@/pages/public/PublicBlog";
import ClubDashboard from "@/pages/club/ClubDashboard";
import { ClubTeams } from "@/pages/club/ClubModules";
import RefereeMatches, { RefereeModule } from "@/pages/referee/RefereeMatches";
import PublicHub, { PublicTournamentsList } from "@/pages/public/PublicHub";
import TournamentHome from "@/pages/public/TournamentHome";
import { PublicClubs, PublicRules } from "@/pages/public/PublicPages";
import { PublicMatchCenter, PublicMatches, PublicStandingsLive, PublicStats } from "@/pages/public/PublicEngine";
import Matches from "@/pages/admin/Matches";
import MatchWorkspace from "@/components/fsl/MatchWorkspace";
import { Rosters, Standings, Tickets } from "@/pages/admin/Engine";
import { ClubCalendar, ClubMatch, ClubReports } from "@/pages/club/ClubEngine";
import { RefereeMatch } from "@/pages/referee/RefereeMatches";
import { Awards, Payments } from "@/pages/admin/Extras";

const ADMIN_ROLES = ["super_admin", "director", "secretary"];

function Logout() {
  const { logout } = useAuth();
  logout();
  return <Navigate to="/login" replace />;
}

function AdminWeeklyHub({ children }) {
  const { tournamentId } = useParams();
  return <TabbedSection testId="weekly-hub-tabs" tabs={[{ to: `/admin/t/${tournamentId}/weekly`, label: "Giornale" }, { to: `/admin/t/${tournamentId}/top11`, label: "Top 11" }]}>{children}</TabbedSection>;
}

function AdminMoneyHub({ children }) {
  const { tournamentId } = useParams();
  return <TabbedSection testId="money-hub-tabs" tabs={[{ to: `/admin/t/${tournamentId}/pagamenti`, label: "Pagamenti" }, { to: `/admin/t/${tournamentId}/vendite`, label: "Vendite" }, { to: `/admin/t/${tournamentId}/negozio`, label: "Negozio" }]}>{children}</TabbedSection>;
}

function PublicWeeklyHub({ children }) {
  const { slug } = useParams();
  return <><div className="mx-auto max-w-[1488px] px-6 pt-8 -mb-8"><TabbedSection testId="public-weekly-tabs" tabs={[{ to: `/tornei/${slug}/weekly`, label: "FSL Weekly" }, { to: `/tornei/${slug}/top11`, label: "Top 11" }]} /></div>{children}</>;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <TournamentProvider>
            <Toaster theme="dark" position="top-right" toastOptions={{ className: "bg-navy-800 border border-white/20 text-fsl-white" }} />
            <AppRoutes />
          </TournamentProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/cambia-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
              <Route path="/sicurezza" element={<ProtectedRoute><SecurityPage /></ProtectedRoute>} />
              <Route path="/registrati" element={<Register />} />
              <Route path="/password-dimenticata" element={<ForgotPassword />} />
              <Route path="/reimposta-password" element={<ResetPassword />} />
              <Route path="/registrati-societa" element={<RegisterClub />} />
              <Route path="/richiedi-accesso" element={<RequestAccess />} />
              <Route path="/payment/success" element={<PaymentSuccess />} />
              <Route path="/payment/cancel" element={<PaymentCancel />} />
              <Route path="/acquisto/:token" element={<Receipt />} />
              <Route path="/logout" element={<Logout />} />

              <Route element={<ProtectedRoute roles={ADMIN_ROLES}><AdminShell /></ProtectedRoute>}>
                <Route path="/admin" element={<Hub />} />
                <Route path="/admin/tornei/nuovo" element={<NewTournament />} />
                <Route path="/admin/utenti" element={<UsersPage />} />
              </Route>
              <Route path="/admin/t/:tournamentId" element={<ProtectedRoute roles={ADMIN_ROLES}><AdminShell /></ProtectedRoute>}>
                <Route index element={<Overview />} />
                <Route path="impostazioni" element={<Settings />} />
                <Route path="competizioni" element={<Competitions />} />
                <Route path="societa" element={<Clubs />} />
                <Route path="societa/:clubId" element={<ClubHomeEditor adminMode />} />
                <Route path="giocatori/:playerId" element={<PlayerProfile mode="admin" />} />
                <Route path="campi" element={<Venues />} />
                <Route path="audit" element={<Audit />} />
                <Route path="calendario" element={<Matches />} />
                <Route path="partite" element={<Matches />} />
                <Route path="partite/:matchId" element={<MatchWorkspace />} />
                <Route path="referti" element={<Matches mode="reports" />} />
                <Route path="classifiche" element={<Standings />} />
                <Route path="rose" element={<Rosters />} />
                <Route path="rose/codici" element={<ChildCodesSheet />} />
                <Route path="ticket" element={<Tickets />} />
                <Route path="premi" element={<Awards />} />
                <Route path="top11" element={<AdminWeeklyHub tab="top11"><Top11Admin /></AdminWeeklyHub>} />
                <Route path="weekly" element={<AdminWeeklyHub tab="weekly"><WeeklyAdmin /></AdminWeeklyHub>} />
                <Route path="studio" element={<Studio />} />
                <Route path="legacy" element={<Legacy />} />
                <Route path="pagamenti" element={<AdminMoneyHub><Payments /></AdminMoneyHub>} />
                <Route path="media" element={<BlogManager />} />
                <Route path="documenti" element={<Documents />} />
                <Route path="vendite" element={<AdminMoneyHub><Sales /></AdminMoneyHub>} />
                <Route path="negozio" element={<AdminMoneyHub><Shop /></AdminMoneyHub>} />
                <Route path="comunicazioni" element={<ModulePlaceholder module="comunicazioni" />} />
              </Route>

              <Route path="/societa" element={<ProtectedRoute roles={["club_manager"]}><ClubShell /></ProtectedRoute>}>
                <Route index element={<ClubDashboard />} />
                <Route path="squadre" element={<ClubTeams />} />
                <Route path="rose" element={<Rosters clubMode />} />
                <Route path="rose/codici" element={<ChildCodesSheet mode="club" />} />
                <Route path="calendario" element={<ClubCalendar />} />
                <Route path="partite/:matchId" element={<ClubMatch />} />
                <Route path="segnalazioni" element={<ClubReports />} />
                <Route path="pagamenti" element={<Payments clubMode />} />
                <Route path="blog" element={<BlogManager clubMode />} />
                <Route path="documenti" element={<Documents clubMode />} />
                <Route path="profilo" element={<ClubHomeEditor />} />
                <Route path="giocatori/:playerId" element={<PlayerProfile mode="club" />} />
              </Route>

              <Route path="/arbitro" element={<ProtectedRoute roles={["referee"]}><RefereeShell /></ProtectedRoute>}>
                <Route index element={<RefereeMatches />} />
                <Route path="partite/:tournamentId/:matchId" element={<RefereeMatch />} />
                <Route path="referti" element={<RefereeMatches done />} />
                <Route path="guida" element={<RefereeModule />} />
              </Route>

              <Route element={<PublicShell />}>
                <Route path="/" element={<PublicHub />} />
                <Route path="/tornei" element={<PublicTournamentsList />} />
                <Route path="/albo-doro" element={<HallOfFame />} />
                <Route path="/albo-doro/societa/:orgClubId" element={<ClubHistory />} />
                <Route path="/albo-doro/:archiveSlug" element={<SeasonArchive />} />
                <Route path="/account" element={<ProtectedRoute roles={["fan"]}><FanAccount /></ProtectedRoute>} />
              </Route>
              <Route path="/tornei/:slug" element={<PublicShell />}>
                <Route index element={<TournamentHome />} />
                <Route path="squadre" element={<PublicClubs />} />
                <Route path="squadre/:clubSlug" element={<PublicClubHome />} />
                <Route path="giocatori/:playerId" element={<PlayerProfile mode="public" />} />
                <Route path="giocatori/:playerId/capsule" element={<TimeCapsule />} />
                <Route path="prodotti/:token" element={<DigitalProduct />} />
                <Route path="classifiche" element={<PublicStandingsLive />} />
                <Route path="regolamento" element={<PublicRules />} />
                <Route path="partite" element={<PublicMatches />} />
                <Route path="partite/:matchId" element={<PublicMatchCenter />} />
                <Route path="statistiche" element={<PublicStats />} />
                <Route path="top11" element={<PublicWeeklyHub><Top11Public /></PublicWeeklyHub>} />
                <Route path="weekly" element={<PublicWeeklyHub><WeeklyList /></PublicWeeklyHub>} />
                <Route path="weekly/:issueId" element={<WeeklyDetail />} />
                <Route path="news" element={<PublicNews />} />
                <Route path="news/:postSlug" element={<PublicPost />} />
                <Route path="segnala-errore" element={<Navigate to="../partite" replace />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
  );
}

export default App;
