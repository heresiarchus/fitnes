import { type Session, type SupabaseClient, createClient } from "@supabase/supabase-js";
import { Browser } from "@capacitor/browser";
import { useEffect, useState } from "react";
import { isNative } from "../native";
import { cloudConfigured, SUPABASE_KEY, SUPABASE_URL } from "./config";

let client: SupabaseClient | null = null;
let linkFailed = false;
/** The sign-in link from the email didn't work (opened in another browser, expired or used twice). */
export const loginLinkFailed = () => linkFailed;

/** The account client, or null while no account server is configured. */
export function cloud(): SupabaseClient | null {
  if (!cloudConfigured()) return null;
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  if (!isNative) {
    // Back from the email link or Google: ?code=… is exchanged by the client; tidy the address after.
    const q = new URLSearchParams(location.search);
    if (q.has("code") || q.has("error_description")) {
      const c = client;
      void c.auth.getSession().then(({ data }) => {
        linkFailed = !data.session;
        history.replaceState(null, "", location.pathname + (linkFailed ? "#/settings/account" : location.hash));
        if (linkFailed) dispatchEvent(new HashChangeEvent("hashchange"));
      });
    }
  }
  return client;
}

const redirectTo = () => (isNative ? NATIVE_REDIRECT : location.origin + location.pathname);

/**
 * Sends the sign-in email (the account is created on first use). Supabase's standard letter
 * has a link — opening it on the same device signs in; a letter with a code works too.
 */
export async function sendCode(email: string): Promise<string | null> {
  const c = cloud();
  if (!c) return "not configured";
  const { error } = await c.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true, emailRedirectTo: redirectTo() } });
  return error ? error.message : null;
}

export async function verifyCode(email: string, code: string): Promise<string | null> {
  const c = cloud();
  if (!c) return "not configured";
  const { error } = await c.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
  return error ? error.message : null;
}

export const NATIVE_REDIRECT = "app.fitnes.journal://auth";

/**
 * Google sign-in. In a browser the page goes to Google and comes back; in the Android app
 * Google doesn't allow its login inside the app's view, so it opens in the phone's browser
 * and returns through the app's own link (handled by finishNativeLogin).
 */
export async function signInGoogle(): Promise<string | null> {
  const c = cloud();
  if (!c) return "not configured";
  if (!isNative) {
    const { error } = await c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
    return error ? error.message : null;
  }
  const { data, error } = await c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true } });
  if (error || !data?.url) return error?.message ?? "no url";
  await Browser.open({ url: data.url });
  return null;
}

/** Completes a sign-in (email link or Google) that returned to the app as app.fitnes.journal://auth?code=… */
export async function finishNativeLogin(url: string) {
  const c = cloud();
  const code = new URL(url.replace(/^app\.fitnes\.journal:\/\//, "https://x/")).searchParams.get("code");
  if (!c) return;
  const { error } = code ? await c.auth.exchangeCodeForSession(code) : { error: true };
  linkFailed = !!error;
  await Browser.close().catch(() => {});
}

export async function signOut() {
  await cloud()?.auth.signOut();
}

/** The current session; undefined while loading, null when signed out or not configured. */
export function useSession(): Session | null | undefined {
  const [s, setS] = useState<Session | null | undefined>(cloudConfigured() ? undefined : null);
  useEffect(() => {
    const c = cloud();
    if (!c) return;
    void c.auth.getSession().then(({ data }) => setS(data.session));
    const { data } = c.auth.onAuthStateChange((_e, session) => setS(session));
    return () => data.subscription.unsubscribe();
  }, []);
  return s;
}
