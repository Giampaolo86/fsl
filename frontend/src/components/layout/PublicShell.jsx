import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { Facebook, Heart, Instagram, LogOut, Menu, ShieldCheck, UserRound, X, Youtube } from "lucide-react";
import { Logo } from "@/components/fsl/Logo";
import { NotificationsBell } from "@/components/fsl/NotificationsBell";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

const NAV = (slug, main) =>
  slug
    ? [["Home", `/tornei/${slug}`], ["Partite", `/tornei/${slug}/partite`], ["Classifiche", `/tornei/${slug}/classifiche`], ["Squadre", `/tornei/${slug}/squadre`], ["Statistiche", `/tornei/${slug}/statistiche`], ["FSL Weekly", `/tornei/${slug}/weekly`], ["News", `/tornei/${slug}/news`], ["Regolamento", `/tornei/${slug}/regolamento`]]
    : [["Home", "/"], ["Tornei", "/tornei"], ["Classifiche", main ? `/tornei/${main}/classifiche` : "/tornei"], ["News", main ? `/tornei/${main}/news` : "/tornei"], ["Albo d'oro", "/albo-doro"], ["Media", { pathname: "/", hash: "#media" }], ["Contatti", { pathname: "/", hash: "#contatti" }]];

const TikTok = ({ className }) => <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true"><path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.6 2.6 0 0 1-2.6-2.6 2.6 2.6 0 0 1 3.4-2.47V9.66a5.72 5.72 0 0 0-.8-.06 5.7 5.7 0 0 0-5.7 5.7 5.7 5.7 0 0 0 5.7 5.7 5.7 5.7 0 0 0 5.7-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.3 4.3 0 0 1-3.26-1.48Z" /></svg>;
const SOCIAL = [[Instagram, "Instagram"], [Youtube, "YouTube"], [TikTok, "TikTok"], [Facebook, "Facebook"]];

function useMainSlug(skip) {
  const [main, setMain] = useState(null);
  useEffect(() => { if (!skip) api.get("/public/tournaments").then((r) => setMain((r.data.find((t) => t.status === "active") || r.data[0])?.slug || null)).catch(() => {}); }, [skip]);
  return main;
}

function UserActions({ user, landing, onLogout, mobile = false, onNav }) {
  const cls = mobile ? "h-11 flex items-center gap-2 text-sm font-medium text-fsl-gold" : "btn-ghost hidden sm:inline-flex";
  if (!user) {
    return (
      <>
        <Link to="/login?area=genitori" onClick={onNav} className={mobile ? cls : "btn-gold h-11 px-5 uppercase font-display tracking-wide shadow-[0_8px_24px_-10px_rgba(244,174,43,0.9)]"} data-testid="public-fan-login-link"><Heart className="h-4 w-4" aria-hidden="true" /> Area Genitori</Link>
        <Link to="/login" onClick={onNav} className={mobile ? cls : "btn-ghost h-11 px-4 uppercase font-display tracking-wide hidden md:inline-flex"} data-testid="public-area-societa-link"><UserRound className="h-4 w-4" aria-hidden="true" /> Società e staff</Link>
        {mobile && <Link to="/registrati" onClick={onNav} className={cls} data-testid="public-fan-register-link">Registrati gratis (genitori)</Link>}
      </>
    );
  }
  if (user.role === "fan") {
    return (
      <>
        <NavLink to="/account" onClick={onNav} className={({ isActive }) => `${cls} ${isActive && !mobile ? "border-fsl-gold/60" : ""}`} data-testid="public-fan-account-link"><Heart className="h-4 w-4" aria-hidden="true" /> I miei preferiti</NavLink>
        <Link to="/sicurezza" onClick={onNav} className={cls} data-testid="public-fan-security"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Sicurezza</Link>
        <button type="button" onClick={onLogout} className={cls} data-testid="public-fan-logout"><LogOut className="h-4 w-4" aria-hidden="true" /> Esci</button>
      </>
    );
  }
  return <Link to={landing} onClick={onNav} className={cls} data-testid="public-area-societa-link"><UserRound className="h-4 w-4" aria-hidden="true" /> La mia area</Link>;
}

