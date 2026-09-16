import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { Heart, LogOut, Menu, UserCircle2, X } from "lucide-react";
import { Logo } from "@/components/fsl/Logo";
import { NotificationsBell } from "@/components/fsl/NotificationsBell";
import { useAuth } from "@/context/AuthContext";

const NAV = (slug) =>
  slug
    ? [
        ["Home", `/tornei/${slug}`],
        ["Partite", `/tornei/${slug}/partite`],
        ["Classifiche", `/tornei/${slug}/classifiche`],
        ["Squadre", `/tornei/${slug}/squadre`],
        ["Statistiche", `/tornei/${slug}/statistiche`],
        ["News", `/tornei/${slug}/news`],
        ["Regolamento", `/tornei/${slug}/regolamento`],
      ]
    : [];

function UserActions({ user, landing, onLogout, mobile = false, onNav }) {
  const cls = mobile ? "h-11 flex items-center gap-2 text-sm font-medium text-fsl-gold" : "btn-ghost hidden sm:inline-flex";
  if (!user) {
    return (
      <>
        <Link to="/login" onClick={onNav} className={cls} data-testid="public-area-societa-link"><UserCircle2 className="h-4 w-4" aria-hidden="true" /> Area Società</Link>
        <Link to="/registrati" onClick={onNav} className={mobile ? cls : "btn-gold hidden sm:inline-flex"} data-testid="public-fan-register-link">Genitori e tifosi</Link>
      </>
    );
  }
  if (user.role === "fan") {
    return (
      <>
        <NavLink to="/account" onClick={onNav} className={({ isActive }) => `${cls} ${isActive && !mobile ? "border-fsl-gold/60" : ""}`} data-testid="public-fan-account-link"><Heart className="h-4 w-4" aria-hidden="true" /> I miei preferiti</NavLink>
        <button type="button" onClick={onLogout} className={cls} data-testid="public-fan-logout"><LogOut className="h-4 w-4" aria-hidden="true" /> Esci</button>
      </>
    );
  }
  return <Link to={landing} onClick={onNav} className={cls} data-testid="public-area-societa-link"><UserCircle2 className="h-4 w-4" aria-hidden="true" /> La mia area</Link>;
}

export default function PublicShell() {
  const { slug } = useParams();
  const { user, landing, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const nav = NAV(slug);
  const doLogout = async () => { setOpen(false); await logout(); navigate("/", { replace: true }); };
  return (
    <div className="min-h-screen flex flex-col bg-navy-900">
      <header className="sticky top-0 z-40 h-[76px] bg-navy-900/85 backdrop-blur-md border-b border-white/10">
        <div className="mx-auto max-w-[1488px] px-6 h-full flex items-center justify-between gap-6">
          <Logo />
          {nav.length > 0 && (
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
          )}
          <div className="flex items-center gap-2">
            {user?.role === "fan" && <NotificationsBell fan />}
            {user?.role === "fan" && <span className="hidden md:inline text-sm font-semibold text-fsl-white/90 px-1" data-testid="public-fan-name">{user.full_name}</span>}
            <UserActions user={user} landing={landing} onLogout={doLogout} />
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
            <UserActions user={user} landing={landing} onLogout={doLogout} mobile onNav={() => setOpen(false)} />
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
