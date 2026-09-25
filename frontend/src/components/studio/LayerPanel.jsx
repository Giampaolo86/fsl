import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, ImagePlus, Layers, RotateCcw, Save, Trash2, Type, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { loadImg } from "@/components/fsl/FifaCard";
import { BGS, FONTS, QUICK_TEXTS, SWATCHES, loadPresets, newImage, newText, readImageFile, savePresets } from "@/components/studio/layers";

const Row = ({ label, children }) => <label className="block"><span className="fsl-label">{label}</span><div className="mt-1">{children}</div></label>;
const Seg = ({ value, onChange, items, testId }) => <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${items.length},minmax(0,1fr))` }} data-testid={testId}>{items.map(([v, l]) => <button key={v} type="button" onClick={() => onChange(v)} className={`h-8 rounded-md border text-[11px] font-bold truncate px-1 ${String(value) === String(v) ? "border-fsl-gold bg-fsl-gold/10 text-fsl-gold" : "border-white/10 hover:border-white/30"}`}>{l}</button>)}</div>;
const Slider = ({ value, onChange, min, max, step = 1, testId }) => <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#F4AE2B]" data-testid={testId} />;

function TextProps({ l, up }) {
  return (
    <>
      <Row label="Testo"><textarea className="fsl-input min-h-[64px]" value={l.text} onChange={(e) => up({ text: e.target.value })} data-testid="layer-text" /></Row>
      <Row label="Carattere"><Seg value={l.font} onChange={(font) => up({ font })} items={Object.entries(FONTS).map(([k, v]) => [k, v[0]])} testId="layer-font" /></Row>
      <Row label={`Dimensione · ${l.size}px`}><Slider value={l.size} min={16} max={260} onChange={(size) => up({ size })} testId="layer-size" /></Row>
      <Row label="Colore"><div className="flex flex-wrap gap-1.5 items-center" data-testid="layer-color">{SWATCHES.map(([n, c]) => <button key={c} type="button" title={n} onClick={() => up({ color: c })} className={`h-7 w-7 rounded-full border-2 ${l.color.toUpperCase() === c ? "border-fsl-gold scale-110" : "border-white/20"}`} style={{ background: c }} />)}<input type="color" value={l.color} onChange={(e) => up({ color: e.target.value })} className="h-7 w-9 bg-transparent border border-white/20 rounded" title="Colore personalizzato" /></div></Row>
      <div className="grid grid-cols-2 gap-2">
        <Row label="Peso"><Seg value={l.weight} onChange={(w) => up({ weight: Number(w) })} items={[[400, "Reg."], [600, "Semi"], [800, "Bold"]]} /></Row>
        <Row label="Allineamento"><Seg value={l.align} onChange={(align) => up({ align })} items={[["left", "◧"], ["center", "▣"], ["right", "◨"]]} /></Row>
      </div>
      <Row label="Sfondo"><Seg value={l.bg} onChange={(bg) => up({ bg })} items={BGS} testId="layer-bg" /></Row>
      <Row label={`Rotazione · ${l.rotate}°`}><Slider value={l.rotate} min={-45} max={45} onChange={(rotate) => up({ rotate })} /></Row>
      <div className="flex gap-3 text-xs"><label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={l.upper} onChange={(e) => up({ upper: e.target.checked })} /> Maiuscolo</label><label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={l.shadow} onChange={(e) => up({ shadow: e.target.checked })} /> Ombra</label></div>
    </>
  );
}

function ImageProps({ l, up }) {
  return (
    <>
      <div className="flex items-center gap-3"><img src={l.src} alt="" className="h-14 w-14 rounded-lg object-contain bg-white/5 border border-white/10" /><input className="fsl-input h-9" value={l.name} onChange={(e) => up({ name: e.target.value })} data-testid="layer-name" /></div>
      <Row label={`Larghezza · ${Math.round(l.w * 100)}%`}><Slider value={Math.round(l.w * 100)} min={5} max={100} onChange={(v) => up({ w: v / 100 })} testId="layer-width" /></Row>
      <Row label={`Opacità · ${Math.round(l.opacity * 100)}%`}><Slider value={Math.round(l.opacity * 100)} min={10} max={100} onChange={(v) => up({ opacity: v / 100 })} /></Row>
      <Row label={`Angoli arrotondati · ${Math.round(l.round * 100)}%`}><Slider value={Math.round(l.round * 100)} min={0} max={100} onChange={(v) => up({ round: v / 100 })} /></Row>
      <Row label={`Rotazione · ${l.rotate}°`}><Slider value={l.rotate} min={-45} max={45} onChange={(rotate) => up({ rotate })} /></Row>
    </>
  );
}

export function LayerPanel({ tid, layers, setLayers, selectedId, setSelectedId, options, setOptions, sponsors = [], onReset }) {
  const fileRef = useRef(null);
  const [presets, setPresets] = useState(() => loadPresets(tid));
  const sel = layers.find((l) => l.id === selectedId);
  const add = (l) => { setLayers([...layers, l]); setSelectedId(l.id); };
  const up = (patch) => setLayers(layers.map((l) => (l.id === selectedId ? { ...l, ...patch } : l)));
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= layers.length) return; const a = [...layers]; [a[i], a[j]] = [a[j], a[i]]; setLayers(a); };
  const remove = (id) => { setLayers(layers.filter((l) => l.id !== id)); if (selectedId === id) setSelectedId(null); };
  const dup = (l) => add({ ...l, id: Math.random().toString(36).slice(2, 9), x: Math.min(0.95, l.x + 0.04), y: Math.min(0.95, l.y + 0.04), name: `${l.name} (copia)` });
  const onFile = async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; if (f.size > 4 * 1024 * 1024) return toast.error("Immagine troppo grande (max 4 MB)"); try { const { src, ratio } = await readImageFile(f); add(newImage(src, ratio, { name: f.name.replace(/\.[^.]+$/, "").slice(0, 24) })); } catch { toast.error("Immagine non leggibile"); } };
  const addUrlImage = async (url, name, w = 0.18) => { const im = await loadImg(url); if (!im) return toast.error("Logo non caricabile"); add(newImage(url, im.width / im.height, { name, w, y: 0.88 })); };
  const savePreset = () => { const name = window.prompt("Nome del modello (livelli e opzioni correnti)"); if (!name) return; const list = [...presets.filter((p) => p.name !== name), { name, layers, options }]; if (savePresets(tid, list)) { setPresets(list); toast.success(`Modello «${name}» salvato`); } else toast.error("Spazio locale insufficiente: riduci le immagini caricate"); };
  const applyPreset = (p) => { setLayers(p.layers.map((l) => ({ ...l, id: Math.random().toString(36).slice(2, 9) }))); setOptions(p.options || {}); setSelectedId(null); toast.success(`Modello «${p.name}» applicato`); };
  const delPreset = (p) => { const list = presets.filter((x) => x.name !== p.name); savePresets(tid, list); setPresets(list); };
  return (
    <div className="space-y-4" data-testid="studio-layers">
      <div className="fsl-card p-4 space-y-3" data-testid="studio-base-options">
        <div className="fsl-label flex items-center gap-1"><Wand2 className="h-3.5 w-3.5 text-fsl-gold" /> Post base · opzioni</div>
        <Row label="Sottotitolo personalizzato"><input className="fsl-input h-9" placeholder="Lascia vuoto per quello automatico" value={options.subtitle || ""} onChange={(e) => setOptions({ ...options, subtitle: e.target.value || undefined })} data-testid="studio-subtitle" /></Row>
        <div className="flex flex-wrap gap-3 text-xs"><label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={!!options.hideHand} onChange={(e) => setOptions({ ...options, hideHand: e.target.checked })} data-testid="studio-hide-hand" /> Nascondi claim manoscritto</label><label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={!!options.hideFooter} onChange={(e) => setOptions({ ...options, hideFooter: e.target.checked })} data-testid="studio-hide-footer" /> Nascondi footer</label></div>
        <Row label={`Scurisci sfondo · ${options.dim || 0}%`}><Slider value={options.dim || 0} min={0} max={70} onChange={(dim) => setOptions({ ...options, dim: dim || undefined })} testId="studio-dim" /></Row>
      </div>
      <div className="fsl-card p-4 space-y-3">
        <div className="fsl-label flex items-center gap-1"><Type className="h-3.5 w-3.5 text-fsl-gold" /> Aggiungi</div>
        <div className="flex flex-wrap gap-1.5" data-testid="studio-quick-add">{QUICK_TEXTS.map((q) => <button key={q.label} type="button" onClick={() => add(q.make())} className="h-8 rounded-full border border-white/15 px-3 text-[11px] font-semibold hover:border-fsl-gold hover:text-fsl-gold transition-colors" data-testid={`studio-add-${q.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{q.label}</button>)}<button type="button" onClick={() => add(newText())} className="h-8 rounded-full border border-white/15 px-3 text-[11px] font-semibold hover:border-fsl-gold hover:text-fsl-gold" data-testid="studio-add-text">Testo libero</button></div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => fileRef.current?.click()} className="h-8 inline-flex items-center gap-1 rounded-full border border-fsl-gold/50 px-3 text-[11px] font-semibold text-fsl-gold hover:bg-fsl-gold/10" data-testid="studio-add-image"><ImagePlus className="h-3.5 w-3.5" /> Carica immagine / logo</button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} data-testid="studio-image-input" />
          <button type="button" onClick={() => addUrlImage("/brand/logo.png", "Logo FSL", 0.14)} className="h-8 rounded-full border border-white/15 px-3 text-[11px] font-semibold hover:border-fsl-gold" data-testid="studio-add-fsl-logo">Logo FSL</button>
          {sponsors.filter((s) => s.logo_url).map((s, i) => <button key={i} type="button" onClick={() => addUrlImage(s.logo_url, s.name)} className="h-8 rounded-full border border-white/15 px-3 text-[11px] font-semibold hover:border-fsl-gold truncate max-w-[140px]">Logo {s.name}</button>)}
        </div>
      </div>
      <div className="fsl-card p-4 space-y-3">
        <div className="flex items-center justify-between"><div className="fsl-label flex items-center gap-1"><Layers className="h-3.5 w-3.5 text-fsl-gold" /> Livelli ({layers.length})</div>{(layers.length > 0 || Object.keys(options).length > 0) && <button type="button" onClick={onReset} className="inline-flex items-center gap-1 text-[11px] text-fsl-slate hover:text-fsl-white" data-testid="studio-reset"><RotateCcw className="h-3 w-3" /> Ripristina post base</button>}</div>
        {layers.length === 0 ? <p className="text-xs text-fsl-slate">Nessun livello: il post è quello base generato dai dati ufficiali. Aggiungi testi o immagini e trascinali sull'anteprima.</p> : (
          <ul className="space-y-1" data-testid="studio-layer-list">{layers.map((l, i) => (
            <li key={l.id} className={`flex items-center gap-1 rounded-lg border px-2 h-9 text-xs cursor-pointer ${l.id === selectedId ? "border-fsl-gold bg-fsl-gold/10" : "border-white/10 hover:border-white/30"}`} onClick={() => setSelectedId(l.id)} data-testid={`studio-layer-${i}`}>
              <span className="truncate flex-1"><span className="text-fsl-slate mr-1">{l.type === "text" ? "T" : "▣"}</span>{l.type === "text" ? l.text.split("\n")[0] : l.name}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); setLayers(layers.map((x) => (x.id === l.id ? { ...x, visible: x.visible === false } : x))); }} className="p-1 text-fsl-slate hover:text-fsl-white" title="Mostra/nascondi">{l.visible === false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); move(i, -1); }} className="p-1 text-fsl-slate hover:text-fsl-white" title="Porta sotto"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={(e) => { e.stopPropagation(); move(i, 1); }} className="p-1 text-fsl-slate hover:text-fsl-white" title="Porta sopra"><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={(e) => { e.stopPropagation(); dup(l); }} className="p-1 text-fsl-slate hover:text-fsl-white" title="Duplica"><Copy className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={(e) => { e.stopPropagation(); remove(l.id); }} className="p-1 text-fsl-slate hover:text-fsl-danger" title="Elimina" data-testid={`studio-layer-delete-${i}`}><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}</ul>
        )}
        {sel && <div className="pt-3 border-t border-white/10 space-y-3" data-testid="studio-layer-props">{sel.type === "text" ? <TextProps l={sel} up={up} /> : <ImageProps l={sel} up={up} />}<p className="text-[11px] text-fsl-slate">Trascina il livello sull'anteprima per posizionarlo · frecce per spostarlo · Canc per eliminarlo.</p></div>}
      </div>
      <div className="fsl-card p-4 space-y-2" data-testid="studio-presets">
        <div className="flex items-center justify-between"><div className="fsl-label flex items-center gap-1"><Save className="h-3.5 w-3.5 text-fsl-gold" /> Modelli salvati</div><button type="button" onClick={savePreset} disabled={layers.length === 0 && Object.keys(options).length === 0} className="text-[11px] text-fsl-gold hover:underline disabled:opacity-40" data-testid="studio-save-preset">Salva corrente</button></div>
        {presets.length === 0 ? <p className="text-xs text-fsl-slate">Salva i tuoi livelli come modello per riutilizzarli su altre grafiche (memorizzati su questo dispositivo).</p> : <ul className="space-y-1">{presets.map((p) => <li key={p.name} className="flex items-center gap-2 text-xs"><button type="button" onClick={() => applyPreset(p)} className="flex-1 text-left h-8 px-2 rounded-md border border-white/10 hover:border-fsl-gold truncate" data-testid={`studio-preset-${p.name}`}>{p.name} <span className="text-fsl-slate">· {p.layers.length} livelli</span></button><button type="button" onClick={() => delPreset(p)} className="p-1 text-fsl-slate hover:text-fsl-danger"><Trash2 className="h-3.5 w-3.5" /></button></li>)}</ul>}
      </div>
    </div>
  );
}
