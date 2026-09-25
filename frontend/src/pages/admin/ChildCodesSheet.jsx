import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { LoadingState } from "@/components/fsl/States";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ROLE_CODE } from "@/lib/fanta";

// Foglio stampabile (Stampa → Salva come PDF) con i codici figlio da consegnare ai genitori, una pagina per società
export default function ChildCodesSheet({ mode = "admin" }) {
  const { tournamentId } = useParams();
  const { user } = useAuth();
  const tid = mode === "club" ? user?.memberships?.find((m) => m.role === "club_manager")?.tournament_id : tournamentId;
  const [params] = useSearchParams();
  const clubFilter = params.get("club");
  const [t, setT] = useState(null);
  const [clubs, setClubs] = useState(null);
  const [players, setPlayers] = useState(null);
  const [teams, setTeams] = useState([]);
  useEffect(() => {
    if (!tid) return;
    const base = mode === "club" ? api.get("/me/club", { params: { tournament_id: tid } }) : null;
    Promise.all([api.get(`/tournaments/${tid}`), base || api.get(`/tournaments/${tid}/clubs`), api.get(`/tournaments/${tid}/players`), api.get(`/tournaments/${tid}/teams`)]).then(([a, c, p, tm]) => {
      setT(a.data);
      const list = base ? [c.data.club] : Array.isArray(c.data) ? c.data : c.data.items;
      setClubs(list.filter((x) => !clubFilter || x.id === clubFilter));
      setPlayers(Array.isArray(p.data) ? p.data : p.data.items);
      setTeams(Array.isArray(tm.data) ? tm.data : tm.data.items || []);
    });
  }, [tid, clubFilter, mode]);
  const byClub = useMemo(() => (players || []).reduce((acc, p) => { (acc[p.club_id] = acc[p.club_id] || []).push(p); return acc; }, {}), [players]);
  if (!t || !clubs || !players) return <LoadingState full />;
  const teamName = (id) => teams.find((x) => x.id === id)?.name || "";
  return (
    <div className="min-h-screen bg-white text-[#03131F] print:bg-white" data-testid="child-codes-sheet">
      <style>{`@media print { .no-print { display: none !important; } .sheet-page { page-break-after: always; } @page { size: A4; margin: 14mm; } }`}</style>
      <div className="no-print sticky top-0 z-10 bg-[#03131F] text-white px-6 h-14 flex items-center gap-3">
        <Link to={mode === "club" ? "/societa/rose" : `/admin/t/${tid}/rose`} className="inline-flex items-center gap-1 text-sm hover:text-[#F4AE2B]" data-testid="child-codes-back"><ArrowLeft className="h-4 w-4" /> Torna alle rose</Link>
        <span className="text-xs text-white/60">{clubs.length} società · {Object.values(byClub).flat().filter((p) => clubs.some((c) => c.id === p.club_id)).length} atleti</span>
        <button type="button" onClick={() => window.print()} className="ml-auto inline-flex items-center gap-2 h-9 px-4 rounded-full bg-[#F4AE2B] text-[#03131F] font-bold text-sm" data-testid="child-codes-print"><Printer className="h-4 w-4" /> Stampa / Salva PDF</button>
      </div>
      {clubs.map((c) => {
        const rows = (byClub[c.id] || []).sort((a, b) => (teamName(a.team_id) + a.last_name).localeCompare(teamName(b.team_id) + b.last_name));
        return (
          <section key={c.id} className="sheet-page mx-auto max-w-[800px] px-8 py-10" data-testid={`child-codes-club-${c.id}`}>
            <header className="flex items-center gap-4 border-b-4 border-[#F4AE2B] pb-4">
              <ClubCrest club={c} size={64} />
              <div className="flex-1"><div className="text-[10px] uppercase tracking-[0.25em] text-[#666]">{t.name} · Codici figlio</div><h1 className="text-3xl font-extrabold uppercase leading-none" style={{ fontFamily: "Barlow Condensed, Arial Narrow, sans-serif" }}>{c.name}</h1></div>
              <img src="/brand/logo.png" alt="FSL" className="h-14 w-14 object-contain" />
            </header>
            <p className="mt-4 text-xs text-[#444] leading-relaxed">Consegnare a ogni famiglia il proprio codice (riservato). Il genitore o un familiare entra su <strong>Genitori e tifosi</strong> → «Segui tuo figlio · ho un codice», inserisce il codice e segue subito la scheda dell'atleta. Un codice vale per più familiari; in caso di smarrimento la società o l'organizzazione può rigenerarlo.</p>
            <table className="w-full mt-5 text-sm border-collapse">
              <thead><tr className="text-left text-[10px] uppercase tracking-wider text-[#666] border-b border-[#ccc]"><th className="py-2 pr-2">#</th><th className="py-2 pr-2">Atleta</th><th className="py-2 pr-2">Squadra</th><th className="py-2 pr-2">Ruolo</th><th className="py-2 text-right">Codice figlio</th></tr></thead>
              <tbody>{rows.map((p) => <tr key={p.id} className="border-b border-[#eee]" data-testid={`child-codes-row-${p.id}`}><td className="py-2 pr-2 tabular-nums text-[#666]">{p.shirt_number ?? "—"}</td><td className="py-2 pr-2 font-semibold">{p.last_name} {p.first_name}<span className="block text-[10px] text-[#888]">classe {p.birth_year}</span></td><td className="py-2 pr-2 text-[#444]">{teamName(p.team_id)}</td><td className="py-2 pr-2 text-[#444]">{ROLE_CODE[p.role] || p.role}</td><td className="py-2 text-right"><span className="inline-block font-mono font-bold text-base tracking-[0.25em] border border-[#F4AE2B] rounded px-2 py-0.5" style={{ background: "#FFF7E0" }}>{p.link_code || "—"}</span></td></tr>)}</tbody>
            </table>
            {rows.length === 0 && <p className="mt-4 text-sm text-[#666]">Nessun atleta in rosa.</p>}
            <footer className="mt-6 text-[10px] text-[#888] flex justify-between"><span>Future Stars League · documento riservato alla società</span><span>Stampato il {new Date().toLocaleDateString("it-IT")}</span></footer>
          </section>
        );
      })}
    </div>
  );
}
