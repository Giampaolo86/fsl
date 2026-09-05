import "@/App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { TournamentProvider } from "@/context/TournamentContext";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import AdminShell from "@/components/layout/AdminShell";
import PublicShell from "@/components/layout/PublicShell";
import ClubShell from "@/components/layout/ClubShell";
import RefereeShell from "@/components/layout/RefereeShell";
import Login from "@/pages/Login";
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
import ClubDashboard from "@/pages/club/ClubDashboard";
import { ClubModule, ClubTeams } from "@/pages/club/ClubModules";
import RefereeMatches, { RefereeModule } from "@/pages/referee/RefereeMatches";
import PublicHub from "@/pages/public/PublicHub";
import TournamentHome from "@/pages/public/TournamentHome";
import { PublicClubPage, PublicClubs, PublicModule, PublicRules, PublicStandings } from "@/pages/public/PublicPages";

const ADMIN_ROLES = ["super_admin", "director", "secretary"];

function Logout() {
  const { logout } = useAuth();
  logout();
  return <Navigate to="/login" replace />;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <TournamentProvider>
            <Toaster theme="dark" position="top-right" toastOptions={{ className: "bg-navy-800 border border-white/20 text-fsl-white" }} />
            <Routes>
              <Route path="/login" element={<Login />} />
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
                <Route path="campi" element={<Venues />} />
                <Route path="audit" element={<Audit />} />
                {["calendario", "partite", "referti", "classifiche", "pagamenti", "comunicazioni", "ticket", "media"].map((m) => (
                  <Route key={m} path={m} element={<ModulePlaceholder module={m} />} />
                ))}
              </Route>

              <Route path="/societa" element={<ProtectedRoute roles={["club_manager"]}><ClubShell /></ProtectedRoute>}>
                <Route index element={<ClubDashboard />} />
                <Route path="squadre" element={<ClubTeams />} />
                {["rose", "documenti", "calendario", "pagamenti", "profilo"].map((m) => (
                  <Route key={m} path={m} element={<ClubModule module={m} />} />
                ))}
              </Route>

              <Route path="/arbitro" element={<ProtectedRoute roles={["referee"]}><RefereeShell /></ProtectedRoute>}>
                <Route index element={<RefereeMatches />} />
                <Route path="eventi" element={<RefereeModule title="Eventi" />} />
                <Route path="squadre" element={<RefereeModule title="Squadre" />} />
                <Route path="note" element={<RefereeModule title="Note" />} />
              </Route>

              <Route element={<PublicShell />}>
                <Route path="/" element={<PublicHub />} />
                <Route path="/tornei" element={<PublicHub />} />
              </Route>
              <Route path="/tornei/:slug" element={<PublicShell />}>
                <Route index element={<TournamentHome />} />
                <Route path="squadre" element={<PublicClubs />} />
                <Route path="squadre/:clubSlug" element={<PublicClubPage />} />
                <Route path="classifiche" element={<PublicStandings />} />
                <Route path="regolamento" element={<PublicRules />} />
                <Route path="partite" element={<PublicModule title="Partite" phase="Fase 6" />} />
                <Route path="statistiche" element={<PublicModule title="Statistiche" phase="Fase 6" />} />
                <Route path="news" element={<PublicModule title="News" phase="Fase 6" />} />
                <Route path="segnala-errore" element={<PublicModule title="Segnala un errore" phase="Fase 5" />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </TournamentProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
