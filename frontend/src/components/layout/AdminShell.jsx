import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useParams } from "react-router-dom";
import { Archive, Award, BarChart3, Calendar, ClipboardList, CreditCard, FileText, Grid3X3, Image, LayoutGrid, LogOut, Menu, Phone, Settings, Shield, ShoppingBag, Ticket, Trophy, UserCog, Users, X } from "lucide-react";
import { Logo } from "@/components/fsl/Logo";
import { TournamentSwitcher } from "@/components/fsl/TournamentSwitcher";
import { OfflineBanner } from "@/components/fsl/States";
import { useAuth } from "@/context/AuthContext";
import { useTournaments } from "@/context/TournamentContext";
import { ROLE_LABELS } from "@/lib/format";

const HUB_NAV = [
  { to: "/admin", label: "Tornei", icon: Trophy, end: true },
  { to: "/admin/utenti", label: "Utenti", icon: UserCog, roles: ["super_admin", "director", "secretary"] },
];

const TOURNAMENT_NAV = (id) => [
  { to: `/admin/t/${id}`, label: "Overview", icon: LayoutGrid, end: true },
  { to: `/admin/t/${id}/impostazioni`, label: "Impostazioni", icon: Settings },
  { to: `/admin/t/${id}/competizioni`, label: "Competizioni", icon: Trophy },
  { to: `/admin/t/${id}/societa`, label: "Società", icon: Shield },
  { to: `/admin/t/${id}/campi`, label: "Campi", icon: Grid3X3 },
  { to: `/admin/t/${id}/calendario`, label: "Calendario", icon: Calendar },
  { to: `/admin/t/${id}/partite`, label: "Partite", icon: ClipboardList },
  { to: `/admin/t/${id}/referti`, label: "Referti", icon: FileText },
  { to: `/admin/t/${id}/classifiche`, label: "Classifiche", icon: BarChart3 },
  { to: `/admin/t/${id}/rose`, label: "Rose", icon: Users },
  { to: `/admin/t/${id}/premi`, label: "Premi", icon: Award },
  { to: `/admin/t/${id}/pagamenti`, label: "Pagamenti", icon: CreditCard },
  { to: `/admin/t/${id}/comunicazioni`, label: "Contatti", icon: Phone },
  { to: `/admin/t/${id}/ticket`, label: "Ticket", icon: Ticket },
  { to: `/admin/t/${id}/media`, label: "Blog e interviste", icon: Image },
  { to: `/admin/t/${id}/documenti`, label: "Documenti", icon: FileText },
  { to: `/admin/t/${id}/vendite`, label: "Vendite", icon: ShoppingBag },
  { to: `/admin/t/${id}/audit`, label: "Audit", icon: Archive },
];

function NavItem({ to, label, icon: Icon, end, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      data-testid={`sidebar-nav-${label.toLowerCase()}`}
      className={({ isActive }) =>
        `flex items-center gap-3 min-h-[44px] py-2 pl-4 pr-3 text-[12.5px] leading-tight font-semibold uppercase tracking-wide border-l-[3px] transition-colors ${
          isActive ? "border-fsl-gold text-fsl-gold bg-white/[0.06]" : "border-transparent text-fsl-slate hover:text-fsl-white hover:bg-white/[0.04]"
        }`
      }
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="break-words">{label}</span>
    </NavLink>
  );
}

export default function AdminShell() {
  const { user, logout } = useAuth();
  const { current, currentId, setCurrentId } = useTournaments();
  const { tournamentId } = useParams();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (tournamentId && tournamentId !== currentId) setCurrentId(tournamentId);
  }, [tournamentId, currentId, setCurrentId]);

  useEffect(() => setOpen(false), [location.pathname]);

  const scopeId = tournamentId || currentId;
  const nav = [...HUB_NAV.filter((n) => !n.roles || user.is_super_admin || n.roles.includes(user.role)), ...(scopeId ? TOURNAMENT_NAV(scopeId) : [])];

  const sidebar = (
    <aside className="flex h-full w-[220px] flex-col bg-ink-950 border-r border-white/10" data-testid="admin-sidebar">
      <div className="px-4 h-[76px] flex items-center border-b border-white/10">
        <Logo to="/admin" compact />
        <span className="ml-2 font-display font-extrabold uppercase text-sm leading-tight">
          Future
          <br />
          Stars
        </span>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 fsl-scroll" aria-label="Navigazione amministrativa">
        <div className="px-4 pb-1 text-[10px] uppercase tracking-widest text-fsl-slate/70">Hub</div>
        {nav.slice(0, HUB_NAV.filter((n) => !n.roles || user.is_super_admin || n.roles.includes(user.role)).length).map((n) => (
          <NavItem key={n.to} {...n} />
        ))}
        {scopeId && (
          <>
            <div className="px-4 pt-4 pb-1 text-[10px] uppercase tracking-widest text-fsl-slate/70 truncate" title={current?.name}>
              {current?.name || "Torneo"}
            </div>
            {TOURNAMENT_NAV(scopeId).map((n) => (
              <NavItem key={n.to} {...n} />
            ))}
          </>
        )}
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="text-xs text-fsl-slate">{ROLE_LABELS[user.role]}</div>
        <div className="text-sm font-semibold truncate" data-testid="sidebar-user-name">
          {user.full_name}
        </div>
        <button onClick={logout} className="mt-3 flex items-center gap-2 text-xs text-fsl-slate hover:text-fsl-white transition-colors" data-testid="logout-button">
          <LogOut className="h-4 w-4" aria-hidden="true" /> Log out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen flex bg-navy-900">
      <div className="hidden xl:block sticky top-0 h-screen">{sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button className="absolute inset-0 bg-ink-950/70" aria-label="Chiudi menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0">{sidebar}</div>
          <button className="absolute left-[176px] top-4 h-11 w-11 rounded-md bg-navy-800 border border-white/20 flex items-center justify-center" onClick={() => setOpen(false)} aria-label="Chiudi">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <OfflineBanner />
        <header className="sticky top-0 z-40 h-[76px] flex items-center justify-between gap-4 px-4 md:px-6 bg-navy-900/85 backdrop-blur-md border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <button className="xl:hidden h-11 w-11 rounded-md border border-white/20 flex items-center justify-center" onClick={() => setOpen(true)} aria-label="Apri menu" data-testid="sidebar-toggle">
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="fsl-kicker">Control Room</div>
              <div className="text-sm text-fsl-slate truncate">
                {user.full_name} · {ROLE_LABELS[user.role]}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TournamentSwitcher />
          </div>
        </header>
        <main className="flex-1 px-4 md:px-6 py-6 max-w-[1488px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
