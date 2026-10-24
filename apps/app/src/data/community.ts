import AsyncStorage from "@react-native-async-storage/async-storage";
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

import { resolveApiUrl, resolveDataSourceKind } from "./config";
import { DataError, type SchemaParser } from "./errors";
import { request, statusError } from "./http";
import { clearSession, readSession, writeSession } from "./session-storage";

/** Asset id → name of the assets the visitor left notes on, for "Notlarım". */
const ASSET_NAMES_KEY = "vagabonds-note-assets";

/**
 * Notes go to the API only. With the mock source (`EXPO_PUBLIC_DATA_SOURCE=mock`) there is no
 * server to send them to: the form says so and "Notlarım" stays empty.
 */
export const communityAvailable = resolveDataSourceKind() === "api";

/**
 * Topluluk Ziyaretçi Nabzı (module 6), the visitor's side: an anonymous session under a
 * nickname, sending notes, and the notes' moderation status. The token is stored on the
 * device (./session-storage.ts) and sent as `Authorization: Bearer`; no password, no account.
 */
export interface CommunityState {
  /** `undefined` until the stored session has been read; `null` while the visitor has none. */
  user: AppUser | null | undefined;
  /** Bumped on every note sent, so "Notlarım" fetches again. */
  sent: number;
  /**
   * Names of the assets the visitor's notes are on, kept when sending: a session lives on one
   * device, so every note of it was sent from here, and the list needs no asset requests.
   */
  assetNames: Readonly<Record<string, string>>;
}

let state: CommunityState = { user: undefined, sent: 0, assetNames: {} };
let token: string | null = null;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<CommunityState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function loadSession(): Promise<void> {
  loaded ??= (async () => {
    let session: AnonymousSessionResponse | null = null;
    let assetNames: Record<string, string> = {};
    try {
      const raw = await readSession();
      const parsed = raw ? AnonymousSessionResponseSchema.safeParse(JSON.parse(raw)) : null;
      session = parsed?.success ? parsed.data : null;
    } catch {
      // Unreadable storage: the visitor picks a nickname again.
    }
    try {
      const raw = await AsyncStorage.getItem(ASSET_NAMES_KEY);
      if (raw) assetNames = JSON.parse(raw) as Record<string, string>;
    } catch {
      // The list shows "Eser" instead of the names.
    }
    token = session?.token ?? null;
    set({ user: session?.user ?? null, assetNames });
  })();
  return loaded;
}

/** The API no longer knows `rejected` (revoked, database reset): the next note asks for a nickname. */
async function forgetSession(rejected: string) {
  // A 401 that arrives after a new session was opened is about the old token: keep the new one.
  if (token !== rejected) return;
  token = null;
  set({ user: null });
  try {
    await clearSession();
  } catch {
    // Read again on the next launch, and forgotten again on its first 401.
  }
}

async function rememberAssetName(id: string, name: string) {
  if (state.assetNames[id] === name) return;
  const assetNames = { ...state.assetNames, [id]: name };
  set({ assetNames });
  try {
    await AsyncStorage.setItem(ASSET_NAMES_KEY, JSON.stringify(assetNames));
  } catch {
    // Shown for this run only.
  }
}

/** A request whose answer is never "not found"; a 401 forgets the session it was sent with. */
async function call<T>(path: string, schema: SchemaParser<T>, init: { body?: unknown; token?: string } = {}): Promise<T> {
  const result = await request(`${resolveApiUrl()}${path}`, schema, {
    ...init,
    errorFor: (status, code, details) => {
      if (status === 401 && init.token) void forgetSession(init.token);
      return errorFor(status, code, details);
    },
  });
  return result!;
}

function errorFor(status: number, code: string | null, details: string[]): DataError {
  const rejected = (message: string) => new DataError("rejected", message, details);
  switch (code) {
    case "CONTRIBUTION_LIMIT":
      return rejected("Saatlik not sınırına ulaştın. Biraz sonra tekrar dene.");
    case "USER_BANNED":
      return rejected("Bu takma adla artık not gönderilemiyor.");
    case "UNAUTHORIZED":
      return rejected("Oturumun sona ermiş. Takma adını yeniden girip tekrar gönder.");
    case "ASSET_NOT_FOUND":
      return rejected("Bu eser artık yayında değil.");
    case "INVALID_BODY":
      return rejected("Not kabul edilmedi; metni ve takma adı kontrol et.");
  }
  return statusError(status, code, details);
}

/**
 * Sends a note on `asset`. A visitor without a session gets one first under `nickname`.
 * The note waits for a moderator; the pulse shows it once approved.
 */
export async function sendContribution(
  asset: { id: string; name: string },
  note: { kind: ContributionKind; body: string },
  nickname?: string,
): Promise<Contribution> {
  if (!communityAvailable) throw new DataError("unavailable", "Not göndermek için sunucu gerekiyor.");
  await loadSession();
  let opened: AppUser | null = null;
  if (!token) {
    if (!nickname) throw new DataError("rejected", "Takma ad gerekli.");
    const session = await call("/auth/anonymous", AnonymousSessionResponseSchema, { body: { nickname } });
    token = session.token;
    opened = session.user;
    try {
      await writeSession(JSON.stringify(session));
    } catch {
      // Not kept: this run still sends with it, the next launch asks for a nickname again.
    }
  }

  let contribution: Contribution;
  try {
    contribution = await call(`/assets/${encodeURIComponent(asset.id)}/contributions`, ContributionSchema, {
      body: note,
      token,
    });
  } catch (error) {
    if (opened) set({ user: opened });
    throw error;
  }
  void rememberAssetName(asset.id, asset.name);
  // One update for the new session and the new note, so "Notlarım" fetches once.
  set(opened ? { user: opened, sent: state.sent + 1 } : { sent: state.sent + 1 });
  return contribution;
}

/** The visitor's own notes with their moderation status, newest first; `null` without a session. */
export async function fetchMyContributions(): Promise<Contribution[] | null> {
  if (!communityAvailable) return null;
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
