import { NavLink, Outlet } from "react-router-dom";
import { Bell, ClipboardList, ListChecks, LogOut, NotebookPen, Users } from "lucide-react";
import { Logo } from "@/components/fsl/Logo";
import { useAuth } from "@/context/AuthContext";
import { OfflineBanner } from "@/components/fsl/States";

const NAV = [
  ["Partite", "/arbitro", ClipboardList],
  ["Eventi", "/arbitro/eventi", ListChecks],
  ["Squadre", "/arbitro/squadre", Users],
  ["Note", "/arbitro/note", NotebookPen],
];

export default function RefereeShell() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen flex flex-col bg-navy-900 max-w-[640px] mx-auto border-x border-white/5">
      <OfflineBanner />
      <header className="sticky top-0 z-40 h-16 bg-navy-900/90 backdrop-blur-md border-b border-white/10 px-4 flex items-center justify-between">
        <button onClick={logout} className="h-11 w-11 rounded-md inline-flex items-center justify-center text-fsl-slate hover:text-fsl-white" aria-label="Esci" data-testid="logout-button">
          <LogOut className="h-5 w-5" />
        </button>
        <Logo to="/arbitro" compact />
        <button className="h-11 w-11 rounded-md inline-flex items-center justify-center text-fsl-slate" aria-label="Notifiche" data-testid="referee-notifications-button">
          <Bell className="h-5 w-5" />
        </button>
      </header>
      <div className="px-4 pt-3 text-center">
        <div className="fsl-kicker">Area Arbitro</div>
        <div className="text-sm text-fsl-slate" data-testid="referee-shell-user">{user.full_name}</div>
      </div>
      <main className="flex-1 px-4 py-4 pb-24">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 inset-x-0 mx-auto max-w-[640px] h-[72px] bg-ink-950 border-t border-white/10 grid grid-cols-4" aria-label="Navigazione arbitro">
        {NAV.map(([label, to, Icon]) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/arbitro"}
            data-testid={`referee-nav-${label.toLowerCase()}`}
            className={({ isActive }) => `flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${isActive ? "text-fsl-gold" : "text-fsl-slate"}`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" /> {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
