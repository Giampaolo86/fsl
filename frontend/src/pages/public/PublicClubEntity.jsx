import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Globe, Instagram, Mail, MapPin, Medal, MessageCircle, Phone, Shield, Trophy, Users } from "lucide-react";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { GoldPill, HandClaim, HeroStage, Panel, SectionHead, Signature, StatTile, TagPill } from "@/components/fsl/ProfileKit";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { api, apiError } from "@/lib/api";

const ord = (n) => (n ? `${n}°` : "—");
const STATUS = { draft: "Bozza", active: "In corso", completed: "Concluso", archived: "Archiviato" };

function GroupCard({ g, slug, clubSlug }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/10 bg-ink-950/50 p-4" data-testid={`club-entity-group-${g.team_id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display font-extrabold uppercase text-lg leading-none truncate">{g.category} <span className="text-fsl-gold">· {g.series}</span></div>
          <div className="text-xs text-fsl-slate mt-1 truncate">{g.competition}</div>
        </div>
        <div className="text-right shrink-0"><div className="num font-display font-extrabold text-2xl leading-none">{ord(g.pos)}</div><div className="text-[10px] uppercase tracking-wider text-fsl-slate">{g.total ? `su ${g.total}` : "classifica"}</div></div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-fsl-slate inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {g.players} tesserati</span>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost h-8 text-xs" onClick={() => setOpen((o) => !o)} disabled={g.players === 0} data-testid={`club-entity-roster-toggle-${g.team_id}`}>{open ? "Nascondi rosa" : "Rosa"}</button>
          <Link to={`/tornei/${slug}/squadre/${clubSlug}`} className="btn-ghost h-8 text-xs">Home torneo <ChevronRight className="h-3.5 w-3.5" /></Link>
        </div>
      </div>
      {open && (
        <ul className="mt-3 grid sm:grid-cols-2 gap-1.5" data-testid={`club-entity-roster-${g.team_id}`}>
          {g.roster.map((p, i) => (
            <li key={i} className="flex items-center gap-2 h-9 px-2 rounded-md bg-navy-800/70 text-sm">
              <span className="num w-6 text-right text-fsl-gold font-bold">{p.shirt_number ?? "—"}</span>
              {p.photo_url ? <img src={p.photo_url} alt="" className="h-6 w-6 rounded-full object-cover" /> : <span className="h-6 w-6 rounded-full bg-white/10" />}
              {p.id ? <Link to={`/tornei/${slug}/giocatori/${p.id}`} className="truncate hover:text-fsl-gold">{p.name}</Link> : <span className="truncate text-fsl-slate">{p.name}</span>}
              <span className="ml-auto text-[10px] uppercase text-fsl-slate">{p.role}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PublicClubEntity() {
  const { orgClubId } = useParams();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { setD(null); setError(null); api.get(`/public/clubs/${orgClubId}`).then((r) => setD(r.data)).catch(setError); }, [orgClubId]);
  if (error) return <div className="p-10"><ErrorState message={apiError(error)} /></div>;
  if (!d) return <LoadingState full />;
  const c = d.club, p = c.profile || {}, secondary = c.colors?.secondary || "#F4AE2B";
  const [first, ...rest] = c.name.split(" "); const last = rest.join(" ");
  const honours = d.history?.honours || {};
  const contacts = [["phone", Phone, p.phone, `tel:${p.phone}`], ["whatsapp", MessageCircle, p.whatsapp, `https://wa.me/${(p.whatsapp || "").replace(/\D/g, "")}`], ["email", Mail, p.email, `mailto:${p.email}`], ["website", Globe, p.website, p.website], ["instagram", Instagram, p.instagram, `https://instagram.com/${(p.instagram || "").replace("@", "")}`]].filter((x) => x[2]);
  const stats = [[Shield, c.founded_year || "—", "Fondazione"], [Trophy, d.kpis.tournaments, "Tornei FSL"], [Users, d.kpis.teams, "Gruppi"], [Users, d.kpis.players, "Tesserati"], [Medal, honours.titles || 0, "Titoli"], [Medal, honours.podiums || 0, "Podi"]];
  return (
    <div className="bg-ink-950" data-testid="club-entity">
      <HeroStage testId="club-entity-hero">
        <div className="mx-auto max-w-[1488px] px-6 pt-8 pb-10 lg:pb-14">
          <div className="grid lg:grid-cols-[1.1fr_minmax(260px,0.9fr)_auto] gap-6 lg:gap-8 items-center">
            <div className="relative z-10 min-w-0">
              <GoldPill testId="club-entity-kicker">Scheda società FSL</GoldPill>
              <h1 className="mt-4 font-display font-extrabold uppercase leading-[0.85] text-5xl sm:text-6xl lg:text-7xl" data-testid="club-entity-name" style={{ textShadow: "0 8px 24px rgba(0,0,0,0.6)" }}><span className="block text-white">{first}</span>{last && <span className="block" style={{ background: "linear-gradient(180deg,#FFF0B8 0%,#F4AE2B 55%,#C8811A 100%)", WebkitBackgroundClip: "text", color: "transparent" }}>{last}</span>}</h1>
              {c.motto && <Signature className="mt-4 !rotate-0 !text-2xl sm:!text-3xl"><span style={{ color: secondary }}>«{c.motto}»</span></Signature>}
              <p className="mt-4 text-sm sm:text-base text-white/85 font-medium" data-testid="club-entity-tagline">{[c.city, `${d.kpis.tournaments} torne${d.kpis.tournaments === 1 ? "o" : "i"} FSL`, `${d.kpis.teams} grupp${d.kpis.teams === 1 ? "o" : "i"}`].filter(Boolean).join(" · ")}</p>
              <div className="mt-5 flex flex-wrap gap-2">{d.participations.map((pt) => <TagPill key={pt.tournament.id} icon={Trophy}>{pt.tournament.name}{pt.tournament.season_label ? ` · ${pt.tournament.season_label}` : ""}</TagPill>)}</div>
            </div>
            <div className="relative flex justify-center min-h-[280px] items-center">
              <span className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 num font-display font-extrabold text-[200px] sm:text-[260px] leading-none text-white/[0.07] select-none pointer-events-none" aria-hidden>{c.founded_year || (c.short_name || c.name).slice(0, 3).toUpperCase()}</span>
              <div className="relative drop-shadow-[0_24px_40px_rgba(0,0,0,0.7)]"><ClubCrest club={c} size={220} /></div>
            </div>
            <div className="flex lg:flex-col items-center lg:items-end justify-between gap-6"><HandClaim /></div>
          </div>
        </div>
      </HeroStage>

      <div className="mx-auto max-w-[1488px] px-6 py-8 space-y-10">
        <section data-testid="club-entity-stats">
          <SectionHead icon={Shield} title="La società in numeri" />
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">{stats.map(([Icon, v, l]) => <StatTile key={l} icon={Icon} value={v} label={l} />)}</div>
        </section>

        <section data-testid="club-entity-participations">
          <SectionHead icon={Trophy} title="Tornei e gruppi censiti" count={d.kpis.teams} />
          <div className="space-y-6">
            {d.participations.map((pt) => (
              <div key={pt.tournament.id} className="rounded-2xl border border-white/10 bg-navy-800/80 p-5" data-testid={`club-entity-tournament-${pt.tournament.slug}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <Link to={`/tornei/${pt.tournament.slug}`} className="font-display font-extrabold uppercase text-xl sm:text-2xl leading-none hover:text-fsl-gold">{pt.tournament.name}</Link>
                    <div className="text-xs text-fsl-slate mt-1">{[pt.tournament.season_label, STATUS[pt.tournament.status], !pt.tournament.published && "non pubblicato · anteprima staff"].filter(Boolean).join(" · ")}</div>
                  </div>
                  <Link to={`/tornei/${pt.tournament.slug}/squadre/${pt.club_slug}`} className="btn-ghost h-9 text-xs" data-testid={`club-entity-home-${pt.tournament.slug}`}>Home società nel torneo <ChevronRight className="h-4 w-4" /></Link>
                </div>
                {pt.groups.length === 0 ? <p className="text-sm text-fsl-slate">Nessun gruppo ancora iscritto in questo torneo.</p> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{pt.groups.map((g) => <GroupCard key={g.team_id} g={g} slug={pt.tournament.slug} clubSlug={pt.club_slug} />)}</div>}
              </div>
            ))}
          </div>
        </section>

        <div className="grid lg:grid-cols-2 gap-6">
          <Panel icon={MapPin} title="Chi siamo" testId="club-entity-about">
            {c.description ? <p className="text-sm text-white/85 whitespace-pre-line">{c.description}</p> : <p className="text-sm text-fsl-slate">La società non ha ancora compilato la presentazione.</p>}
            {(p.manager_name || c.city) && <p className="mt-3 text-xs text-fsl-slate">{[p.manager_name && `Responsabile: ${p.manager_name}`, c.city && `Sede: ${c.city}`].filter(Boolean).join(" · ")}</p>}
            {contacts.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{contacts.map(([k, Icon, v, href]) => <a key={k} href={href} target="_blank" rel="noreferrer" className="btn-ghost h-9 text-xs"><Icon className="h-4 w-4 text-fsl-gold" /> {v}</a>)}</div>}
          </Panel>
          <Panel icon={Medal} title="Albo d'oro" to={`/albo-doro/societa/${d.org_club_id}`} testId="club-entity-history">
            {(d.history?.seasons || []).length === 0 ? <p className="text-sm text-fsl-slate">Nessuna stagione archiviata: lo storico si popola alla chiusura dei tornei.</p> : (
              <ul className="space-y-1.5 text-sm">{d.history.seasons.slice(0, 8).map((s, i) => <li key={i} className="flex items-center justify-between gap-3 h-9 px-3 rounded-md bg-ink-950/50"><span className="truncate">{s.competition} · {s.season_label}</span><span className="num font-bold text-fsl-gold">{s.champion ? "Campione" : ord(s.pos)}</span></li>)}</ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
