import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AchievementsResponseSchema,
  AnonymousSessionResponseSchema,
  AppUserSchema,
  ContributionSchema,
  MyAchievementsResponseSchema,
  MyContributionsResponseSchema,
  MyVisitsResponseSchema,
  SavedRouteSchema,
  SavedRoutesResponseSchema,
  VisitResponseSchema,
  type AnonymousSessionResponse,
  type AppUser,
  type LoginRequest,
  type RegisterRequest,
  type Contribution,
  type MyAchievementsResponse,
  type MyVisit,
  type SavedRoute,
  type TextContributionKind,
  type UpdateProfileRequest,
  type VisitProofRequest,
  type VisitResponse,
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
 * device (./session-storage.ts) and sent as `Authorization: Bearer`. A visitor can also open an
 * account with a username and password (`register`, `login`, `logout`); the session is kept the same way.
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

/** Keeps a signed-in session: the token for requests, the user for the screens. */
async function keepSession(session: AnonymousSessionResponse) {
  token = session.token;
  set({ user: session.user });
  try {
    await writeSession(JSON.stringify(session));
  } catch {
    // Not kept: signed in for this run only, the next launch starts signed out.
  }
}

/** Sign-in and sign-up say what went wrong in their own words, not a note's. */
const AUTH_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "Kullanıcı adı ya da parola yanlış.",
  USERNAME_TAKEN: "Bu kullanıcı adı alınmış. Başka bir tane dene.",
  EMAIL_TAKEN: "Bu e-postayla açılmış bir hesap var. Giriş yapmayı dene.",
  ALREADY_REGISTERED: "Bu oturumun zaten bir hesabı var.",
  USER_BANNED: "Bu hesapla artık giriş yapılamıyor.",
  INVALID_BODY: "Kullanıcı adı, e-posta ya da parola kurallara uymuyor.",
};

/**
 * Opens an account (`POST /auth/register`). A visitor who already left notes or seals under a
 * nickname keeps them: their anonymous session becomes the account (`POST /auth/upgrade`).
 */
export async function register(account: RegisterRequest): Promise<AppUser> {
  if (!communityAvailable) throw new DataError("unavailable", "Hesap açmak için sunucu gerekiyor.");
  await loadSession();
  if (token && state.user && state.user.username === null) {
    const current = token;
    const user = await call("/auth/upgrade", AppUserSchema, {
      body: { username: account.username, password: account.password, email: account.email },
      token: current,
      messages: AUTH_MESSAGES,
    });
    await keepSession({ user, token: current });
    return user;
  }
  const session = await call("/auth/register", AnonymousSessionResponseSchema, { body: account, messages: AUTH_MESSAGES });
  await keepSession(session);
  return session.user;
}

/** Signs in (`POST /auth/login`); a session already on the device gives way to the account's. */
export async function login(credentials: LoginRequest): Promise<AppUser> {
  if (!communityAvailable) throw new DataError("unavailable", "Giriş yapmak için sunucu gerekiyor.");
  await loadSession();
  const session = await call("/auth/login", AnonymousSessionResponseSchema, { body: credentials, messages: AUTH_MESSAGES });
  await keepSession(session);
  return session.user;
}

/**
 * The token to ask Rehber with: only accounts ask, so null without a session or with an
 * anonymous one (no username).
 */
export async function accountToken(): Promise<string | null> {
  if (!communityAvailable) return null;
  await loadSession();
  return token !== null && state.user?.username ? token : null;
}

/** The API answered 401 to `rejected`: the session is gone there, so it is forgotten here too. */
export function sessionRejected(rejected: string) {
  void forgetSession(rejected);
}

/** Signs out on this device (`POST /auth/logout`); signed out here even when the API cannot be reached. */
export async function logout(): Promise<void> {
  await loadSession();
  const current = token;
  if (current) {
    try {
      // Only reaching it matters.
      await request(`${resolveApiUrl()}/auth/logout`, AppUserSchema, { body: {}, token: current });
    } catch {
      // The token stays valid on the server until it expires; it is gone from here.
    }
  }
  await forgetSession(current ?? "");
}

