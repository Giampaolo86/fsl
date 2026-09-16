import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { profileLink } from "@/pages/PlayerProfile";
import { Plus, Ticket, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/fsl/Primitives";
import { StandingsTable } from "@/components/fsl/StandingsTable";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useScoped, useTournamentDetail } from "@/hooks/useTournamentData";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { PlayerCardDialog } from "@/components/fsl/PlayerCard";
import { BadgeChips } from "@/components/fsl/BadgeChips";
import { mediaUrl } from "@/lib/upload";
import { RosterImportAdmin, RosterImportClub } from "@/components/fsl/RosterImport";
import { fmtDate } from "@/lib/format";

export function Standings() {
  const { data, error, loading, reload } = useScoped("standings");
  const [params, setParams] = useSearchParams();
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={apiError(error)} onRetry={reload} />;
  const cats = [...new Set(data.map((s) => s.competition.category))];
  const cat = params.get("cat") || cats[0];
  return (
    <div>
      <PageHeader kicker="Classifiche e statistiche" title="Classifiche" subtitle="Ricalcolo da soli risultati ufficiali/rettificati con tie-break della competizione; uno snapshot viene salvato a ogni ufficializzazione." actions={<select className="fsl-input w-40" value={cat} onChange={(e) => setParams({ cat: e.target.value })} data-testid="standings-category"><option value="">Tutte</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>} />
      <div className="grid xl:grid-cols-2 gap-4">{data.filter((s) => !cat || s.competition.category === cat).map((s) => <StandingsTable key={s.competition.id} competition={s.competition} rows={s.rows} />)}</div>
    </div>
  );
}

