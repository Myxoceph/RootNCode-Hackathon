import {
  AnonymousSessionResponseSchema,
  ContributionSchema,
  MyContributionsResponseSchema,
  type AnonymousSessionResponse,
  type AppUser,
  type Contribution,
  type ContributionKind,
} from "@vagabonds/contracts";
import { useEffect, useSyncExternalStore } from "react";

import { readErrorCode } from "./api-source";
import { resolveApiUrl } from "./config";
import { DataError, type SchemaParser } from "./errors";
import { clearSession, readSession, writeSession } from "./session-storage";

const TIMEOUT_MS = 10_000;

/**
 * Topluluk Ziyaretçi Nabzı (module 6), the visitor's side: an anonymous session under a
 * nickname, sending notes, and the notes' moderation status. The token is stored on the
 * device (./session-storage.ts) and sent as `Authorization: Bearer`; no password, no account.
 * Always the API, also with the mock source: notes cannot be sent without a server.
 */
export interface CommunityState {
  /** `undefined` until the stored session has been read; `null` while the visitor has none. */
  user: AppUser | null | undefined;
  /** Bumped on every note sent, so "Notlarım" fetches again. */
  sent: number;
}

let state: CommunityState = { user: undefined, sent: 0 };
let token: string | null = null;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: CommunityState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function loadSession(): Promise<void> {
  loaded ??= (async () => {
    let session: AnonymousSessionResponse | null = null;
    try {
      const raw = await readSession();
      const parsed = raw ? AnonymousSessionResponseSchema.safeParse(JSON.parse(raw)) : null;
      session = parsed?.success ? parsed.data : null;
    } catch {
      // Unreadable storage: the visitor picks a nickname again.
    }
    token = session?.token ?? null;
    set({ ...state, user: session?.user ?? null });
  })();
  return loaded;
}

/** The API no longer knows the token (revoked, database reset): the next note asks for a nickname. */
async function forgetSession() {
  token = null;
  set({ ...state, user: null });
  try {
    await clearSession();
  } catch {
    // Read again on the next launch, and forgotten again on its first 401.
  }
}

async function call<T>(path: string, schema: SchemaParser<T>, init: { body?: unknown; token?: string } = {}): Promise<T> {
  const url = `${resolveApiUrl()}${path}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: init.body === undefined ? "GET" : "POST",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new DataError("unavailable", "Sunucuya ulaşılamıyor. İnternet bağlantını kontrol edip tekrar dene.", [url, String(error)]);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const code = await readErrorCode(response);
    if (response.status === 401) await forgetSession();
    throw errorFor(response.status, code, url);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DataError("unavailable", "Sunucuya ulaşılamıyor. Wi-Fi giriş sayfası açıksa önce oturum aç.", [url]);
  }
  const result = schema.safeParse(body);
  if (!result.success) throw DataError.fromSchema("Sunucudan gelen veri", result.error);
  return result.data;
}

function errorFor(status: number, code: string | null, url: string): DataError {
  const details = [`${status} ${code ?? ""} ${url}`.trim()];
  const rejected = (message: string) => new DataError("rejected", message, details);
  switch (code) {
    case "CONTRIBUTION_LIMIT":
      return rejected("Bir saatte en fazla 5 not gönderilebiliyor. Biraz sonra tekrar dene.");
    case "USER_BANNED":
      return rejected("Bu takma adla artık not gönderilemiyor.");
    case "UNAUTHORIZED":
      return rejected("Oturumun sona ermiş. Takma adını yeniden girip tekrar gönder.");
    case "ASSET_NOT_FOUND":
      return rejected("Bu eser artık yayında değil.");
    case "INVALID_BODY":
      return rejected("Not kabul edilmedi; metni ve takma adı kontrol et.");
  }
  if (status === 429) return rejected("Çok fazla istek gönderildi. Biraz bekleyip tekrar dene.");
  if (status >= 500) return new DataError("unavailable", "Sunucuda bir sorun oluştu. Biraz sonra tekrar dene.", details);
  return rejected("İstek tamamlanamadı.");
}

/**
 * Sends a note on `assetId`. A visitor without a session gets one first under `nickname`.
 * The note waits for a moderator; the pulse shows it once approved.
 */
export async function sendContribution(
  assetId: string,
  note: { kind: ContributionKind; body: string },
  nickname?: string,
): Promise<Contribution> {
  await loadSession();
  if (!token) {
    if (!nickname) throw new DataError("rejected", "Takma ad gerekli.");
    const session = await call("/auth/anonymous", AnonymousSessionResponseSchema, { body: { nickname } });
    token = session.token;
    try {
      await writeSession(JSON.stringify(session));
    } catch {
      // Not kept: this run still sends with it, the next launch asks for a nickname again.
    }
    set({ ...state, user: session.user });
  }
  const contribution = await call(`/assets/${encodeURIComponent(assetId)}/contributions`, ContributionSchema, {
    body: note,
    token,
  });
  set({ ...state, sent: state.sent + 1 });
  return contribution;
}

/** The visitor's own notes with their moderation status, newest first; `null` without a session. */
export async function fetchMyContributions(): Promise<Contribution[] | null> {
  await loadSession();
  if (!token) return null;
  return (await call("/me/contributions", MyContributionsResponseSchema, { token })).items;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCommunity(): CommunityState {
  useEffect(() => {
    void loadSession();
  }, []);
  return useSyncExternalStore(subscribe, () => state, () => state);
}