export default function PublicShell() {
  const { slug } = useParams();
  const { user, landing, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const main = useMainSlug(!!slug);
  const nav = NAV(slug, main);
  const doLogout = async () => { setOpen(false); navigate("/", { replace: true }); await logout(); };
  const linkCls = ({ isActive }) => `h-11 px-3.5 inline-flex items-center font-display uppercase text-sm font-bold tracking-wide border-b-2 transition-colors ${isActive ? "text-fsl-white border-fsl-gold" : "text-fsl-white/75 border-transparent hover:text-fsl-white"}`;
  return (
    <div className="min-h-screen flex flex-col bg-navy-900">
      <header className="sticky top-0 z-40 h-[76px] bg-ink-950/90 backdrop-blur-md border-b border-white/10">
        <div className="mx-auto max-w-[1488px] px-6 h-full flex items-center justify-between gap-6">
          <Logo />
          <nav className="hidden lg:flex items-center gap-1" aria-label="Navigazione pubblica">
            {nav.map(([label, to]) => typeof to === "string" ? <NavLink key={label} to={to} end data-testid={`public-nav-${label.toLowerCase()}`} className={linkCls}>{label}</NavLink> : <Link key={label} to={to} data-testid={`public-nav-${label.toLowerCase()}`} className={linkCls({ isActive: false })}>{label}</Link>)}
          </nav>
          <div className="flex items-center gap-3">
            {user?.role === "fan" && <NotificationsBell fan />}
            {user?.role === "fan" && <span className="hidden md:inline text-sm font-semibold text-fsl-white/90 px-1" data-testid="public-fan-name">{user.full_name}</span>}
            <span className="hidden lg:block h-8 w-px bg-white/20" />
            <UserActions user={user} landing={landing} onLogout={doLogout} />
            <button className="h-11 w-11 rounded-md border border-white/20 inline-flex items-center justify-center hover:border-fsl-gold/60" onClick={() => setOpen((v) => !v)} aria-label="Menu" data-testid="public-menu-toggle">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          </div>
        </div>
        {open && (
          <div className="bg-navy-800 border-b border-white/10 px-6 py-3 flex flex-col" data-testid="public-mobile-menu">
            {nav.map(([label, to]) => <NavLink key={label} to={to} onClick={() => setOpen(false)} className="h-11 flex items-center font-display uppercase text-sm font-bold text-fsl-white/80 hover:text-fsl-white">{label}</NavLink>)}
            <UserActions user={user} landing={landing} onLogout={doLogout} mobile onNav={() => setOpen(false)} />
          </div>
        )}
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="border-t border-white/10 bg-ink-950 mt-0" data-testid="public-footer">
        <div className="mx-auto max-w-[1488px] px-6 py-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <Logo />
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Navigazione footer">{nav.map(([label, to]) => <Link key={label} to={to} className="font-display uppercase text-xs font-bold tracking-wide text-fsl-white/75 hover:text-fsl-gold">{label}</Link>)}</nav>
          <div className="flex items-center gap-4">{SOCIAL.map(([Icon, name]) => <a key={name} href="#contatti" aria-label={name} className="text-fsl-white/80 hover:text-fsl-gold transition-colors"><Icon className="h-5 w-5" /></a>)}</div>
        </div>
        <div className="border-t border-white/10"><div className="mx-auto max-w-[1488px] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-fsl-slate">
          <div className="flex flex-wrap gap-x-3 gap-y-1"><Link to="/login" className="hover:text-fsl-white">Privacy Policy</Link><span>|</span><Link to="/login" className="hover:text-fsl-white">Cookie Policy</Link><span>|</span><Link to="/login" className="hover:text-fsl-white">Termini e Condizioni</Link></div>
          <p>© {new Date().getFullYear()} Future Stars League · La Serie A del futuro. Tutti i diritti riservati.</p>
        </div></div>
      </footer>
    </div>
  );
}
