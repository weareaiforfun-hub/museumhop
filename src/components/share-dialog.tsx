import { useState } from "react";
import { Check, Copy, Eye, PencilLine, X } from "lucide-react";
import { sync } from "../lib/sync";
import { track } from "../lib/track";

/** "Share your night": the invite link (plan together) and a view-only link (see the routes, change nothing). */
export function ShareDialog({ invite, nightId, canPlan, onClose }: { invite: string; nightId: string; canPlan: boolean; onClose: () => void }) {
  const inviteUrl = location.origin + location.pathname + "#night=" + invite;
  const [view, setView] = useState<{ url: string; crews: boolean } | null>(null);
  const [copied, setCopied] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [confirmNew, setConfirmNew] = useState(false);

  async function copy(url: string, which: string) {
    try { await navigator.clipboard.writeText(url); setCopied(which); track(which === "view" ? "view-link-copy" : "invite-copy"); }
    catch { setError("Couldn’t copy. Select the link and copy it yourself."); }
  }
  async function load(opts: { crews?: boolean; renew?: boolean } = {}) {
    setBusy(true); setError(""); setConfirmNew(false);
    try { setView(await sync!.viewLink(nightId, opts)); if (opts.renew) setCopied(""); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function off() {
    setBusy(true); setError("");
    try { await sync!.viewLinkOff(nightId); setView(null); setCopied(""); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return <div className="modal-backdrop" onClick={onClose}>
    <section className="keep-spot share-dialog" role="dialog" aria-modal="true" aria-label="Share your night" onClick={(e) => e.stopPropagation()}>
      <button className="modal-close" aria-label="Close" onClick={onClose}><X size={20} /></button>
      <span className="eyebrow">Museumnacht 2026</span>
      <h2>Share your night</h2>
      <div className="spot-option best">
        <b><PencilLine size={16} />Plan together</b>
        <p>Friends who open this link join the night and can add, move and vote.</p>
        <code className="spot-link">{inviteUrl}</code>
        <div className="spot-actions"><button className="primary" onClick={() => copy(inviteUrl, "invite")}>{copied === "invite" ? <><Check size={15} />Copied</> : <><Copy size={15} />Copy invite link</>}</button></div>
      </div>
      <div className="spot-option">
        <b><Eye size={16} />View only</b>
        <p>For parents, partners or friends who join later. They see the route, times and places. No names, votes or notes, and they can’t change anything.</p>
        {!canPlan ? <p className="spot-note">Only people who can plan can share a view-only link.</p>
          : !view ? <button className="secondary" disabled={busy} onClick={() => load()}><Eye size={15} />{busy ? "Getting the link…" : "Get the view-only link"}</button>
          : <>
            <code className="spot-link">{view.url}</code>
            <div className="spot-actions"><button className="primary" onClick={() => copy(view.url, "view")}>{copied === "view" ? <><Check size={15} />Copied</> : <><Copy size={15} />Copy view-only link</>}</button></div>
            <label className="share-check"><input type="checkbox" checked={view.crews} disabled={busy} onChange={(e) => load({ crews: e.target.checked })} />Also show crew routes</label>
            {confirmNew
              ? <div className="spot-confirm"><p>A new link turns this one off for everyone who has it.</p><div className="spot-actions"><button className="secondary" disabled={busy} onClick={() => load({ renew: true })}>Make a new link</button><button className="text-button" onClick={() => setConfirmNew(false)}>Keep this one</button></div></div>
              : <div className="share-more"><button className="text-button" onClick={() => setConfirmNew(true)}>Make a new link</button><button className="text-button" disabled={busy} onClick={off}>Turn the view-only link off</button></div>}
          </>}
      </div>
      {error && <p className="dialog-error" role="alert">{error}</p>}
    </section>
  </div>;
}
