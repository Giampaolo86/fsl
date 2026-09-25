import { Link, NavLink, Outlet } from "react-router-dom";
import { CalendarDays, ClipboardList, CreditCard, FileText, Flag, LayoutGrid, LogOut, Newspaper, Shield, Users, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/fsl/Logo";
import { useAuth } from "@/context/AuthContext";
import { OfflineBanner } from "@/components/fsl/States";
import { NotificationsBell } from "@/components/fsl/NotificationsBell";

const CLUB_NAV = [
  ["Dashboard", "/societa", LayoutGrid],
  ["Squadre", "/societa/squadre", Users],
  ["Rose", "/societa/rose", ClipboardList],
  ["Documenti", "/societa/documenti", FileText],
  ["Calendario", "/societa/calendario", CalendarDays],
  ["Segnalazioni", "/societa/segnalazioni", Flag],
  ["Pagamenti", "/societa/pagamenti", CreditCard],
  ["Blog", "/societa/blog", Newspaper],
  ["Profilo", "/societa/profilo", Shield],
];

export default function ClubShell() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen flex flex-col bg-navy-900">
      <OfflineBanner />
      <header className="sticky top-0 z-40 h-[76px] bg-navy-900/85 backdrop-blur-md border-b border-white/10">
        <div className="mx-auto max-w-[1488px] px-4 md:px-6 h-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Logo to="/societa" />
            <span className="hidden md:inline fsl-kicker border-l border-white/20 pl-4">Area Società</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline text-fsl-slate" data-testid="club-shell-user">{user.full_name}</span>
            <NotificationsBell />
            <Link to="/sicurezza" className="h-11 w-11 rounded-md inline-flex items-center justify-center text-fsl-slate hover:text-fsl-white" aria-label="Sicurezza account" title="Sicurezza account" data-testid="security-link"><ShieldCheck className="h-4 w-4" /></Link>
            <button onClick={logout} className="btn-ghost h-11" data-testid="logout-button">
              <LogOut className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Esci</span>
            </button>
          </div>
        </div>
        <nav className="border-t border-white/10 bg-navy-900 relative" aria-label="Navigazione società">
          <span className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-navy-900 to-transparent lg:hidden" aria-hidden="true" />
          <div className="mx-auto max-w-[1488px] px-4 md:px-6 flex overflow-x-auto no-scrollbar snap-x">
            {CLUB_NAV.map(([label, to, Icon]) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/societa"}
                data-testid={`club-nav-${label.toLowerCase()}`}
                className={({ isActive }) =>
                  `h-11 px-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide border-b-2 whitespace-nowrap transition-colors ${
                    isActive ? "text-fsl-gold border-fsl-gold" : "text-fsl-slate border-transparent hover:text-fsl-white"
                  }`
                }
              >
                <Icon className="h-4 w-4" aria-hidden="true" /> {label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>
      <main className="flex-1 mx-auto w-full max-w-[1488px] px-4 md:px-6 py-6 mt-11">
        <Outlet />
      </main>
    </div>
  );
}
