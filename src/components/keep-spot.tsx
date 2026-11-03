import { useState } from "react";
import { Check, Copy, KeyRound, RefreshCw, Share2, X } from "lucide-react";

/** "Keep your spot": a private link that opens the night as you on any device, so clearing this browser can't lose you. */
export function KeepSpot({ name, nightName, saved, onCreate, onClose }: {
  name: string; nightName: string; saved: string; onCreate: () => Promise<string>; onClose: () => void;
}) {
  const [link, setLink] = useState(saved), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false), [error, setError] = useState(""), [confirmNew, setConfirmNew] = useState(false);
  async function make() {
    setBusy(true); setError(""); setConfirmNew(false);
    try { setLink(await onCreate()); setCopied(false); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setError("Couldn’t copy. Select the link and copy it yourself."); }
  }
  const canShare = typeof navigator.share === "function";
  return <div className="modal-backdrop" onClick={onClose}>
    <section className="keep-spot" role="dialog" aria-modal="true" aria-label="Keep your spot" onClick={(e) => e.stopPropagation()}>
      <button className="modal-close" aria-label="Close" onClick={onClose}><X size={20} /></button>
      <span className="eyebrow">You’re in {nightName} as {name}</span>
      <h2>Keep your spot</h2>
      <p>Right now “you” live in this browser only. Clearing it, a new phone or a private tab would make you a stranger to your own night.</p>
      <div className="spot-option best">
        <span className="spot-tag">Recommended · no account</span>
        <b><KeyRound size={16} />Your personal link</b>
        <p>Opens the night as you, on any device, with your reactions and routes. It’s different from the group’s invite link: keep it to yourself.</p>
        {link ? <>
          <code className="spot-link">{link}</code>
          <div className="spot-actions">
            <button className="primary" onClick={copy}>{copied ? <><Check size={15} />Copied</> : <><Copy size={15} />Copy</>}</button>
            {canShare && <button className="secondary" onClick={() => navigator.share({ title: "My MuseumHop link", text: "My personal MuseumHop link (keep it private)", url: link }).catch(() => {})}><Share2 size={15} />Save to Notes…</button>}
          </div>
          {confirmNew
            ? <div className="spot-confirm"><p>A new link turns this one off on every device that hasn’t used it yet. Devices already signed in stay signed in.</p><div className="spot-actions"><button className="secondary" disabled={busy} onClick={make}>Make a new link</button><button className="text-button" onClick={() => setConfirmNew(false)}>Keep this one</button></div></div>
            : <button className="text-button" onClick={() => setConfirmNew(true)}><RefreshCw size={13} />Link shared by mistake? Make a new one</button>}
        </> : <button className="primary" disabled={busy} onClick={make}><KeyRound size={15} />{busy ? "Making your link…" : "Get my personal link"}</button>}
      </div>
      {error && <p className="dialog-error" role="alert">{error}</p>}
      <p className="spot-note">The secret part of the link is stored only as a one-way hash. Lost it? Make a new one here from a device you’re still signed in on.</p>
    </section>
  </div>;
}
