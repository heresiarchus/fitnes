import { type Session, type SupabaseClient, createClient } from "@supabase/supabase-js";
import { Browser } from "@capacitor/browser";
import { useEffect, useState } from "react";
import { isNative } from "../native";
import { cloudConfigured, SUPABASE_KEY, SUPABASE_URL } from "./config";

let client: SupabaseClient | null = null;

/** The account client, or null while no account server is configured. */
export function cloud(): SupabaseClient | null {
  if (!cloudConfigured()) return null;
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

/** Sends a one-time sign-in code to the email (the account is created on first use). */
export async function sendCode(email: string): Promise<string | null> {
  const c = cloud();
  if (!c) return "not configured";
  const { error } = await c.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
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
    const { error } = await c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
    return error ? error.message : null;
  }
  const { data, error } = await c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true } });
  if (error || !data?.url) return error?.message ?? "no url";
  await Browser.open({ url: data.url });
  return null;
}

/** Completes a Google sign-in that returned to the app as app.fitnes.journal://auth?code=… */
export async function finishNativeLogin(url: string) {
  const c = cloud();
  const code = new URL(url.replace(/^app\.fitnes\.journal:\/\//, "https://x/")).searchParams.get("code");
  if (!c || !code) return;
  await c.auth.exchangeCodeForSession(code);
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
