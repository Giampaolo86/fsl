import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Check, Send, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { currentSubscription, deviceLabel, isIos, isStandalone, permission, pushSupported, subscribePush, unsubscribePush } from "@/lib/push";
import { buyProduct } from "@/pages/DigitalProduct";

const eur = (n) => `${Number(n).toFixed(2).replace(".", ",")} €`;

function PassRow({ t, onBuy, busy }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-ink-950/60 px-4 py-3" data-testid={`push-pass-${t.slug}`}>
      <div className="min-w-0 flex-1">
        <div className="font-display font-bold uppercase truncate">{t.name}</div>
        <div className="text-xs text-fsl-slate">{t.season}{t.children ? ` · ${t.children} ${t.children === 1 ? "figlio abbinato" : "figli abbinati"}` : ""}</div>
      </div>
      {t.active ? <span className="inline-flex items-center gap-1 rounded-full bg-fsl-success/15 border border-fsl-success/50 px-3 h-8 text-xs font-bold text-fsl-success" data-testid={`push-pass-active-${t.slug}`}><Check className="h-3.5 w-3.5" /> Attivo fino al {fmtDate(t.pass_until)}</span>
        : <button className="btn-gold h-9" disabled={busy} onClick={() => onBuy(t)} data-testid={`push-pass-buy-${t.slug}`}>{busy ? "Reindirizzamento…" : `Attiva · ${eur(t.price)} / stagione`}</button>}
    </div>
  );
}

export function PushSettings({ compact = false }) {
  const [cfg, setCfg] = useState(null);
  const [sub, setSub] = useState(null);
  const [busy, setBusy] = useState("");
  const load = useCallback(() => { api.get("/push/config").then((r) => setCfg(r.data)).catch(() => setCfg({ enabled: false, devices: [], tournaments: [] })); currentSubscription().then(setSub); }, []);
  useEffect(() => { load(); }, [load]);
  if (!cfg) return null;
  const supported = pushSupported();
  const iosBlocked = isIos() && !isStandalone();
  const entitled = cfg.free || (cfg.tournaments || []).some((t) => t.active);
  const enable = async () => { setBusy("sub"); try { await subscribePush(cfg.public_key, deviceLabel()); toast.success("Notifiche attive su questo dispositivo"); load(); } catch (e) { toast.error(e.message || apiError(e)); } finally { setBusy(""); } };
  const disable = async () => { setBusy("unsub"); try { await unsubscribePush(); toast.success("Notifiche disattivate su questo dispositivo"); load(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(""); } };
  const test = async () => { setBusy("test"); try { await api.post("/push/test"); toast.success("Notifica di prova inviata: controlla il telefono"); } catch (e) { toast.error(apiError(e)); } finally { setBusy(""); } };
  const forget = async (id) => { try { await api.delete(`/push/devices/${id}`); load(); } catch (e) { toast.error(apiError(e)); } };
  const buy = async (t) => { setBusy(`buy-${t.slug}`); try { await buyProduct(t.slug, "push_pass", "me", t.name); } catch (e) { toast.error(apiError(e)); } finally { setBusy(""); } };
  return (
    <div className={compact ? "fsl-card p-5" : "fsl-card-gold p-5"} data-testid="push-settings">
      <div className="flex items-start gap-3">
        <span className="h-11 w-11 shrink-0 rounded-xl bg-fsl-gold/15 border border-fsl-gold/50 inline-flex items-center justify-center text-fsl-gold"><BellRing className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="font-display font-bold uppercase text-lg leading-none">Notifiche sul telefono</div>
          <p className="mt-1 text-xs text-fsl-slate">{cfg.free ? "Ricevi sul telefono gli avvisi della Control Room e dell'Area Società: referti, documenti, badge, foto da approvare." : "Top 11 con tuo figlio, risultati e gol delle squadre che segui, nuove foto approvate, badge e promemoria convocazioni: direttamente sul telefono, anche con l'app chiusa. Le notifiche in-app (campanella) restano gratuite."}</p>
        </div>
      </div>
      {!cfg.enabled && <p className="mt-4 text-xs text-fsl-warning">Le notifiche push non sono ancora configurate dall'organizzazione.</p>}
      {!cfg.free && cfg.tournaments.length > 0 && <div className="mt-4 space-y-2" data-testid="push-passes">{cfg.tournaments.map((t) => <PassRow key={t.slug} t={t} onBuy={buy} busy={busy === `buy-${t.slug}`} />)}</div>}
      {!cfg.free && cfg.tournaments.length === 0 && <p className="mt-4 text-xs text-fsl-slate" data-testid="push-no-tournaments">Abbina un figlio con il codice o segui una squadra: qui potrai attivare il pass stagionale del torneo.</p>}
      <div className="mt-4 rounded-xl border border-white/10 bg-ink-950/60 p-4" data-testid="push-device">
        <div className="flex flex-wrap items-center gap-3">
          <Smartphone className="h-5 w-5 text-fsl-gold" />
          <div className="flex-1 min-w-[180px]">
            <div className="text-sm font-semibold">Questo dispositivo</div>
            <div className="text-xs text-fsl-slate" data-testid="push-device-state">{!supported ? "Browser non compatibile con le notifiche push" : iosBlocked ? "Su iPhone/iPad: apri il menu Condividi di Safari → «Aggiungi alla schermata Home», poi attiva da lì." : permission() === "denied" ? "Notifiche bloccate: sbloccale nelle impostazioni del browser." : sub ? "Notifiche attive" : "Notifiche non attive"}</div>
          </div>
          {supported && !iosBlocked && (sub
            ? <><button className="btn-ghost h-9" disabled={!!busy || !entitled} onClick={test} title={entitled ? "" : "Serve un pass attivo"} data-testid="push-test"><Send className="h-4 w-4" /> {busy === "test" ? "Invio…" : "Prova"}</button><button className="btn-ghost h-9" disabled={!!busy} onClick={disable} data-testid="push-disable"><BellOff className="h-4 w-4" /> Disattiva</button></>
            : <button className="btn-gold h-9" disabled={!!busy || !cfg.enabled || permission() === "denied"} onClick={enable} data-testid="push-enable"><Bell className="h-4 w-4" /> {busy === "sub" ? "Attivazione…" : "Attiva su questo dispositivo"}</button>)}
        </div>
        {!entitled && sub && !cfg.free && <p className="mt-2 text-[11px] text-fsl-warning">Dispositivo pronto: gli avvisi arriveranno appena attivi il pass del torneo.</p>}
      </div>
      {cfg.devices.length > 0 && <div className="mt-3 divide-y divide-white/[0.06] text-xs" data-testid="push-devices">{cfg.devices.map((d) => <div key={d.id} className="py-2 flex items-center gap-3"><span className="flex-1 truncate">{d.label}</span><span className="text-fsl-slate num">{d.last_sent_at ? `ultimo invio ${fmtDate(d.last_sent_at)}` : `dal ${fmtDate(d.created_at)}`}</span><button className="text-fsl-slate hover:text-fsl-danger" onClick={() => forget(d.id)} title="Rimuovi dispositivo" data-testid={`push-device-forget-${d.id}`}><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>}
    </div>
  );
}
