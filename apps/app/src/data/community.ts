import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AchievementsResponseSchema,
  AnonymousSessionResponseSchema,
  AppUserSchema,
  ContributionSchema,
  MyAchievementsResponseSchema,
  MyContributionsResponseSchema,
  MyVisitsResponseSchema,
  RedeemResponseSchema,
  RewardsResponseSchema,
  SavedRouteSchema,
  SavedRoutesResponseSchema,
  VisitResponseSchema,
  WalletResponseSchema,
  type AnonymousSessionResponse,
  type AppUser,
  type LoginRequest,
  type RegisterRequest,
  type Contribution,
  type MyAchievementsResponse,
  type MyVisit,
  type RedeemResponse,
  type Reward,
  type WalletResponse,
  type SavedRoute,
  type TextContributionKind,
  type UpdateProfileRequest,
  type VisitProofRequest,
  type VisitResponse,
  type Lang,
} from "@vagabonds/contracts";
import { useEffect, useSyncExternalStore } from "react";

import { resolveApiUrl, resolveDataSourceKind } from "./config";
import { getMessages } from "@/i18n";
import { DataError, type SchemaParser } from "./errors";
import { request, statusError } from "./http";
import { celebrateEarned, noteEarned } from "./new-badges";
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
  /** Bumped on every visit recorded, so the badges, points and wallet fetch again. */
  visited: number;
  /**
   * Names of the assets the visitor's notes are on, kept when sending: a session lives on one
   * device, so every note of it was sent from here, and the list needs no asset requests.
   */
  assetNames: Readonly<Record<string, string>>;
}

let state: CommunityState = { user: undefined, sent: 0, visited: 0, assetNames: {} };
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
const authMessages = (): Record<string, string> => getMessages().errors.auth;

/**
 * Opens an account (`POST /auth/register`). A visitor who already left notes or seals under a
 * nickname keeps them: their anonymous session becomes the account (`POST /auth/upgrade`).
 */
export async function register(account: RegisterRequest): Promise<AppUser> {
  if (!communityAvailable) throw new DataError("unavailable", getMessages().errors.registerNeedsServer);
  await loadSession();
  if (token && state.user && state.user.username === null) {
    const current = token;
    const user = await call("/auth/upgrade", AppUserSchema, {
      body: { username: account.username, password: account.password, email: account.email },
      token: current,
      messages: authMessages(),
    });
    await keepSession({ user, token: current });
    return user;
  }
  const session = await call("/auth/register", AnonymousSessionResponseSchema, { body: account, messages: authMessages() });
  await keepSession(session);
  return session.user;
}

/** Signs in (`POST /auth/login`); a session already on the device gives way to the account's. */
export async function login(credentials: LoginRequest): Promise<AppUser> {
  if (!communityAvailable) throw new DataError("unavailable", getMessages().errors.loginNeedsServer);
  await loadSession();
  const session = await call("/auth/login", AnonymousSessionResponseSchema, { body: credentials, messages: authMessages() });
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

/**
 * Erases the account (`POST /auth/delete-account`) and signs out here. Unlike signing out this must
 * reach the API: on any failure nothing has been deleted and the session stays.
 */
export async function deleteAccount(password: string): Promise<void> {
  await loadSession();
  const current = token;
  if (!current) throw new DataError("rejected", getMessages().profile.deleteAccount.failed);
  // Answers 204: the schema is never read.
  await call("/auth/delete-account", AppUserSchema, { body: { password }, token: current, messages: authMessages() });
  await forgetSession(current);
}

/** The API no longer knows `rejected` (revoked, database reset): signed out, the app asks to sign in again. */
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
  const words = getMessages().moreErrors;
  switch (code) {
    case "CONTRIBUTION_LIMIT":
      return rejected(words.note.limit);
    case "USER_BANNED":
      return rejected(words.note.banned);
    case "UNAUTHORIZED":
      return rejected(words.note.expired);
    case "ASSET_NOT_FOUND":
      return rejected(words.note.unpublished);
    case "INVALID_BODY":
      return rejected(words.note.invalid);
    case "TOO_FAR":
      return rejected(words.seal.tooFar);
    case "POSITION_REQUIRED":
      // The seal screen acts on the code: it fetches the position and sends again.
      return new DataError("rejected", words.seal.position, details, code);
    case "UNKNOWN_MEDIA":
      return rejected(words.seal.unknownMedia);
    case "VISIT_LIMIT":
      return rejected(words.seal.limit);
  }
  return statusError(status, code, details);
}

/**
 * Sends a note on `asset` under the account. The note waits for a moderator; the pulse shows it once approved.
 */
export async function sendContribution(asset: { id: string; name: string }, note: { kind: TextContributionKind; body: string }): Promise<Contribution> {
  if (!communityAvailable) throw new DataError("unavailable", getMessages().moreErrors.note.needsServer);
  const sendWith = await signedInToken(getMessages().moreErrors.signIn.note);
  const contribution = await call(`/assets/${encodeURIComponent(asset.id)}/contributions`, ContributionSchema, {
    body: note,
    token: sendWith,
  });
  void rememberAssetName(asset.id, asset.name);
  set({ sent: state.sent + 1 });
  return contribution;
}

