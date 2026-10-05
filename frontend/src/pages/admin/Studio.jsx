import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Image as ImageIcon, LayoutTemplate, Share2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/fsl/Primitives";
import { LoadingState } from "@/components/fsl/States";
import { AiStudioPanel } from "@/components/fsl/AiStudioPanel";
import { LayerPanel } from "@/components/studio/LayerPanel";
import { drawLayers, drawSelection, hitLayer } from "@/components/studio/layers";
import { PublishToBlog } from "@/components/studio/PublishToBlog";
import { SavePreviewDialog, useSaveImage } from "@/components/studio/SaveImage";
import { loadImg } from "@/components/fsl/FifaCard";
import { FORMATS, TEMPLATES } from "@/components/studio/templates";
import { api, apiError } from "@/lib/api";

const FINAL = ["official", "rectified"];

export default function Studio() {
  const { tournamentId: tid } = useParams();
  const canvas = useRef(null);
  const baseRef = useRef(null);
  const cleanRef = useRef(document.createElement("canvas"));
  const boxesRef = useRef({});
  const dragRef = useRef(null);
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
  const [baseVersion, setBaseVersion] = useState(0);
  const [layers, setLayers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [options, setOptions] = useState({});

  useEffect(() => { Promise.all([api.get(`/tournaments/${tid}`), api.get(`/tournaments/${tid}/competitions`)]).then(([a, b]) => { setT(a.data); const list = Array.isArray(b.data) ? b.data : b.data.items; setComps(list); if (list[0]) setCompId(list[0].id); }); }, [tid]);
  useEffect(() => { if (!compId) return; Promise.all([api.get(`/tournaments/${tid}/matches`, { params: { competition_id: compId } }), api.get(`/tournaments/${tid}/top11`, { params: { competition_id: compId } })]).then(([m, k]) => { const ms = (Array.isArray(m.data) ? m.data : m.data.items || []).filter((x) => x.status !== "cancelled"); setMatches(ms); setTop11s(k.data); const days = [...new Set(ms.map((x) => x.match_day))].sort((a, b) => a - b); const nextDay = days.find((d) => ms.some((x) => x.match_day === d && !FINAL.includes(x.status))); setDay(days.length ? String(nextDay ?? days[days.length - 1]) : ""); setTop11Id((k.data.find((x) => x.status === "published") || k.data[0])?.id || ""); }); }, [tid, compId]);
  const days = useMemo(() => [...new Set(matches.map((x) => x.match_day))].sort((a, b) => a - b), [matches]);
  const dayMatches = useMemo(() => matches.filter((m) => String(m.match_day) === day).sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at)), [matches, day]);
  const finalMatches = useMemo(() => dayMatches.filter((m) => FINAL.includes(m.status)), [dayMatches]);
  useEffect(() => { setMatchId(finalMatches[0]?.id || ""); }, [finalMatches]);
  useEffect(() => { if (tpl === "fulltime" || tpl === "mvp" || tpl === "scorers") { const played = matches.filter((m) => FINAL.includes(m.status)).map((m) => m.match_day); if (played.length && !dayMatches.some((m) => FINAL.includes(m.status))) setDay(String(Math.max(...played))); } }, [tpl, matches, dayMatches]);
  const renderToken = useRef(0);
  const comp = comps?.find((c) => c.id === compId);
  const sponsors = t?.settings?.sponsors || [];
  const sponsor = sponsorIdx === "" ? null : sponsors[Number(sponsorIdx)];
  const template = TEMPLATES.find((x) => x.key === tpl);
  const { subtitle, hideHand, hideFooter, dim, baseImage } = options;
  const saver = useSaveImage();

  useEffect(() => {
    if (!comp || !t) return;
    if ((template.needs === "day" || template.needs === "match") && !day) return;
    const [W, H] = FORMATS[format];
    const token = ++renderToken.current;
    const off = document.createElement("canvas"); off.width = W; off.height = H;
    const ctx = off.getContext("2d");
    const commit = () => { if (token !== renderToken.current) return false; baseRef.current = off; setBaseVersion((v) => v + 1); return true; };
    const side = (x) => ({ id: x.id, name: x.club?.name || x.name, short_name: x.club?.short_name, colors: x.club?.colors, crest_url: x.club && !x.club.crest_is_placeholder ? x.club.crest_url : null });
    const run = async () => {
      setRendering(true); setReady(false);
      try {
        if (baseImage) {
          const im = await loadImg(baseImage);
          if (!im) throw new Error("Immagine base non caricabile");
          const r = Math.max(W / im.width, H / im.height), dw = im.width * r, dh = im.height * r;
          ctx.fillStyle = "#03131F"; ctx.fillRect(0, 0, W, H); ctx.drawImage(im, (W - dw) / 2, (H - dh) / 2, dw, dh);
          if (commit()) setReady(true);
          return;
        }
        const opts = { sponsor, headline: headline.trim() || undefined, subtitle: subtitle?.trim() || undefined, hideHand, hideFooter };
        if (tpl === "matchday") await template.render(ctx, W, H, { tournament: t.name, competition: comp.name, match_day: day, matches: dayMatches.map((m) => ({ ...m, home: side(m.home), away: side(m.away) })) }, opts);
        else if (tpl === "scorers") { const { data } = await api.get(`/tournaments/${tid}/top11/scorers`, { params: { competition_id: compId, match_day: Number(day) } }); await template.render(ctx, W, H, { tournament: t.name, competition: comp.name, match_day: day, rows: data }, opts); }
        else if (tpl === "standings") { const { data } = await api.get(`/tournaments/${tid}/standings`, { params: { competition_id: compId } }); const rows = data[0]?.rows || []; await template.render(ctx, W, H, { tournament: t.name, competition: comp.name, rows, match_day: Math.max(0, ...matches.filter((m) => FINAL.includes(m.status)).map((m) => m.match_day)) || null }, opts); }
        else if (tpl === "top11") { if (!top11Id) throw new Error("Nessuna Top 11 elaborata per questa competizione"); const { data } = await api.get(`/tournaments/${tid}/top11/${top11Id}`); await template.render(ctx, W, H, { doc: data, competition: comp }, opts); }
        else { if (!matchId) throw new Error("Nessuna gara ufficiale nella giornata selezionata"); const { data } = await api.get(`/tournaments/${tid}/matches/${matchId}/social`); await template.render(ctx, W, H, data, opts); }
        if (commit()) setReady(true);
      } catch (e) { ctx.fillStyle = "#041E32"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#A8BACB"; ctx.font = "600 34px Inter, sans-serif"; ctx.textAlign = "center"; ctx.fillText(e.message || apiError(e), W / 2, H / 2); commit(); } finally { if (token === renderToken.current) setRendering(false); }
    };
    run();
  }, [tpl, format, day, matchId, top11Id, sponsor, headline, subtitle, hideHand, hideFooter, baseImage, comp, t, tid, compId, dayMatches, matches, template]);

  const compositeToken = useRef(0);
  useEffect(() => {
    const base = baseRef.current; if (!base || !canvas.current) return;
    const token = ++compositeToken.current;
    const run = async () => {
      const W = base.width, H = base.height, clean = cleanRef.current; clean.width = W; clean.height = H;
      const cctx = clean.getContext("2d"); cctx.drawImage(base, 0, 0);
      const boxes = await drawLayers(cctx, W, H, layers, { dim });
      if (token !== compositeToken.current || !canvas.current) return;
      boxesRef.current = boxes;
      const vis = canvas.current; vis.width = W; vis.height = H; const vctx = vis.getContext("2d"); vctx.drawImage(clean, 0, 0);
      drawSelection(vctx, boxes[selectedId]);
    };
    run();
  }, [baseVersion, layers, selectedId, dim]);

  const toCanvas = (e) => { const r = canvas.current.getBoundingClientRect(); return { x: (e.clientX - r.left) * (canvas.current.width / r.width), y: (e.clientY - r.top) * (canvas.current.height / r.height) }; };
  const onDown = (e) => { const { x, y } = toCanvas(e); const hit = hitLayer(boxesRef.current, layers, x, y); setSelectedId(hit?.id || null); if (hit) { dragRef.current = { id: hit.id, dx: x / canvas.current.width - hit.x, dy: y / canvas.current.height - hit.y }; canvas.current.setPointerCapture(e.pointerId); } };
  const onMove = (e) => { const d = dragRef.current; if (!d) return; const { x, y } = toCanvas(e); const nx = Math.min(1, Math.max(0, x / canvas.current.width - d.dx)), ny = Math.min(1, Math.max(0, y / canvas.current.height - d.dy)); setLayers((ls) => ls.map((l) => (l.id === d.id ? { ...l, x: nx, y: ny } : l))); };
  const onUp = () => { dragRef.current = null; };
  useEffect(() => {
    const h = (e) => { if (!selectedId || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return; const step = e.shiftKey ? 0.02 : 0.005; const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]; if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); setLayers((ls) => ls.filter((l) => l.id !== selectedId)); setSelectedId(null); } else if (mv) { e.preventDefault(); setLayers((ls) => ls.map((l) => (l.id === selectedId ? { ...l, x: Math.min(1, Math.max(0, l.x + mv[0])), y: Math.min(1, Math.max(0, l.y + mv[1])) } : l))); } };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [selectedId]);
  const reset = useCallback(() => { setLayers([]); setOptions({}); setSelectedId(null); toast.info("Post base ripristinato"); }, []);

  const fileName = () => `fsl-${tpl}-${(comp?.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${format.replace(":", "x")}.png`;
  const download = () => saver.save(cleanRef.current, fileName());
  const share = () => saver.save(cleanRef.current, fileName(), { forceShare: true });
  if (!comps || !t) return <LoadingState />;
  const [W, H] = FORMATS[format];
  const selMatch = matches.find((m) => m.id === matchId);
  const mName = (x) => x?.club?.name || x?.name || "";
  const dayLabel = tpl === "standings" ? "" : ` · Giornata ${day}`;
  const blogDefaults = {
    matchday: { title: `Matchday · ${comp?.name} · Giornata ${day}`, excerpt: `Le gare della giornata ${day} di ${comp?.name}: orari e campi.`, kind: "news" },
    fulltime: { title: selMatch ? `${mName(selMatch.home)} ${selMatch.score?.home}-${selMatch.score?.away} ${mName(selMatch.away)}` : "Full Time", excerpt: `Il risultato finale della gara${dayLabel} di ${comp?.name}.`, kind: "match_story" },
    mvp: { title: selMatch ? `MVP · ${mName(selMatch.home)} - ${mName(selMatch.away)}` : "MVP", excerpt: `Il migliore in campo della gara${dayLabel} di ${comp?.name}.`, kind: "match_story" },
    scorers: { title: `Marcatori · ${comp?.name} · Giornata ${day}`, excerpt: `I marcatori della giornata ${day} di ${comp?.name}.`, kind: "news" },
    standings: { title: `Classifica · ${comp?.name}`, excerpt: `La classifica ufficiale aggiornata di ${comp?.name}.`, kind: "news" },
    top11: { title: `Top 11 · ${comp?.name} · Giornata ${top11s.find((k) => k.id === top11Id)?.match_day ?? ""}`, excerpt: `La formazione ideale della giornata di ${comp?.name}, in stile FIFA.`, kind: "news" },
  }[tpl];
  if (headline.trim()) blogDefaults.title = `${headline.trim()} · ${comp?.name}`;
  return (
    <div data-testid="studio">
      <Link to={`/admin/t/${tid}`} className="inline-flex items-center gap-1 text-xs text-fsl-slate hover:text-fsl-white mb-3" data-testid="studio-back"><ArrowLeft className="h-3.5 w-3.5" /> Torna alla Control Room</Link>
      <SavePreviewDialog preview={saver.preview} onClose={saver.close} />
      <PageHeader kicker="FSL Social Studio" title="Grafiche ufficiali" subtitle="Post base generato dai dati ufficiali + i tuoi livelli: testi, loghi, immagini e opzioni. Trascina gli elementi sull'anteprima, poi scarica, condividi o pubblica nel blog." />
      <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_340px] gap-6">
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
        <section className="space-y-3 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-fsl-slate num">{W} × {H} px{rendering ? " · rendering…" : ""}{layers.length ? ` · ${layers.length} livelli` : ""}</span>
            <div className="ml-auto flex flex-wrap gap-2"><button className="btn-gold h-10" disabled={!ready} onClick={download} data-testid="studio-download"><Download className="h-4 w-4" /> Scarica PNG</button><button className="btn-primary h-10" disabled={!ready} onClick={share} data-testid="studio-share"><Share2 className="h-4 w-4" /> Condividi</button><PublishToBlog tid={tid} slug={t.slug} canvasRef={cleanRef} disabled={!ready} defaults={{ ...blogDefaults, fileName: fileName().replace(/\.png$/, "") }} matchId={template.needs === "match" ? matchId : null} teamIds={template.needs === "match" && selMatch ? [selMatch.home.id, selMatch.away.id] : []} /></div>
          </div>
          <div className="fsl-card p-4 flex justify-center bg-ink-950/60"><canvas ref={canvas} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className={`rounded-xl border border-white/15 shadow-elev max-h-[78vh] max-w-full h-auto w-auto touch-none ${layers.length ? "cursor-move" : ""}`} aria-label="Anteprima grafica" data-testid="studio-canvas" /></div>
          <p className="text-xs text-fsl-slate flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" /> I nomi dei bambini compaiono per intero solo con il consenso delle famiglie; le grafiche usano solo dati ufficiali. I livelli aggiunti finiscono nel PNG scaricato, condiviso e pubblicato.</p>
        </section>
        <div className="space-y-4">
        <AiStudioPanel tid={tid} format={format === "9:16" ? "story" : format === "16:9" ? "wide" : "square"} onBackground={(url) => { setOptions({ ...options, baseImage: url }); toast.success("Sfondo IA applicato"); }} onCopy={(c) => { setOptions({ ...options, headline: c.title, subtitle: c.subtitle }); toast.success("Titolo e sottotitolo applicati"); }} />
        <LayerPanel tid={tid} template={tpl} layers={layers} setLayers={setLayers} selectedId={selectedId} setSelectedId={setSelectedId} options={options} setOptions={setOptions} sponsors={sponsors} onReset={reset} />
        </div>
      </div>
    </div>
  );
}
