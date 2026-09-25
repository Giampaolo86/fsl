import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Image as ImageIcon, LayoutTemplate, Share2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/fsl/Primitives";
import { LoadingState } from "@/components/fsl/States";
import { FORMATS, TEMPLATES } from "@/components/studio/templates";
import { api, apiError } from "@/lib/api";

const FINAL = ["official", "rectified"];

export default function Studio() {
  const { tournamentId: tid } = useParams();
  const canvas = useRef(null);
  const [t, setT] = useState(null);
  const [comps, setComps] = useState(null);
  const [compId, setCompId] = useState("");
  const [matches, setMatches] = useState([]);
  const [top11s, setTop11s] = useState([]);
  const [tpl, setTpl] = useState("matchday");
  const [day, setDay] = useState("");
  const [matchId, setMatchId] = useState("");
  const [top11Id, setTop11Id] = useState("");
  const [sponsorIdx, setSponsorIdx] = useState("");
  const [format, setFormat] = useState("4:5");
  const [headline, setHeadline] = useState("");
  const [rendering, setRendering] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => { Promise.all([api.get(`/tournaments/${tid}`), api.get(`/tournaments/${tid}/competitions`)]).then(([a, b]) => { setT(a.data); const list = Array.isArray(b.data) ? b.data : b.data.items; setComps(list); if (list[0]) setCompId(list[0].id); }); }, [tid]);
  useEffect(() => { if (!compId) return; Promise.all([api.get(`/tournaments/${tid}/matches`, { params: { competition_id: compId } }), api.get(`/tournaments/${tid}/top11`, { params: { competition_id: compId } })]).then(([m, k]) => { const ms = (Array.isArray(m.data) ? m.data : m.data.items || []).filter((x) => x.status !== "cancelled"); setMatches(ms); setTop11s(k.data); const days = [...new Set(ms.map((x) => x.match_day))].sort((a, b) => a - b); const nextDay = days.find((d) => ms.some((x) => x.match_day === d && !FINAL.includes(x.status))); setDay(days.length ? String(nextDay ?? days[days.length - 1]) : ""); setTop11Id((k.data.find((x) => x.status === "published") || k.data[0])?.id || ""); }); }, [tid, compId]);
  const days = useMemo(() => [...new Set(matches.map((x) => x.match_day))].sort((a, b) => a - b), [matches]);
  const dayMatches = useMemo(() => matches.filter((m) => String(m.match_day) === day).sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at)), [matches, day]);
  const finalMatches = useMemo(() => dayMatches.filter((m) => FINAL.includes(m.status)), [dayMatches]);
  useEffect(() => { setMatchId(finalMatches[0]?.id || ""); }, [finalMatches]);
  useEffect(() => { if (tpl === "fulltime" || tpl === "mvp") { const played = matches.filter((m) => FINAL.includes(m.status)).map((m) => m.match_day); if (played.length && !dayMatches.some((m) => FINAL.includes(m.status))) setDay(String(Math.max(...played))); } }, [tpl, matches, dayMatches]);
  const renderToken = useRef(0);
  const comp = comps?.find((c) => c.id === compId);
  const sponsors = t?.settings?.sponsors || [];
  const sponsor = sponsorIdx === "" ? null : sponsors[Number(sponsorIdx)];
  const template = TEMPLATES.find((x) => x.key === tpl);

  useEffect(() => {
    if (!canvas.current || !comp || !t) return;
    if ((template.needs === "day" || template.needs === "match") && !day) return;
    const [W, H] = FORMATS[format];
    const token = ++renderToken.current;
    const off = document.createElement("canvas"); off.width = W; off.height = H;
    const ctx = off.getContext("2d");
    const commit = () => { if (token !== renderToken.current || !canvas.current) return false; canvas.current.width = W; canvas.current.height = H; canvas.current.getContext("2d").drawImage(off, 0, 0); return true; };
    const side = (x) => ({ id: x.id, name: x.club?.name || x.name, short_name: x.club?.short_name, colors: x.club?.colors, crest_url: x.club && !x.club.crest_is_placeholder ? x.club.crest_url : null });
    const run = async () => {
      setRendering(true); setReady(false);
      try {
        const opts = { sponsor, headline: headline.trim() || undefined };
        if (tpl === "matchday") await template.render(ctx, W, H, { tournament: t.name, competition: comp.name, match_day: day, matches: dayMatches.map((m) => ({ ...m, home: side(m.home), away: side(m.away) })) }, opts);
        else if (tpl === "standings") { const { data } = await api.get(`/tournaments/${tid}/standings`, { params: { competition_id: compId } }); const rows = data[0]?.rows || []; await template.render(ctx, W, H, { tournament: t.name, competition: comp.name, rows, match_day: Math.max(0, ...matches.filter((m) => FINAL.includes(m.status)).map((m) => m.match_day)) || null }, opts); }
        else if (tpl === "top11") { if (!top11Id) throw new Error("Nessuna Top 11 elaborata per questa competizione"); const { data } = await api.get(`/tournaments/${tid}/top11/${top11Id}`); await template.render(ctx, W, H, { doc: data, competition: comp }, opts); }
        else { if (!matchId) throw new Error("Nessuna gara ufficiale nella giornata selezionata"); const { data } = await api.get(`/tournaments/${tid}/matches/${matchId}/social`); await template.render(ctx, W, H, data, opts); }
        if (commit()) setReady(true);
      } catch (e) { ctx.fillStyle = "#041E32"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#A8BACB"; ctx.font = "600 34px Inter, sans-serif"; ctx.textAlign = "center"; ctx.fillText(e.message || apiError(e), W / 2, H / 2); commit(); } finally { if (token === renderToken.current) setRendering(false); }
    };
    run();
  }, [tpl, format, day, matchId, top11Id, sponsor, headline, comp, t, tid, compId, dayMatches, matches, template]);

  const fileName = () => `fsl-${tpl}-${(comp?.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${format.replace(":", "x")}.png`;
  const download = () => { const a = document.createElement("a"); a.href = canvas.current.toDataURL("image/png"); a.download = fileName(); a.click(); };
  const share = async () => { const b = await new Promise((res) => canvas.current.toBlob(res, "image/png")); const file = new File([b], fileName(), { type: "image/png" }); if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: "Future Stars League" }); } catch (e) { if (e.name !== "AbortError") toast.error("Condivisione non riuscita"); } } else { download(); toast.info("Grafica scaricata"); } };
  if (!comps || !t) return <LoadingState />;
  const [W, H] = FORMATS[format];
  return (
    <div data-testid="studio">
      <PageHeader kicker="FSL Social Studio" title="Grafiche ufficiali" subtitle="Libreria di template con i dati ufficiali del torneo: scegli il template, la giornata o la gara, lo sponsor e scarica nei tre formati social." />
      <div className="grid lg:grid-cols-[360px_minmax(0,1fr)] gap-6">
        <aside className="space-y-5">
          <div className="fsl-card p-4" data-testid="studio-templates">
            <div className="fsl-label mb-2 flex items-center gap-1"><LayoutTemplate className="h-3.5 w-3.5 text-fsl-gold" /> Template</div>
            <div className="grid grid-cols-1 gap-2">{TEMPLATES.map((x) => <button key={x.key} type="button" onClick={() => setTpl(x.key)} className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${tpl === x.key ? "border-fsl-gold bg-fsl-gold/10" : "border-white/10 hover:border-white/30"}`} data-testid={`studio-template-${x.key}`}><div className="font-display font-extrabold uppercase text-base leading-none">{x.label}</div><div className="text-[11px] text-fsl-slate mt-1">{x.desc}</div></button>)}</div>
          </div>
          <div className="fsl-card p-4 space-y-3" data-testid="studio-source">
            <label className="block"><span className="fsl-label">Competizione</span><select className="fsl-input mt-1" value={compId} onChange={(e) => setCompId(e.target.value)} data-testid="studio-competition">{comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            {(template.needs === "day" || template.needs === "match") && <label className="block"><span className="fsl-label">Giornata</span><select className="fsl-input mt-1" value={day} onChange={(e) => setDay(e.target.value)} data-testid="studio-day">{days.map((d) => <option key={d} value={String(d)}>Giornata {d}</option>)}</select></label>}
            {template.needs === "match" && <label className="block"><span className="fsl-label">Gara ufficiale</span><select className="fsl-input mt-1" value={matchId} onChange={(e) => setMatchId(e.target.value)} data-testid="studio-match">{finalMatches.length === 0 && <option value="">Nessuna gara ufficiale</option>}{finalMatches.map((m) => <option key={m.id} value={m.id}>{m.home.club?.name || m.home.name} {m.score?.home}-{m.score?.away} {m.away.club?.name || m.away.name}</option>)}</select></label>}
            {template.needs === "top11" && <label className="block"><span className="fsl-label">Top 11</span><select className="fsl-input mt-1" value={top11Id} onChange={(e) => setTop11Id(e.target.value)} data-testid="studio-top11">{top11s.length === 0 && <option value="">Nessuna Top 11 elaborata</option>}{top11s.map((k) => <option key={k.id} value={k.id}>Giornata {k.match_day} · {k.status}</option>)}</select></label>}
            <label className="block"><span className="fsl-label">Titolo personalizzato</span><input className="fsl-input mt-1" placeholder={template.label} value={headline} onChange={(e) => setHeadline(e.target.value)} data-testid="studio-headline" /></label>
            <label className="block"><span className="fsl-label">Sponsor «Presented by»</span><select className="fsl-input mt-1" value={sponsorIdx} onChange={(e) => setSponsorIdx(e.target.value)} data-testid="studio-sponsor"><option value="">Nessuno</option>{sponsors.map((s, i) => <option key={i} value={String(i)}>{s.name}</option>)}</select>{sponsors.length === 0 && <span className="text-[11px] text-fsl-slate">Configura gli sponsor in Impostazioni → Sponsor e partner.</span>}</label>
          </div>
          <div className="fsl-card p-4" data-testid="studio-formats">
            <div className="fsl-label mb-2">Formato</div>
            <div className="grid grid-cols-3 gap-2">{Object.keys(FORMATS).map((f) => <button key={f} type="button" onClick={() => setFormat(f)} className={`h-11 rounded-lg border font-display font-bold ${format === f ? "border-fsl-gold bg-fsl-gold/10 text-fsl-gold" : "border-white/10 hover:border-white/30"}`} data-testid={`studio-format-${f.replace(":", "x")}`}>{f}<span className="block text-[9px] font-sans font-normal text-fsl-slate">{f === "4:5" ? "Feed" : f === "9:16" ? "Story" : "Quadrato"}</span></button>)}</div>
          </div>
        </aside>
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-fsl-slate num">{W} × {H} px{rendering ? " · rendering…" : ""}</span>
            <div className="ml-auto flex gap-2"><button className="btn-gold h-10" disabled={!ready} onClick={download} data-testid="studio-download"><Download className="h-4 w-4" /> Scarica PNG</button><button className="btn-primary h-10" disabled={!ready} onClick={share} data-testid="studio-share"><Share2 className="h-4 w-4" /> Condividi</button></div>
          </div>
          <div className="fsl-card p-4 flex justify-center bg-ink-950/60"><canvas ref={canvas} className={`rounded-xl border border-white/15 shadow-elev ${format === "9:16" ? "max-h-[78vh]" : "max-h-[78vh]"} max-w-full h-auto w-auto`} aria-label="Anteprima grafica" data-testid="studio-canvas" /></div>
          <p className="text-xs text-fsl-slate flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" /> I nomi dei bambini compaiono per intero solo con il consenso delle famiglie; le grafiche usano solo dati ufficiali.</p>
        </section>
      </div>
    </div>
  );
}
