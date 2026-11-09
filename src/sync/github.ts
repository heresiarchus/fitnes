/** Minimal GitHub contents API client for one JSON file in a private repository. */

export class SyncError extends Error {
  constructor(public code: "auth" | "forbidden" | "notfound" | "conflict" | "public" | "network" | "http", message: string) {
    super(message);
  }
}

export interface RemoteFile { text: string; sha: string }

const API = "https://api.github.com";

function headers(token: string): HeadersInit {
  return {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(API + url, { ...init, cache: "no-store", headers: { ...headers(token), ...(init.headers ?? {}) } });
  } catch (e) {
    throw new SyncError("network", (e as Error).message);
  }
  if (res.ok) return res;
  if (res.status === 401) throw new SyncError("auth", "token rejected");
  if (res.status === 403) throw new SyncError("forbidden", "no permission");
  if (res.status === 404) throw new SyncError("notfound", "not found");
  if (res.status === 409 || res.status === 422) throw new SyncError("conflict", "file changed");
  throw new SyncError("http", "HTTP " + res.status);
}

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function decodeBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const path = (repo: string, file: string) => `/repos/${repo}/contents/${file.split("/").map(encodeURIComponent).join("/")}`;

/** Checks the token can reach the repo and that the repo is private. */
export async function checkRepo(repo: string, token: string): Promise<void> {
  const res = await call(token, `/repos/${repo}`);
  const info = (await res.json()) as { private?: boolean; permissions?: { push?: boolean } };
  if (!info.private) throw new SyncError("public", "repository is public");
  if (info.permissions && info.permissions.push === false) throw new SyncError("forbidden", "no write access");
}

export async function getFile(repo: string, token: string, file: string): Promise<RemoteFile | null> {
  try {
    const res = await call(token, path(repo, file));
    const j = (await res.json()) as { sha: string; content?: string; encoding?: string };
    if (j.encoding === "base64" && j.content) return { sha: j.sha, text: decodeBase64(j.content) };
    // Files over 1 MB come without content; fetch the blob instead.
    const blob = await call(token, `/repos/${repo}/git/blobs/${j.sha}`);
    const b = (await blob.json()) as { content: string };
    return { sha: j.sha, text: decodeBase64(b.content) };
  } catch (e) {
    if (e instanceof SyncError && e.code === "notfound") {
      // Distinguish "file missing" from "repo missing / no access".
      await call(token, `/repos/${repo}`);
      return null;
    }
    throw e;
  }
}

export async function putFile(repo: string, token: string, file: string, text: string, sha: string | undefined, message: string): Promise<string> {
  const res = await call(token, path(repo, file), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, content: encodeBase64(text), ...(sha ? { sha } : {}) }),
  });
  const j = (await res.json()) as { content: { sha: string } };
  return j.content.sha;
}
