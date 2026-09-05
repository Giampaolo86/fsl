import { useState } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { Menu, UserCircle2, X } from "lucide-react";
import { Logo } from "@/components/fsl/Logo";
import { useAuth } from "@/context/AuthContext";

const NAV = (slug) =>
  slug
    ? [
        ["Home", `/tornei/${slug}`],
        ["Partite", `/tornei/${slug}/partite`],
        ["Classifiche", `/tornei/${slug}/classifiche`],
        ["Squadre", `/tornei/${slug}/squadre`],
        ["Statistiche", `/tornei/${slug}/statistiche`],
        ["Regolamento", `/tornei/${slug}/regolamento`],
      ]
    : [
        ["Home", "/"],
        ["Tornei", "/tornei"],
      ];

export default function PublicShell() {
  const { slug } = useParams();
  const { user, landing } = useAuth();
  const [open, setOpen] = useState(false);
  const nav = NAV(slug);
  return (
    <div className="min-h-screen flex flex-col bg-navy-900">
      <header className="sticky top-0 z-40 h-[76px] bg-navy-900/85 backdrop-blur-md border-b border-white/10">
        <div className="mx-auto max-w-[1488px] px-6 h-full flex items-center justify-between gap-6">
          <Logo />
          <nav className="hidden lg:flex items-center gap-1" aria-label="Navigazione pubblica">
            {nav.map(([label, to]) => (
              <NavLink
                key={to}
                to={to}
                end={label === "Home"}
                data-testid={`public-nav-${label.toLowerCase()}`}
                className={({ isActive }) =>
                  `h-11 px-4 inline-flex items-center text-sm font-medium border-b-2 transition-colors ${isActive ? "text-fsl-white border-fsl-gold" : "text-fsl-slate border-transparent hover:text-fsl-white"}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link to={user ? landing : "/login"} className="btn-ghost hidden sm:inline-flex" data-testid="public-area-societa-link">
              <UserCircle2 className="h-4 w-4" aria-hidden="true" /> {user ? "La mia area" : "Area Società"}
            </Link>
            <button className="lg:hidden h-11 w-11 rounded-md border border-white/20 inline-flex items-center justify-center" onClick={() => setOpen((v) => !v)} aria-label="Menu" data-testid="public-menu-toggle">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {open && (
          <div className="lg:hidden bg-navy-800 border-b border-white/10 px-6 py-3 flex flex-col">
            {nav.map(([label, to]) => (
              <NavLink key={to} to={to} onClick={() => setOpen(false)} className="h-11 flex items-center text-sm font-medium text-fsl-slate hover:text-fsl-white">
                {label}
              </NavLink>
            ))}
            <Link to={user ? landing : "/login"} onClick={() => setOpen(false)} className="h-11 flex items-center text-sm font-medium text-fsl-gold">
              {user ? "La mia area" : "Area Società"}
            </Link>
          </div>
        )}
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-white/10 mt-16">
        <div className="mx-auto max-w-[1488px] px-6 py-8 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs text-fsl-slate">
          <Logo compact />
          <p>Future Stars League · La Serie A del futuro · Dati pubblici aggiornati solo da risultati ufficiali.</p>
          <Link to="/login" className="hover:text-fsl-white">Accesso operatori</Link>
        </div>
      </footer>
    </div>
  );
}
