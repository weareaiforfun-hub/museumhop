import { useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { Check, ChevronRight, Copy, KeyRound, Mail, MonitorSmartphone, Pencil, RefreshCw, Share2, X } from "lucide-react";

/** "Keep your spot": a private link that opens the night as you on any device, so clearing this browser can't lose you. */
export function KeepSpot({ name, nightName, saved, onCreate, onClose, emailReady, onEmail, onSaved }: {
  name: string; nightName: string; saved: string; onCreate: () => Promise<string>; onClose: () => void;
  emailReady: boolean; onEmail: (address: string) => Promise<string>; onSaved: () => void;
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
    try { await navigator.clipboard.writeText(link); setCopied(true); onSaved(); } catch { setError("Couldn’t copy. Select the link and copy it yourself."); }
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
            {canShare && <button className="secondary" onClick={() => navigator.share({ title: "My MuseumHop link", text: "My personal MuseumHop link (keep it private)", url: link }).then(onSaved).catch(() => {})}><Share2 size={15} />Save to Notes…</button>}
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

/** Someone opens an invite link on a device that doesn't know them: new here, or already in this night? */
export function TwoDoors({ onNew, onBack, onLook }: { onNew: () => void; onBack: () => void; onLook: () => void }) {
  return <div className="modal-backdrop" onClick={onLook}>
    <section className="keep-spot" role="dialog" aria-modal="true" aria-label="Have you been in this night before?" onClick={(e) => e.stopPropagation()}>
      <button className="modal-close" aria-label="Close" onClick={onLook}><X size={20} /></button>
      <span className="eyebrow">Museumnacht 2026</span>
      <h2>Have you been in this night before?</h2>
      <p>Your friends are planning here. Tell us which one fits.</p>
      <div className="spot-option best">
        <b>I’m new here</b>
        <p>Add your name and join your friends.</p>
        <button className="primary" onClick={onNew}>Join this night</button>
      </div>
      <div className="spot-option best">
        <b>I’m already in this night</b>
        <p>You planned on another phone or laptop. Get back in as yourself, with your route and reactions.</p>
        <button className="secondary" onClick={onBack}>Get back in</button>
      </div>
      <button className="text-button door-look" onClick={onLook}>Just looking? Browse everything without joining</button>
    </section>
  </div>;
}

/** Back in as yourself on a new device: by email if one was saved, otherwise from the device you planned on. */
export function RecoverByEmail({ emailReady, onSend, onClose }: { emailReady: boolean; onSend: (address: string) => Promise<void>; onClose: () => void }) {
  const [address, setAddress] = useState(""), [done, setDone] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { await onSend(address); setDone(true); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onClick={onClose}>
    <section className="keep-spot" role="dialog" aria-modal="true" aria-label="Get back in as yourself" onClick={(e) => e.stopPropagation()}>
      <button className="modal-close" aria-label="Close" onClick={onClose}><X size={20} /></button>
      <span className="eyebrow">Already planning on another device?</span>
      <h2>Get back in as yourself</h2>
      {emailReady && <div className="spot-option">
        <b>I saved an email</b>
        {done ? <p role="status">If that address is saved with MuseumHop, a new personal link is on its way. It can take a minute; check your spam too. Your previous link stops working.</p> : <>
          <p>We send a new link that opens your night as you.</p>
          <form className="spot-email" onSubmit={send}>
            <input type="email" required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="you@example.com" aria-label="Your email address" autoComplete="email" />
            <button className="primary" disabled={busy || !address}>{busy ? "Sending…" : "Send"}</button>
          </form>
          {error && <p className="dialog-error" role="alert">{error}</p>}
        </>}
      </div>}
      <div className="spot-guide">
        <b>I didn’t save anything</b>
        <p>Do this once, on the device you planned on:</p>
        <ol>
          <li>Open MuseumHop in that browser and go to your night.</li>
          <li>Tap your name or initials at the top, then <b>Open on another device</b>.</li>
          <li>Scan the code with this device. Or tap <b>Email it to me</b> and open the email here.</li>
        </ol>
        <p className="spot-guide-warn"><b>Don’t join the night again here.</b> That adds a second you, without your reactions or your route.</p>
      </div>
    </section>
  </div>;
}

function QrCode({ text }: { text: string }) {
  const svg = useMemo(() => { const q = qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); }, [text]);
  return <div className="spot-qr" role="img" aria-label="QR code with your personal link" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Your personal link as a code to scan, so moving to another device takes no typing. */
export function OtherDevice({ name, saved, onCreate, emailReady, onEmail, onSaved, onClose }: {
  name: string; saved: string; onCreate: () => Promise<string>; emailReady: boolean;
  onEmail: (address: string) => Promise<string>; onSaved: () => void; onClose: () => void;
}) {
  const [link, setLink] = useState(saved), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false), [error, setError] = useState("");
  const [emailing, setEmailing] = useState(false), [address, setAddress] = useState(""), [sentTo, setSentTo] = useState("");
  async function make() {
    setBusy(true); setError("");
    try { setLink(await onCreate()); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); onSaved(); } catch { setError("Couldn’t copy. Try the email option instead."); }
  }
  async function email(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { const made = await onEmail(address); if (made) setLink(made); setSentTo(address); setEmailing(false); setAddress(""); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onClick={onClose}>
    <section className="keep-spot" role="dialog" aria-modal="true" aria-label="Open on another device" onClick={(e) => e.stopPropagation()}>
      <button className="modal-close" aria-label="Close" onClick={onClose}><X size={20} /></button>
      <span className="eyebrow">You’re in as {name}</span>
      <h2>Open on another device</h2>
      {link ? <>
        <div className="spot-scan">
          <QrCode text={link} />
          <p>Scan this with your other phone’s camera. Your night opens there as you, and this device stays signed in.</p>
        </div>
        <div className="spot-actions">
          <button className="primary" onClick={copy}>{copied ? <><Check size={15} />Copied</> : <><Copy size={15} />Copy my link</>}</button>
          {emailReady && <button className="secondary" onClick={() => setEmailing(true)}><Mail size={15} />Email it to me</button>}
        </div>
        <p className="spot-note">Moving to a laptop? Email it to yourself, or copy the link and send it to yourself.</p>
      </> : <>
        <p>Your personal link opens this night as you on any device. Make it here, then scan the code or email it to yourself.</p>
        <button className="primary" disabled={busy} onClick={make}><KeyRound size={15} />{busy ? "Making your link…" : "Show my code"}</button>
        <p className="spot-note">If you already have a personal link somewhere else, it stops working when you make a new one.</p>
      </>}
      {emailing && <form className="spot-email" onSubmit={email}>
        <input type="email" required autoFocus value={address} onChange={(e) => setAddress(e.target.value)} placeholder="you@example.com" aria-label="Your email address" autoComplete="email" />
        <button className="primary" disabled={busy || !address}>{busy ? "Sending…" : "Send"}</button>
      </form>}
      {sentTo && <p className="spot-sent" role="status"><Check size={14} />Sent to {sentTo}. Check your inbox (and spam).</p>}
      {error && <p className="dialog-error" role="alert">{error}</p>}
      {link && <p className="spot-guide-warn"><b>Keep this to yourself.</b> This code opens the night as you. For friends, use Invite friends.</p>}
    </section>
  </div>;
}

/** Offered once, right after someone starts planning: there's something worth keeping now. */
export function BackupNudge({ onEmail, onClose }: { onEmail: (address: string) => Promise<string>; onClose: () => void }) {
  const [address, setAddress] = useState(""), [busy, setBusy] = useState(false), [sentTo, setSentTo] = useState(""), [error, setError] = useState("");
  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { await onEmail(address); setSentTo(address); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <aside className="backup-nudge" role="dialog" aria-label="Save your night">
    <button className="modal-close" aria-label="Close" onClick={onClose}><X size={18} /></button>
    {sentTo ? <p className="spot-sent" role="status"><Check size={14} />Sent to {sentTo}. Keep that email: it opens your night on any device.</p> : <>
      <span className="spot-tag">Nice start</span>
      <h2>Want this on your other devices too?</h2>
      <p>Add your email and we’ll send you a link that opens your night anywhere. No password, no account.</p>
      <form className="spot-email" onSubmit={send}>
        <input type="email" required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="you@example.com" aria-label="Your email address" autoComplete="email" />
        <button className="primary" disabled={busy || !address}>{busy ? "Sending…" : "Send"}</button>
      </form>
      {error && <p className="dialog-error" role="alert">{error}</p>}
      <button className="text-button door-look" onClick={onClose}>Not now</button>
      <p className="spot-note">We keep only a fingerprint of your address. Your group never sees it.</p>
    </>}
  </aside>;
}

/** What tapping your name opens: whether your spot is safe, and everything about you in one place. */
export function YourSpot({ name, backedUp, onOtherDevice, onLink, onName, onClose }: {
  name: string; backedUp: boolean; onOtherDevice: () => void; onLink: () => void; onName: () => void; onClose: () => void;
}) {
  return <div className="modal-backdrop" onClick={onClose}>
    <section className="keep-spot" role="dialog" aria-modal="true" aria-label="Your spot" onClick={(e) => e.stopPropagation()}>
      <button className="modal-close" aria-label="Close" onClick={onClose}><X size={20} /></button>
      <span className="eyebrow">You’re in as {name}</span>
      <h2>Your spot</h2>
      <div className={"spot-option " + (backedUp ? "best" : "spot-risk")}>
        {backedUp ? <><b><Check size={16} />Backed up</b><p>Your link is saved outside this browser, so you can open this night on any device.</p></>
          : <><b>Only on this device so far</b><p>Save your link, or you could lose your spot on a new phone or after clearing this browser.</p></>}
      </div>
      <button className="spot-row" onClick={onOtherDevice}><MonitorSmartphone size={16} /><span>Open on another device</span><ChevronRight size={15} /></button>
      <button className="spot-row" onClick={onLink}><KeyRound size={16} /><span>Your personal link</span><ChevronRight size={15} /></button>
      <button className="spot-row" onClick={onName}><Pencil size={16} /><span>Change my name or colour</span><ChevronRight size={15} /></button>
    </section>
  </div>;
}