/**
 * Ziyaret Mührü: the camera recognised the asset's seal photo on site, so the visit is proven
 * (`POST /assets/:id/visit/proof`) under the account.
 */
export async function sendVisitProof(assetId: string, proof: Omit<VisitProofRequest, "method">): Promise<VisitResponse> {
  if (!communityAvailable) throw new DataError("unavailable", getMessages().moreErrors.seal.needsServer);
  const sendWith = await signedInToken(getMessages().moreErrors.signIn.seal);
  const result = await call(`/assets/${encodeURIComponent(assetId)}/visit/proof`, VisitResponseSchema, {
    body: { ...proof, method: "device_recognition" },
    token: sendWith,
  });
  set({ visited: state.visited + 1 });
  void celebrateEarned(state.user?.id ?? null, result.newAchievements);
  return result;
}

/**
 * "Kilidi aç" while Ziyaret Mührü is tried away from the sites (`POST /assets/:id/visit/unlock`): the
 * visit counts for badges and points without position or photo. Null without an account.
 */
export async function sendDemoUnlock(assetId: string): Promise<VisitResponse | null> {
  // An account's visit, as a sealed one: an old nickname session earns nothing either.
  const sendWith = await accountToken();
  if (sendWith === null) return null;
  const result = await call(`/assets/${encodeURIComponent(assetId)}/visit/unlock`, VisitResponseSchema, { method: "POST", token: sendWith });
  set({ visited: state.visited + 1 });
  void celebrateEarned(state.user?.id ?? null, result.newAchievements);
  return result;
}

/** The account's details changed (name, photo): kept with the session it belongs to. */
export async function keepUser(user: AppUser, sentWith: string) {
  if (token !== sentWith) return;
  await keepSession({ user, token: sentWith });
}

/** The account's token, or the "sign in to …" error given. */
export async function signedInToken(signIn: string): Promise<string> {
  const current = await accountToken();
  if (current === null) throw new DataError("rejected", signIn, ["/me"], "ACCOUNT_REQUIRED");
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

const profileMessages = (): Record<string, string> => getMessages().moreErrors.profile;

/** Changes the nickname or the full name (`PATCH /me`); `fullName: null` removes the name. */
export async function updateProfile(profile: UpdateProfileRequest): Promise<AppUser> {
  const current = await signedInToken(getMessages().moreErrors.signIn.profile);
  const user = await call("/me", AppUserSchema, { body: profile, method: "PATCH", token: current, messages: profileMessages() });
  await keepUser(user, current);
  return user;
}

/** Removes the profile photo (`DELETE /me/avatar`). */
export async function removeAvatar(): Promise<AppUser> {
  const current = await signedInToken(getMessages().moreErrors.signIn.removePhoto);
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
  if (token) {
    const mine = await call("/me/achievements", MyAchievementsResponseSchema, { token });
    // This call also awards the badges of notes approved since: the ones not shown yet are celebrated.
    const userId = state.user?.id;
    if (userId) void noteEarned(userId, mine.items.filter((item) => item.earnedAt));
    return mine;
  }
  const all = await call("/achievements", AchievementsResponseSchema);
  const none = { approved: 0, pending: 0 };
  return {
    version: all.version,
    lang: all.lang,
    totalPoints: 0,
    activityPoints: 0,
    visits: 0,
    sealed: 0,
    notes: none,
    photos: none,
    items: all.items.map((item) => ({ ...item, earnedAt: null, progress: { current: 0, target: 1 } })),
  };
}

/** Ödüllerim: the partners' rewards on offer (`GET /rewards`); `null` without a server. */
export async function fetchRewards(lang: Lang): Promise<Reward[] | null> {
  if (!communityAvailable) return null;
  return (await call(`/rewards?lang=${lang}`, RewardsResponseSchema)).items;
}

/** The visitor's points to spend and the codes taken (`GET /me/wallet`); `null` without a session. */
export async function fetchWallet(): Promise<WalletResponse | null> {
  if (!communityAvailable) return null;
  await loadSession();
  if (!token) return null;
  return call("/me/wallet", WalletResponseSchema, { token });
}

const redeemMessages = (): Record<string, string> => getMessages().moreErrors.redeem;

/** Spends points on a reward (`POST /rewards/:code/redeem`): the partner's single-use code. */
export async function redeemReward(code: string): Promise<RedeemResponse> {
  await loadSession();
  const current = token;
  if (current === null) throw new DataError("rejected", getMessages().moreErrors.redeem.ACCOUNT_REQUIRED, ["/rewards"], "ACCOUNT_REQUIRED");
  return call(`/rewards/${encodeURIComponent(code)}/redeem`, RedeemResponseSchema, { method: "POST", token: current, messages: redeemMessages() });
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
  if (!token) throw new DataError("rejected", getMessages().moreErrors.signIn.route);
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
