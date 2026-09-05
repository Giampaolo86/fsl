import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ReasonDialog({ open, onOpenChange, title, description, confirmLabel = "Conferma", danger = false, onConfirm, requireReason = true }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      setReason("");
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" data-testid="reason-dialog">
        <DialogHeader>
          <DialogTitle className="font-display uppercase text-2xl">{title}</DialogTitle>
          {description && <DialogDescription className="text-fsl-slate">{description}</DialogDescription>}
        </DialogHeader>
        <label className="block">
          <span className="fsl-label">Motivazione {requireReason && <span className="text-fsl-danger">*</span>}</span>
          <textarea
            className="fsl-input mt-1 h-24 py-2 resize-none"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Indica il motivo dell'operazione: verrà registrato nell'audit log"
            data-testid="reason-dialog-textarea"
          />
        </label>
        <DialogFooter>
          <button className="btn-ghost" onClick={() => onOpenChange(false)} data-testid="reason-dialog-cancel">
            Annulla
          </button>
          <button className={danger ? "btn-danger" : "btn-primary"} disabled={busy || (requireReason && !reason.trim())} onClick={submit} data-testid="reason-dialog-confirm">
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
