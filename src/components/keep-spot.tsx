import { useState } from "react";
import { Check, Copy, KeyRound, Mail, RefreshCw, Share2, X } from "lucide-react";

/** "Keep your spot": a private link that opens the night as you on any device, so clearing this browser can't lose you. */
export function KeepSpot({ name, nightName, saved, onCreate, onClose, emailReady, onEmail }: {
  name: string; nightName: string; saved: string; onCreate: () => Promise<string>; onClose: () => void;
  emailReady: boolean; onEmail: (address: string) => Promise<string>;
}) {
  const [link, setLink] = useState(saved), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false), [error, setError] = useState(""), [confirmNew, setConfirmNew] = useState(false);
  const [address, setAddress] = useState(""), [sentTo, setSentTo] = useState(""), [sending, setSending] = useState(false);
  async function email(e: React.FormEvent) {
    e.preventDefault();
    setSending(true); setError("");
    try { const made = await onEmail(address); if (made) setLink(made); setSentTo(address); setAddress(""); }
    catch (err) { setError((err as Error).message); } finally { setSending(false); }
  }
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
      {emailReady && <div className="spot-option">
        <b><Mail size={16} />Email me my link <span className="spot-optional">(optional)</span></b>
        <p>We send your personal link to your inbox, so it’s there when you need it. Lose it later? Ask for a new one with the same address. MuseumHop keeps only a fingerprint of your address to recognise it, never the address itself, and your group never sees it. Resend, the service that sends the email, keeps a delivery log.</p>
        {sentTo ? <p className="spot-sent" role="status"><Check size={14} />Sent to {sentTo}. Check your inbox (and spam).</p>
          : <form className="spot-email" onSubmit={email}>
            <input type="email" required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="you@example.com" aria-label="Your email address" autoComplete="email" />
            <button className="primary" disabled={sending || !address}>{sending ? "Sending…" : "Send"}</button>
          </form>}
      </div>}
      {error && <p className="dialog-error" role="alert">{error}</p>}
      <p className="spot-note">The secret part of the link is stored only as a one-way hash. Lost it? Make a new one here from a device you’re still signed in on.</p>
    </section>
  </div>;
}

/** Lost your personal link? A new one goes to the address you saved it with (and the old one stops working). */
export function RecoverByEmail({ onSend, onClose }: { onSend: (address: string) => Promise<void>; onClose: () => void }) {
  const [address, setAddress] = useState(""), [done, setDone] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { await onSend(address); setDone(true); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onClick={onClose}>
    <section className="keep-spot" role="dialog" aria-modal="true" aria-label="Get your link by email" onClick={(e) => e.stopPropagation()}>
      <button className="modal-close" aria-label="Close" onClick={onClose}><X size={20} /></button>
      <span className="eyebrow">Already planning on another device?</span>
      <h2>Get your link by email</h2>
      {done ? <p role="status">If that address is saved with MuseumHop, a new personal link is on its way. It can take a minute; check your spam too. Your previous link stops working.</p> : <>
        <p>Enter the address you saved your personal link with. We send a new link that opens your night as you.</p>
        <form className="spot-email" onSubmit={send}>
          <input type="email" required autoFocus value={address} onChange={(e) => setAddress(e.target.value)} placeholder="you@example.com" aria-label="Your email address" autoComplete="email" />
          <button className="primary" disabled={busy || !address}>{busy ? "Sending…" : "Send"}</button>
        </form>
        {error && <p className="dialog-error" role="alert">{error}</p>}
      </>}
      <div className="spot-guide">
        <b>Never added an email?</b>
        <p>Then you don’t have one saved yet. Do this once, on the device you planned on:</p>
        <ol>
          <li>Open MuseumHop in that browser and go to your night.</li>
          <li>Tap your name or initials at the top, then <b>Your personal link</b>. If you see <b>Keep your spot</b>, tap that instead.</li>
          <li>Under <b>Email me my link</b>, enter your email and tap <b>Send</b>.</li>
          <li>Open the email here, on this device, and tap the button. You’re in as yourself.</li>
        </ol>
        <p>Rather not use email? Copy your personal link there and send it to yourself.</p>
        <p className="spot-guide-warn"><b>Don’t join the night again here.</b> That adds a second you, without your reactions or your route.</p>
      </div>
    </section>
  </div>;
}
