/**
 * A one-line code that carries the data repository and token to another
 * device of the same person, so it is pasted into one field instead of two.
 * It is as secret as the token itself.
 */
const PREFIX = "FITNES1.";

export function makePairCode(repo: string, token: string): string {
  const json = JSON.stringify({ r: repo, t: token });
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return PREFIX + b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function readPairCode(code: string): { repo: string; token: string } | null {
  const c = code.trim();
  if (!c.startsWith(PREFIX)) return null;
  try {
    let b64 = c.slice(PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const bin = atob(b64);
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)))) as { r?: unknown; t?: unknown };
    return typeof data.r === "string" && typeof data.t === "string" && data.r && data.t ? { repo: data.r, token: data.t } : null;
  } catch {
    return null;
  }
}
