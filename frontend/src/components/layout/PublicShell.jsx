import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { usePageTracking } from "@/hooks/usePageTracking";
import { Facebook, Heart, Instagram, LogOut, Menu, ShieldCheck, UserRound, X, Youtube } from "lucide-react";
import { Logo } from "@/components/fsl/Logo";
import { NotificationsBell } from "@/components/fsl/NotificationsBell";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

const NAV = (slug, main) =>
  slug
    ? [["Home", `/tornei/${slug}`], ["Partite", `/tornei/${slug}/partite`], ["Classifiche", `/tornei/${slug}/classifiche`], ["Squadre", `/tornei/${slug}/squadre`], ["News", `/tornei/${slug}/news`], ["Codice FSL", "/codice-fsl"]]
    : [["Home", "/"], ["Tornei", "/tornei"], ["Classifiche", main ? `/tornei/${main}/classifiche` : "/tornei"], ["News", main ? `/tornei/${main}/news` : "/tornei"], ["Albo d'oro", "/albo-doro"], ["Codice FSL", "/codice-fsl"], ["Media", { pathname: "/", hash: "#media" }], ["Contatti", { pathname: "/", hash: "#contatti" }]];

const GLOBAL_MENU = [["Home FSL", "/", "La casa del calcio giovanile"], ["Tornei", "/tornei", "Categorie, Serie A e Serie B"], ["Albo d'oro", "/albo-doro", "Campioni e storia"], ["Codice FSL", "/codice-fsl", "Competere. Crescere. Rispettare."], ["Media", { pathname: "/", hash: "#media" }, "Foto, video, highlights"], ["Contatti", { pathname: "/", hash: "#contatti" }, "Scrivici o porta la tua società in FSL"]];
const TOURNAMENT_MENU = (slug) => [["Home torneo", `/tornei/${slug}`], ["Partite", `/tornei/${slug}/partite`], ["Classifiche", `/tornei/${slug}/classifiche`], ["Squadre", `/tornei/${slug}/squadre`], ["News", `/tornei/${slug}/news`]];

