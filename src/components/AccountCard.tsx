import { useState } from "react";
import { loginLinkFailed, sendCode, signInGoogle, signOut, useSession, verifyCode } from "../cloud/client";
import { cloudConfigured, GOOGLE_LOGIN } from "../cloud/config";
import { cloudSync, useCloudStatus } from "../cloud/sync";
import { useI18n } from "../i18n";

const time = (iso: string | undefined, lang: string) =>
  iso ? new Date(iso).toLocaleString(lang === "uk" ? "uk-UA" : "en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

/** Sign-in with an emailed code or Google; once signed in, everything follows the account. */
export function AccountCard() {
  const { t, lang } = useI18n();
  const session = useSession();
  const status = useCloudStatus();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind?: "ok" | "err" }>({ text: "" });

  if (!cloudConfigured()) return <section className="block"><p className="help-text" style={{ margin: 0 }}>{t("acc.notReady")}</p></section>;
  if (session === undefined) return <section className="block"><p className="status">…</p></section>;

  if (session) {
    return (
      <section className="block">
        <div className="acc-who"><span className="acc-ava">{(session.user.email ?? "?").slice(0, 1).toUpperCase()}</span>
          <div><b>{session.user.email}</b><small className={status.state === "error" ? "status err" : "status"}>
            {status.state === "syncing" ? t("sync.state.syncing") : status.state === "error" ? t("acc.error", { e: status.error ?? "" }) : status.lastAt ? t("sync.state.idle", { t: time(status.lastAt, lang) }) : t("sync.state.never")}
          </small></div>
        </div>
        <p className="status" style={{ margin: 0 }}>{t("acc.what")}</p>
        <div className="actions">
          <button type="button" onClick={() => void cloudSync()}>{t("sync.now")}</button>
          <button type="button" className="danger" onClick={() => void signOut()}>{t("acc.signOut")}</button>
        </div>
      </section>
    );
  }

  async function send() {
    setBusy(true); setMsg({ text: "" });
    const err = await sendCode(email);
    setBusy(false);
    if (err) setMsg({ text: t("acc.sendError", { e: err }), kind: "err" }); else { setSent(true); setMsg({ text: t("acc.sent", { email }), kind: "ok" }); }
  }
  async function verify() {
    setBusy(true);
    const err = await verifyCode(email, code);
    setBusy(false);
    if (err) setMsg({ text: t("acc.codeError"), kind: "err" });
  }

  return (
    <section className="block">
      <p className="status" style={{ margin: 0 }}>{t("acc.why")}</p>
      {loginLinkFailed() && !sent && <span className="status err" role="alert">{t("acc.linkFailed")}</span>}
      {GOOGLE_LOGIN && (
        <>
          <button type="button" className="google" onClick={() => void signInGoogle().then((e) => e && setMsg({ text: e, kind: "err" }))}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" /></svg>
            {t("acc.google")}
          </button>
          <span className="or">{t("acc.or")}</span>
        </>
      )}
      <label className="field"><span>{t("acc.email")}</span>
        <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => { setEmail(e.target.value); setSent(false); }} />
      </label>
      {sent && (
        <label className="field"><span>{t("acc.codeIfAny")}</span>
          <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        </label>
      )}
      <div className="actions">
        {!sent
          ? <button type="button" className="primary" disabled={busy || !/^\S+@\S+\.\S+$/.test(email)} onClick={() => void send()}>{t("acc.sendCode")}</button>
          : <>
              <button type="button" className="primary" disabled={busy || code.length < 6} onClick={() => void verify()}>{t("acc.signIn")}</button>
              <button type="button" disabled={busy} onClick={() => void send()}>{t("acc.resend")}</button>
            </>}
      </div>
      {msg.text && <span className={"status " + (msg.kind ?? "")} role="status">{msg.text}</span>}
    </section>
  );
}
