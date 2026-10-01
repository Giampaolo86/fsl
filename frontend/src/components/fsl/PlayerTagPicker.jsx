import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Search, X } from "lucide-react";

const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function PlayerTagPicker({ players, value, onChange, placeholder = "Scrivi un nome, un numero di maglia o una squadra…", emptyHint, rosterLink, testId = "player-tag-picker", compact = false }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef(null);
  const selected = useMemo(() => value.map((id) => players.find((p) => p.id === id)).filter(Boolean), [value, players]);
  const results = useMemo(() => {
    const nq = norm(q.trim());
    const pool = players.filter((p) => !value.includes(p.id));
    const list = nq ? pool.filter((p) => norm(`${p.shirt_number ?? ""} ${p.label} ${p.team}`).includes(nq) || nq.split(/\s+/).every((w) => norm(`${p.label} ${p.team}`).includes(w))) : pool;
    return list.slice(0, 12);
  }, [q, players, value]);
  useEffect(() => { const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  useEffect(() => { setHi(0); }, [q]);
  const add = (p) => { onChange([...value, p.id]); setQ(""); setOpen(true); };
  const remove = (id) => onChange(value.filter((x) => x !== id));
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { if (open && results[hi]) { e.preventDefault(); add(results[hi]); } }
    else if (e.key === "Escape") setOpen(false);
    else if (e.key === "Backspace" && !q && value.length) remove(value[value.length - 1]);
  };
  if (!players.length) {
    return (
      <div className="rounded-md border border-dashed border-white/15 px-3 py-2 text-xs text-fsl-slate" data-testid={`${testId}-empty`}>
        {emptyHint || "Nessun giocatore disponibile: le squadre collegate non hanno ancora una rosa."}{rosterLink && <> <Link to={rosterLink} className="text-fsl-gold hover:underline">Carica le rose →</Link></>}
      </div>
    );
  }
  return (
    <div ref={box} className="relative" data-testid={testId}>
      <div className={`fsl-input flex flex-wrap items-center gap-1 ${compact ? "min-h-9 py-1" : "min-h-11 py-1.5"} h-auto cursor-text`} onClick={() => box.current.querySelector("input")?.focus()}>
        {selected.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-full bg-fsl-gold text-ink-950 text-[11px] font-semibold" data-testid={`${testId}-chip-${p.id}`}>
            {p.shirt_number != null && <span className="num opacity-70">{p.shirt_number}</span>}{p.label}<span className="opacity-60 font-normal hidden sm:inline">· {p.team}</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); remove(p.id); }} className="h-5 w-5 inline-flex items-center justify-center rounded-full hover:bg-ink-950/20" aria-label={`Rimuovi ${p.label}`} data-testid={`${testId}-remove-${p.id}`}><X className="h-3 w-3" /></button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1 flex-1 min-w-[160px]"><Search className="h-3.5 w-3.5 text-fsl-slate shrink-0" /><input className="bg-transparent outline-none flex-1 min-w-0 text-sm py-1" placeholder={selected.length ? "Aggiungi un altro…" : placeholder} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey} aria-label="Cerca giocatore" data-testid={`${testId}-input`} /></span>
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 left-0 right-0 max-h-64 overflow-y-auto fsl-scroll rounded-md border border-white/15 bg-navy-800 shadow-xl py-1" role="listbox" data-testid={`${testId}-results`}>
          {results.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === hi} onMouseDown={(e) => { e.preventDefault(); add(p); }} onMouseEnter={() => setHi(i)} className={`px-3 h-9 flex items-center gap-2 text-sm cursor-pointer ${i === hi ? "bg-fsl-gold/15 text-white" : "text-fsl-white/90"}`} data-testid={`${testId}-option-${p.id}`}>
              <span className="num w-6 text-right text-xs text-fsl-slate">{p.shirt_number ?? ""}</span><span className="font-semibold truncate">{p.label}</span><span className="ml-auto text-xs text-fsl-slate truncate">{p.team}</span>
            </li>
          ))}
        </ul>
      )}
      {open && q && results.length === 0 && <div className="absolute z-30 mt-1 left-0 right-0 rounded-md border border-white/15 bg-navy-800 shadow-xl px-3 py-2 text-xs text-fsl-slate" data-testid={`${testId}-no-results`}>Nessun giocatore trovato per «{q}».</div>}
    </div>
  );
}