function MegaMenu({ slug, user, landing, onLogout, onClose }) {
  useEffect(() => { const h = (e) => e.key === "Escape" && onClose(); document.addEventListener("keydown", h); document.body.style.overflow = "hidden"; return () => { document.removeEventListener("keydown", h); document.body.style.overflow = ""; }; }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-950/95 backdrop-blur-xl" data-testid="public-mobile-menu" role="dialog" aria-modal="true">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(60%_50%_at_80%_0%,rgba(244,174,43,0.14),transparent_60%),radial-gradient(50%_40%_at_0%_100%,rgba(11,87,217,0.25),transparent_60%)]" />
      <div className="relative mx-auto max-w-[1488px] px-6 min-h-screen flex flex-col">
        <div className="h-[76px] flex items-center justify-between"><Logo /><button type="button" onClick={onClose} className="h-11 w-11 rounded-full border border-white/20 inline-flex items-center justify-center hover:border-fsl-gold transition-colors" aria-label="Chiudi menu" data-testid="public-menu-close"><X className="h-5 w-5" /></button></div>
        <div className="flex-1 grid lg:grid-cols-[1.4fr_1fr] gap-10 py-8">
          <div>
            <div className="fsl-kicker mb-3">Future Stars League</div>
            <ul className="divide-y divide-white/10" data-testid="public-menu-global">
              {GLOBAL_MENU.map(([label, to, hint], i) => (
                <li key={label} style={{ animationDelay: `${i * 50}ms` }} className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both">
                  <Link to={to} onClick={onClose} className="group flex items-baseline justify-between gap-4 py-3.5 sm:py-4" data-testid={`public-menu-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
                    <span className="font-display font-extrabold uppercase text-3xl sm:text-5xl leading-none text-white group-hover:text-fsl-gold transition-colors">{label}</span>
                    <span className="hidden sm:block text-xs text-fsl-slate text-right max-w-[220px]">{hint}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {slug && (
              <div className="mt-8" data-testid="public-menu-tournament">
                <div className="fsl-kicker mb-2">Questo torneo</div>
                <div className="flex flex-wrap gap-2">{TOURNAMENT_MENU(slug).map(([label, to]) => <NavLink key={label} to={to} end onClick={onClose} className={({ isActive }) => `h-10 px-4 inline-flex items-center rounded-full border font-display uppercase text-sm font-bold tracking-wide transition-colors ${isActive ? "bg-fsl-gold text-ink-950 border-fsl-gold" : "border-white/20 text-white/85 hover:border-fsl-gold hover:text-fsl-gold"}`}>{label}</NavLink>)}</div>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-6 lg:pt-10">
            <div className="fsl-card p-6 bg-navy-800/70">
              <div className="fsl-kicker mb-2">Entra in FSL</div>
              <p className="text-2xl text-fsl-gold leading-tight mb-4" style={{ fontFamily: "Caveat, cursive" }}>Il futuro scende in campo</p>
              <div className="flex flex-col gap-2">
                {!user && <Link to="/login?area=genitori" onClick={onClose} className="btn-gold h-12 justify-center uppercase font-display tracking-wide" data-testid="public-menu-fan-login"><Heart className="h-4 w-4" /> Genitori e tifosi</Link>}
                {!user && <Link to="/login" onClick={onClose} className="btn-ghost h-12 justify-center uppercase font-display tracking-wide" data-testid="public-menu-staff-login"><UserRound className="h-4 w-4" /> Società, arbitri e staff</Link>}
                {!user && <Link to="/richiedi-accesso" onClick={onClose} className="text-center text-sm text-fsl-slate hover:text-fsl-gold mt-1" data-testid="public-menu-join">Porta la tua società in FSL →</Link>}
                {user && user.role === "fan" && <><Link to="/account" onClick={onClose} className="btn-gold h-12 justify-center uppercase font-display tracking-wide"><Heart className="h-4 w-4" /> I miei preferiti</Link><Link to="/sicurezza" onClick={onClose} className="btn-ghost h-12 justify-center"><ShieldCheck className="h-4 w-4" /> Sicurezza</Link><button type="button" onClick={onLogout} className="btn-ghost h-12 justify-center"><LogOut className="h-4 w-4" /> Esci</button></>}
                {user && user.role !== "fan" && <Link to={landing} onClick={onClose} className="btn-gold h-12 justify-center uppercase font-display tracking-wide"><UserRound className="h-4 w-4" /> La mia area</Link>}
              </div>
            </div>
            <div className="flex items-center gap-4 px-1">{SOCIAL.map(([Icon, name]) => <a key={name} href="#contatti" onClick={onClose} aria-label={name} className="h-10 w-10 rounded-full border border-white/15 inline-flex items-center justify-center text-fsl-white/80 hover:text-fsl-gold hover:border-fsl-gold transition-colors"><Icon className="h-4 w-4" /></a>)}<span className="ml-auto text-[11px] uppercase tracking-[0.2em] text-fsl-slate">La Serie A del futuro</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
        <Link to="/login?area=genitori" onClick={onNav} className={mobile ? cls : "btn-gold h-11 px-5 uppercase font-display tracking-wide shadow-[0_8px_24px_-10px_rgba(244,174,43,0.9)]"} data-testid="public-fan-login-link"><Heart className="h-4 w-4" aria-hidden="true" /> Genitori e tifosi</Link>
        <Link to="/login" onClick={onNav} className={mobile ? cls : "btn-ghost h-11 px-4 uppercase font-display tracking-wide hidden md:inline-flex"} data-testid="public-area-societa-link"><UserRound className="h-4 w-4" aria-hidden="true" /> Società e staff</Link>
        {mobile && <Link to="/registrati" onClick={onNav} className={cls} data-testid="public-fan-register-link">Registrati gratis (genitori e tifosi)</Link>}
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
  usePageTracking();
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
      </header>
      {open && <MegaMenu slug={slug} user={user} landing={landing} onLogout={doLogout} onClose={() => setOpen(false)} />}
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
