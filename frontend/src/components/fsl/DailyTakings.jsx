import { useEffect, useState } from "react";
import { ChevronDown, Download, MapPin, Receipt } from "lucide-react";
import { toast } from "sonner";
import { SectionTitle } from "@/components/fsl/Primitives";
import { EmptyState } from "@/components/fsl/States";
import { api, apiError } from "@/lib/api";

const DAYS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const fmtDay = (iso) => { const d = new Date(`${iso}T12:00:00`); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

async function downloadCsv(tid, date) {
  try {
    const { data } = await api.get(`/tournaments/${tid}/payments/export`, { params: date ? { date } : {}, responseType: "blob" });
    const url = URL.createObjectURL(data);
    const a = Object.assign(document.createElement("a"), { href: url, download: `incassi-${date || "tutti"}.csv` });
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export CSV pronto per la contabilità");
  } catch (e) { toast.error(apiError(e)); }
}

function DayCard({ day, cur, tid, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="fsl-card overflow-hidden" data-testid={`takings-day-${day.date}`}>
      <div className="flex items-center gap-3 px-4 h-16">
        <button className="flex-1 min-w-0 flex items-center gap-3 text-left" onClick={() => setOpen(!open)} data-testid={`takings-day-toggle-${day.date}`}>
          <ChevronDown className={`h-4 w-4 shrink-0 text-fsl-slate transition-transform ${open ? "rotate-180" : ""}`} />
          <div className="min-w-0"><div className="font-display font-extrabold uppercase text-lg leading-tight truncate">{fmtDay(day.date)}</div><div className="text-xs text-fsl-slate num">{day.count} ricevute · {day.fields.length} {day.fields.length === 1 ? "campo" : "campi"}{day.methods.map((m) => ` · ${m.method} ${m.amount.toFixed(2)}`).join("")}</div></div>
        </button>
        <span className="num font-display font-extrabold text-2xl text-fsl-gold shrink-0" data-testid={`takings-day-total-${day.date}`}>{day.total.toFixed(2)} {cur}</span>
        <button className="btn-ghost h-9 px-3 shrink-0" onClick={() => downloadCsv(tid, day.date)} title="Esporta CSV della giornata" data-testid={`takings-export-${day.date}`}><Download className="h-4 w-4" /><span className="hidden sm:inline"> CSV</span></button>
      </div>
      {open && <div className="border-t border-white/10 divide-y divide-white/[0.06]">
        {day.fields.map((f) => <div key={f.field} className="px-4 py-3" data-testid={`takings-field-${day.date}-${f.field}`}>
          <div className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-fsl-blue-light" /><span className="font-semibold flex-1">{f.field}</span><span className="text-xs text-fsl-slate num">{f.count} ricevute</span><span className="num font-display font-bold text-lg">{f.total.toFixed(2)} {cur}</span></div>
          <div className="mt-2 grid gap-1">{f.rows.map((r) => <div key={r.id} className="flex items-center gap-3 text-xs sm:text-sm text-fsl-slate min-w-0"><span className="num w-12 shrink-0">{r.time}</span><span className="num w-28 shrink-0 whitespace-nowrap text-fsl-white/80 hidden sm:inline">{r.receipt_no}</span><span className="flex-1 min-w-0 truncate"><span className="text-fsl-white">{r.club}</span>{r.match ? ` · ${r.match}` : ""}{r.present != null ? ` · ${r.present} presenti` : ""}</span><span className="shrink-0 hidden sm:inline">{r.method}</span><span className="num text-fsl-success shrink-0">{r.amount.toFixed(2)}</span></div>)}</div>
        </div>)}
      </div>}
    </div>
  );
}

export function DailyTakings({ tid, cur }) {
  const [data, setData] = useState(null);
  useEffect(() => { if (tid) api.get(`/tournaments/${tid}/payments/daily`).then((r) => setData(r.data)).catch(() => setData({ days: [], total: 0, count: 0 })); }, [tid]);
  if (!data) return null;
  return (
    <section data-testid="daily-takings">
      <div className="flex items-center gap-3 flex-wrap"><SectionTitle>Incassi per giornata e campo</SectionTitle><span className="text-xs text-fsl-slate num">{data.count} ricevute · totale <span className="text-fsl-gold font-bold">{data.total.toFixed(2)} {cur}</span></span>
        {data.days.length > 0 && <button className="btn-ghost h-9 px-3 ml-auto" onClick={() => downloadCsv(tid)} data-testid="takings-export-all"><Download className="h-4 w-4" /> Esporta tutto (CSV)</button>}</div>
      {data.days.length === 0 ? <EmptyState icon={Receipt} title="Nessun incasso registrato" description="Gli incassi compaiono quando incassi la quota gara dal tabellino o registri un pagamento." /> : <div className="grid gap-3 mt-3">{data.days.map((d, i) => <DayCard key={d.date} day={d} cur={cur} tid={tid} defaultOpen={i === 0} />)}</div>}
    </section>
  );
}
