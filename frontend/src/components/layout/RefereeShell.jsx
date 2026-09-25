import { Link, NavLink, Outlet } from "react-router-dom";
import { BookOpenCheck, ClipboardList, FileCheck2, LogOut, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/fsl/Logo";
import { useAuth } from "@/context/AuthContext";
import { OfflineBanner } from "@/components/fsl/States";

const NAV = [
  ["Partite", "/arbitro", ClipboardList],
  ["Referti", "/arbitro/referti", FileCheck2],
  ["Guida", "/arbitro/guida", BookOpenCheck],
];

export default function RefereeShell() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen flex flex-col bg-navy-900 max-w-[640px] mx-auto border-x border-white/5">
      <OfflineBanner />
      <header className="sticky top-0 z-40 h-16 bg-navy-900/90 backdrop-blur-md border-b border-white/10 px-4 flex items-center justify-between">
            <Link to="/sicurezza" className="h-11 w-11 rounded-md inline-flex items-center justify-center text-fsl-slate hover:text-fsl-white" aria-label="Sicurezza account" title="Sicurezza account" data-testid="security-link"><ShieldCheck className="h-4 w-4" /></Link>
        <button onClick={logout} className="h-11 w-11 rounded-md inline-flex items-center justify-center text-fsl-slate hover:text-fsl-white" aria-label="Esci" data-testid="logout-button">
          <LogOut className="h-5 w-5" />
        </button>
        <Logo to="/arbitro" compact />
        <span className="h-8 px-2.5 rounded-full border border-white/15 text-[11px] font-semibold num text-fsl-slate inline-flex items-center" data-testid="referee-today">{new Date().toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" })}</span>
      </header>
      <div className="px-4 pt-3 text-center">
        <div className="fsl-kicker">Area Arbitro</div>
        <div className="text-sm text-fsl-slate" data-testid="referee-shell-user">{user.full_name}</div>
      </div>
      <main className="flex-1 px-4 py-4 pb-24">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 inset-x-0 mx-auto max-w-[640px] h-[72px] bg-ink-950 border-t border-white/10 grid grid-cols-3 pb-[env(safe-area-inset-bottom)]" aria-label="Navigazione arbitro">
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