export function Tickets() {
  const { tournamentId } = useParams();
  const { data: t } = useTournamentDetail();
  const [list, setList] = useState(null);
  const [notes, setNotes] = useState({});
  const load = () => api.get(`/tournaments/${tournamentId}/error-reports`).then((r) => setList(r.data));
  useEffect(() => { load(); }, [tournamentId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list || !t) return <LoadingState />;
  const canHandle = ["super_admin", "director", "secretary"].includes(t.my_role) && !t.read_only;
  const update = async (id, status) => { try { await api.patch(`/tournaments/${tournamentId}/error-reports/${id}`, { status, resolution: notes[id] || "" }); toast.success("Segnalazione aggiornata"); load(); } catch (e) { toast.error(apiError(e)); } };
  const tone = { open: "text-fsl-danger", reviewing: "text-fsl-warning", resolved: "text-fsl-success", rejected: "text-fsl-slate" };
  const label = { open: "Aperta", reviewing: "In revisione", resolved: "Rettificata/Risolta", rejected: "Respinta" };
  return (
    <div>
      <PageHeader kicker="Ticket e segnalazioni" title="Segnalazioni" subtitle={`${list.filter((x) => x.status === "open").length} aperte. Una segnalazione non modifica la classifica: decide il Direttore.`} />
      {list.length === 0 ? <EmptyState icon={Ticket} title="Nessuna segnalazione" description="Società e utenti possono segnalare errori dalle gare." /> : (
        <div className="space-y-3">{list.map((e) => (
          <article key={e.id} className="fsl-card p-4" data-testid={`ticket-${e.id}`}>
            <div className="flex flex-wrap items-center gap-3 text-xs"><span className={`font-semibold uppercase ${tone[e.status]}`}>● {label[e.status]}</span><span className="text-fsl-slate">{e.reporter_name} · {fmtDate(e.created_at, { time: true })}</span>{e.match_id && <a href={`/admin/t/${tournamentId}/partite/${e.match_id}`} className="text-fsl-gold">Apri gara</a>}</div>
            <h3 className="mt-1 font-semibold">{e.subject}</h3><p className="text-sm text-fsl-slate">{e.description}</p>
            {e.resolution && <p className="text-xs mt-1 text-fsl-white/80">Esito: {e.resolution}</p>}
            {canHandle && e.status !== "resolved" && e.status !== "rejected" && (
              <div className="mt-3 flex flex-col md:flex-row gap-2"><input className="fsl-input h-9 flex-1" placeholder="Esito o richiesta informazioni…" value={notes[e.id] || ""} onChange={(ev) => setNotes({ ...notes, [e.id]: ev.target.value })} data-testid={`ticket-note-${e.id}`} />
                <button className="btn-ghost h-9" onClick={() => update(e.id, "reviewing")} data-testid={`ticket-review-${e.id}`}>In revisione</button><button className="btn-ghost h-9" onClick={() => update(e.id, "rejected")}>Respingi</button><button className="btn-gold h-9" onClick={() => update(e.id, "resolved")} data-testid={`ticket-resolve-${e.id}`}>Risolvi</button></div>
            )}
          </article>
        ))}</div>
      )}
    </div>
  );
}

export function Rosters({ clubMode = false }) {
  const params = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const membership = user.memberships.find((m) => m.role === "club_manager");
  const tid = clubMode ? membership?.tournament_id : params.tournamentId;
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState("");
  const [players, setPlayers] = useState(null);
  const [badges, setBadges] = useState({});
  const [openPlayer, setOpenPlayer] = useState(null);
  const fetchCard = useCallback((pid) => api.get(`/tournaments/${tid}/players/${pid}/card`), [tid]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", birth_year: "", shirt_number: "", role: "Centrocampista", profile_visibility: "private", media_consent: false });
  useEffect(() => { if (tid) api.get(`/tournaments/${tid}/teams`).then((r) => { setTeams(r.data); setTeamId((x) => x || r.data[0]?.id || ""); }); }, [tid]);
  useEffect(() => { if (tid && teamId) { api.get(`/tournaments/${tid}/players`, { params: { team_id: teamId } }).then((r) => setPlayers(r.data)); api.get(`/tournaments/${tid}/badges`, { params: { team_id: teamId } }).then((r) => setBadges(r.data.reduce((acc, b) => { (acc[b.player_id] = acc[b.player_id] || []).push(b); return acc; }, {}))).catch(() => {}); } }, [tid, teamId]);
  if (!tid) return <EmptyState icon={Users} title="Nessuna società assegnata" />;
  const save = async () => {
    try {
      await api.post(`/tournaments/${tid}/players`, { ...form, team_id: teamId, birth_year: form.birth_year ? Number(form.birth_year) : null, shirt_number: form.shirt_number ? Number(form.shirt_number) : null });
      toast.success("Giocatore aggiunto"); setOpen(false); setForm({ ...form, first_name: "", last_name: "", shirt_number: "" });
      api.get(`/tournaments/${tid}/players`, { params: { team_id: teamId } }).then((r) => setPlayers(r.data));
    } catch (e) { toast.error(apiError(e)); }
  };
  const uploadPhoto = async (p, file) => { const fd = new FormData(); fd.append("file", file); try { await api.post(`/tournaments/${tid}/players/${p.id}/photo`, fd, { headers: { "Content-Type": "multipart/form-data" } }); toast.success("Foto aggiornata"); api.get(`/tournaments/${tid}/players`, { params: { team_id: teamId } }).then((r) => setPlayers(r.data)); } catch (e) { toast.error(apiError(e)); } };
  const toggleConsent = async (p) => { try { await api.patch(`/tournaments/${tid}/players/${p.id}`, { media_consent: !p.media_consent, profile_visibility: !p.media_consent ? "public" : "private" }); api.get(`/tournaments/${tid}/players`, { params: { team_id: teamId } }).then((r) => setPlayers(r.data)); } catch (e) { toast.error(apiError(e)); } };
  return (
    <div>
      <PageHeader kicker="Rose, documenti e idoneità" title="Rose" subtitle="Anagrafica privata (anno di nascita mai pubblico). Nome e foto compaiono sul sito solo con consenso immagine attivo." actions={<><select className="fsl-input w-64" value={teamId} onChange={(e) => setTeamId(e.target.value)} data-testid="roster-team-select">{teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}</select>{teamId && <button className="btn-primary" onClick={() => setOpen(true)} data-testid="roster-add-button"><Plus className="h-4 w-4" /> Giocatore</button>}</>} />
      {clubMode ? <RosterImportClub tid={tid} teamId={teamId} /> : <RosterImportAdmin tid={tid} onImported={() => api.get(`/tournaments/${tid}/players`, { params: { team_id: teamId } }).then((r) => setPlayers(r.data))} />}
      {!players ? <LoadingState /> : players.length === 0 ? <EmptyState icon={Users} title="Rosa vuota" description="Aggiungi i giocatori per abilitare convocazioni ed eventi." /> : (
        <div className="fsl-card overflow-x-auto"><table className="w-full table-dark" data-testid="roster-table"><thead><tr><th>N.</th><th>Foto</th><th>Giocatore</th><th>Ruolo</th><th>Anno</th><th>Badge</th><th>Stato</th><th>Consenso immagine</th></tr></thead><tbody>
          {players.map((p) => <tr key={p.id} data-testid={`player-row-${p.id}`}><td className="num font-display font-bold text-lg text-fsl-gold">{p.shirt_number ?? "–"}</td><td><label className="relative h-10 w-10 rounded-full overflow-hidden border border-white/20 bg-navy-700 inline-flex items-center justify-center cursor-pointer hover:border-fsl-gold/70 group" title="Carica foto">{p.photo_url ? <img src={mediaUrl(p.photo_url)} alt="" className="h-full w-full object-cover" /> : <span className="text-[10px] font-bold text-fsl-slate">{p.first_name[0]}{p.last_name[0]}</span>}<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadPhoto(p, e.target.files[0])} data-testid={`photo-input-${p.id}`} /></label></td><td className="font-semibold"><button onClick={() => setOpenPlayer(p.id)} className="hover:text-fsl-gold transition-colors text-left" data-testid={`open-player-${p.id}`}>{p.first_name} {p.last_name}</button><Link to={profileLink(location.pathname, p.id) || "#"} className="ml-2 text-[10px] uppercase text-fsl-gold hover:underline" data-testid={`player-profile-link-${p.id}`}>Scheda</Link></td><td className="text-fsl-slate">{p.role}</td><td className="num text-fsl-slate">{p.birth_year ?? "—"}</td><td><BadgeChips list={badges[p.id] || []} max={4} /></td><td className="text-xs"><span className={p.status === "active" ? "text-fsl-success" : "text-fsl-warning"}>● {p.status === "active" ? "Idoneo" : p.status}</span></td>
            <td><button onClick={() => toggleConsent(p)} className={`h-8 px-3 rounded-full border text-xs font-semibold ${p.media_consent ? "border-fsl-success/50 text-fsl-success" : "border-white/20 text-fsl-slate"}`} data-testid={`consent-${p.id}`}>{p.media_consent ? "Pubblicabile" : "Privato"}</button></td></tr>)}
        </tbody></table></div>
      )}
      <PlayerCardDialog playerId={openPlayer} onClose={() => setOpenPlayer(null)} fetcher={fetchCard} />
      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" aria-describedby={undefined} data-testid="player-dialog">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Nuovo giocatore</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <input className="fsl-input" placeholder="Nome" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} data-testid="player-first-name" /><input className="fsl-input" placeholder="Cognome" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} data-testid="player-last-name" />
          <input type="number" className="fsl-input" placeholder="Anno di nascita" value={form.birth_year} onChange={(e) => setForm({ ...form, birth_year: e.target.value })} /><input type="number" className="fsl-input" placeholder="Numero maglia" value={form.shirt_number} onChange={(e) => setForm({ ...form, shirt_number: e.target.value })} data-testid="player-number" />
          <select className="fsl-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{["Portiere", "Difensore", "Centrocampista", "Esterno", "Attaccante"].map((r) => <option key={r}>{r}</option>)}</select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.media_consent} onChange={(e) => setForm({ ...form, media_consent: e.target.checked, profile_visibility: e.target.checked ? "public" : "private" })} /> Consenso immagine</label>
        </div>
        <DialogFooter><button className="btn-ghost" onClick={() => setOpen(false)}>Annulla</button><button className="btn-primary" disabled={!form.first_name || !form.last_name} onClick={save} data-testid="player-save">Salva</button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
}