/** The API no longer knows `rejected` (revoked, database reset): the next note asks for a nickname. */
async function forgetSession(rejected: string) {
  // A 401 that arrives after a new session was opened is about the old token: keep the new one.
  if ((token ?? "") !== rejected) return;
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
async function call<T>(
  path: string,
  schema: SchemaParser<T>,
  init: { body?: unknown; token?: string; method?: "POST" | "PATCH" | "DELETE"; messages?: Record<string, string> } = {},
): Promise<T> {
  const { messages, ...options } = init;
  const result = await request(`${resolveApiUrl()}${path}`, schema, {
    ...options,
    errorFor: (status, code, details) => {
      if (status === 401 && init.token) void forgetSession(init.token);
      const message = code ? messages?.[code] : undefined;
      return message ? new DataError("rejected", message, details) : errorFor(status, code, details);
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
    case "TOO_FAR":
      return rejected("Esere yeterince yakın değilsin. Mühür için eserin 200 m yakınında olmalısın.");
    case "POSITION_REQUIRED":
      return rejected("Mühür için konumun gerekiyor. Konum iznini açıp tekrar dene.");
    case "UNKNOWN_MEDIA":
      return rejected("Tanınan fotoğraf bu esere ait değil.");
    case "VISIT_LIMIT":
      return rejected("Bugünkü ziyaret sınırına ulaştın. Yarın tekrar dene.");
  }
  return statusError(status, code, details);
}

/**
 * Sends a note on `asset`. A visitor without a session gets one first under `nickname`.
 * The note waits for a moderator; the pulse shows it once approved.
 */
/**
 * The stored session's token, or a new anonymous session under `nickname`. `opened` is the new
 * session's user, for the caller to publish once its own request went through.
 */
async function sessionToken(nickname?: string): Promise<{ token: string; opened: AppUser | null }> {
  await loadSession();
  if (token) return { token, opened: null };
  if (!nickname) throw new DataError("rejected", "Takma ad gerekli.");
  const session = await call("/auth/anonymous", AnonymousSessionResponseSchema, { body: { nickname } });
  token = session.token;
  try {
    await writeSession(JSON.stringify(session));
  } catch {
    // Not kept: this run still sends with it, the next launch asks for a nickname again.
  }
  return { token: session.token, opened: session.user };
}

export async function sendContribution(
  asset: { id: string; name: string },
  note: { kind: TextContributionKind; body: string },
  nickname?: string,
): Promise<Contribution> {
  if (!communityAvailable) throw new DataError("unavailable", "Not göndermek için sunucu gerekiyor.");
  const { token: sendWith, opened } = await sessionToken(nickname);

  let contribution: Contribution;
  try {
    contribution = await call(`/assets/${encodeURIComponent(asset.id)}/contributions`, ContributionSchema, {
      body: note,
      token: sendWith,
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

/**
 * Ziyaret Mührü: the camera recognised the asset's seal photo on site, so the visit is proven
 * (`POST /assets/:id/visit/proof`). A visitor without a session gets one first under `nickname`.
 */
export async function sendVisitProof(assetId: string, proof: Omit<VisitProofRequest, "method">, nickname?: string): Promise<VisitResponse> {
  if (!communityAvailable) throw new DataError("unavailable", "Mühür için sunucu gerekiyor.");
  const { token: sendWith, opened } = await sessionToken(nickname);
  try {
    return await call(`/assets/${encodeURIComponent(assetId)}/visit/proof`, VisitResponseSchema, {
      body: { ...proof, method: "device_recognition" },
      token: sendWith,
    });
  } finally {
    if (opened) set({ user: opened });
  }
}

/** The account's details changed (name, photo): kept with the session it belongs to. */
export async function keepUser(user: AppUser, sentWith: string) {
  if (token !== sentWith) return;
  await keepSession({ user, token: sentWith });
}

/** The account's token, or a "sign in to …" error naming `action`. */
export async function signedInToken(action: string): Promise<string> {
  const current = await accountToken();
  if (current === null) throw new DataError("rejected", `${action} için giriş yap.`, ["/me"], "ACCOUNT_REQUIRED");
  return current;
}

/**
 * The account as the API has it now (`GET /me`), kept for the screens. Its photo's path is
 * signed for a day, so the profile asks again when it opens. Null without an account.
 */
export async function refreshMe(): Promise<AppUser | null> {
  const current = await accountToken();
  if (current === null) return null;
  const user = await call("/me", AppUserSchema, { token: current });
  await keepUser(user, current);
  return user;
}

const PROFILE_MESSAGES: Record<string, string> = {
  INVALID_BODY: "Ad soyad 2–64 harf olmalı; yalnızca harf, boşluk, ' . - kullanılabilir.",
};

/** Changes the nickname or the full name (`PATCH /me`); `fullName: null` removes the name. */
export async function updateProfile(profile: UpdateProfileRequest): Promise<AppUser> {
  const current = await signedInToken("Profili düzenlemek");
  const user = await call("/me", AppUserSchema, { body: profile, method: "PATCH", token: current, messages: PROFILE_MESSAGES });
  await keepUser(user, current);
  return user;
}

/** Removes the profile photo (`DELETE /me/avatar`). */
export async function removeAvatar(): Promise<AppUser> {
  const current = await signedInToken("Profil fotoğrafını kaldırmak");
  const user = await call("/me/avatar", AppUserSchema, { method: "DELETE", token: current });
  await keepUser(user, current);
  return user;
}

/** Where an image shows the account's profile photo; null without one. */
export function avatarUri(user: AppUser | null | undefined): string | null {
  return user?.photoUrl ? `${resolveApiUrl()}${user.photoUrl}` : null;
}

/** The visitor's own notes with their moderation status, newest first; `null` without a session. */
export async function fetchMyContributions(): Promise<Contribution[] | null> {
  if (!communityAvailable) return null;
  await loadSession();
  if (!token) return null;
  return (await call("/me/contributions", MyContributionsResponseSchema, { token })).items;
}

/**
 * Profil · Rozetlerim: with a session, the visitor's progress and earned badges
 * (`GET /me/achievements`); without one, every badge still to earn (`GET /achievements`).
 */
export async function fetchMyAchievements(): Promise<MyAchievementsResponse | null> {
  if (!communityAvailable) return null;
  await loadSession();
  if (token) return call("/me/achievements", MyAchievementsResponseSchema, { token });
  const all = await call("/achievements", AchievementsResponseSchema);
  return { version: all.version, lang: all.lang, totalPoints: 0, visits: 0, items: all.items.map((item) => ({ ...item, earnedAt: null, progress: { current: 0, target: 1 } })) };
}

/** The session's user id once the stored session is read; null without a session. */
export async function currentUserId(): Promise<string | null> {
  await loadSession();
  return token ? (state.user?.id ?? null) : null;
}

/**
 * The assets the visitor has visited (`GET /me/visits`): the map's unlocked assets. Null without a
 * session, so another account or a signed-out visitor on the same phone never sees them.
 */
export async function fetchMyVisits(): Promise<MyVisit[] | null> {
  if (!communityAvailable) return null;
  await loadSession();
  if (!token) return null;
  return (await call("/me/visits", MyVisitsResponseSchema, { token })).items;
}

/** Profil · Rotalarım (`GET /me/routes`), from the account; null without a session. */
export async function fetchMyRoutes(): Promise<SavedRoute[] | null> {
  if (!communityAvailable) return null;
  await loadSession();
  if (!token) return null;
  return (await call("/me/routes", SavedRoutesResponseSchema, { token })).items;
}

/** Keeps a route on the account (`POST /me/routes`); `key` names the plan, the same plan again replaces it. */
export async function saveMyRoute(key: string, route: Omit<SavedRoute, "savedAt">): Promise<SavedRoute> {
  await loadSession();
  if (!token) throw new DataError("rejected", "Rotayı kaydetmek için giriş yap.");
  return call("/me/routes", SavedRouteSchema, { body: { key, route }, token });
}

export async function deleteMyRoute(id: string): Promise<void> {
  await loadSession();
  if (!token) return;
  // Answers 204: the schema is never read.
  await call(`/me/routes/${encodeURIComponent(id)}`, SavedRoutesResponseSchema, { method: "DELETE", token });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The state as it is now, outside React (tests). */
export function getCommunityState(): CommunityState {
  return state;
}

export function useCommunity(): CommunityState {
  useEffect(() => {
    void loadSession();
  }, []);
  return useSyncExternalStore(subscribe, getCommunityState, getCommunityState);
}
