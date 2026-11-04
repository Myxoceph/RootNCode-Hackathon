import { beforeEach, describe, expect, it, vi } from "vitest";

type Community = typeof import("../src/data/community");

const API = "http://api.test";
const ASSET = { id: "bursa-osmangazi-ulucami", name: "Ulucami" };
const NOTE = { kind: "tip" as const, body: "Kuzey kapısı sabah dokuzda açılıyor." };
const SESSION_KEY = "vagabonds-community-session";

function session(nickname: string, token: string) {
  return {
    user: { id: crypto.randomUUID(), nickname, role: "visitor", createdAt: "2026-10-25T08:00:00.000Z" },
    token: token.padEnd(40, "x"),
  };
}

function contribution() {
  return {
    id: crypto.randomUUID(),
    assetId: ASSET.id,
    kind: "tip",
    body: NOTE.body,
    status: "pending",
    createdAt: "2026-10-25T08:00:00.000Z",
    reviewedAt: null,
    rejectReason: null,
  };
}

/** A fetch whose answers the test hands out one request at a time. */
function scriptedFetch() {
  const calls: Array<{ url: string; init: RequestInit; reply: (body: unknown, status?: number) => void }> = [];
  const fetch = vi.fn(
    (url: string, init: RequestInit) =>
      new Promise<Response>((resolve) =>
        calls.push({ url, init, reply: (body, status = 200) => resolve(Response.json(body, { status })) }),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  return { fetch, calls };
}

/** Lets pending promises run until the next request is waiting. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const bearer = (init: RequestInit) => (init.headers as Record<string, string>).Authorization;

let community: Community;
let keychain: Map<string, string>;

async function load(env: { source?: "api" | "mock"; stored?: ReturnType<typeof session> } = {}) {
  vi.resetModules();
  vi.stubEnv("EXPO_PUBLIC_API_URL", API);
  vi.stubEnv("EXPO_PUBLIC_DATA_SOURCE", env.source ?? "api");
  keychain = (await import("./mocks/secure-store")).store;
  if (env.stored) keychain.set(SESSION_KEY, JSON.stringify(env.stored));
  community = await import("../src/data/community");
}

beforeEach(async () => {
  await load();
});

/** A signed-in account: notes and seals go only under one. */
function account(nickname: string, username: string, token: string) {
  const s = session(nickname, token);
  return { ...s, user: { ...s.user, username } };
}

describe("sending a note", () => {
  it("sends under the account and counts it", async () => {
    const stored = account("Gezgin", "gezgin", "vgb_stored");
    await load({ stored });
    const { calls } = scriptedFetch();
    const sent = community.sendContribution(ASSET, NOTE);
    await flush();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${API}/assets/${ASSET.id}/contributions`);
    expect(bearer(calls[0]!.init)).toBe(`Bearer ${stored.token}`);
    calls[0]!.reply(contribution(), 201);
    await sent;
    expect(community.getCommunityState()).toMatchObject({ sent: 1, assetNames: { [ASSET.id]: "Ulucami" } });
  });

  it("asks to sign in without an account, before any request", async () => {
    const { fetch } = scriptedFetch();
    await expect(community.sendContribution(ASSET, NOTE)).rejects.toMatchObject({ kind: "rejected", message: "Not bırakmak için giriş yap." });
    // An old nickname session is not an account either.
    await load({ stored: session("Gezgin", "vgb_anon") });
    await expect(community.sendContribution(ASSET, NOTE)).rejects.toMatchObject({ code: "ACCOUNT_REQUIRED" });
    await expect(community.sendVisitProof(ASSET.id, { mediaKey: "kapi" })).rejects.toMatchObject({ message: "Mühür basmak için giriş yap." });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("says when the hourly limit is reached, without a number that could go stale", async () => {
    await load({ stored: account("Gezgin", "gezgin", "vgb_stored") });
    const { calls } = scriptedFetch();
    const sent = community.sendContribution(ASSET, NOTE);
    await flush();
    calls[0]!.reply({ error: { code: "CONTRIBUTION_LIMIT" } }, 429);
    await expect(sent).rejects.toMatchObject({ kind: "rejected", message: "Saatlik not sınırına ulaştın. Biraz sonra tekrar dene." });
  });
});

describe("an expired session", () => {
  it("is forgotten on a 401, so the app asks to sign in again", async () => {
    await load({ stored: account("Gezgin", "gezgin", "vgb_revoked") });
    const { calls } = scriptedFetch();
    const mine = community.fetchMyContributions();
    await flush();
    calls[0]!.reply({ error: { code: "UNAUTHORIZED" } }, 401);

    await expect(mine).rejects.toMatchObject({ message: "Oturumun sona ermiş. Yeniden giriş yap." });
    await flush();
    expect(keychain.has(SESSION_KEY)).toBe(false);
    expect(community.getCommunityState().user).toBeNull();
  });

  it("does not take a session opened meanwhile down with it", async () => {
    await load({ stored: account("Eski", "eski", "vgb_revoked") });
    const { calls } = scriptedFetch();

    // Notlarım asks with the revoked token; the answer is slow.
    const mine = community.fetchMyContributions();
    await flush();
    // A note with the same token is turned down first, and the session forgotten...
    const first = community.sendContribution(ASSET, NOTE);
    await flush();
    calls[1]!.reply({ error: { code: "UNAUTHORIZED" } }, 401);
    await expect(first).rejects.toMatchObject({ kind: "rejected" });
    await flush();
    // ...so the visitor signs in again.
    const fresh = account("Yeni", "yeni", "vgb_fresh");
    const signingIn = community.login({ username: "yeni", password: "parola123" });
    await flush();
    calls[2]!.reply(fresh);
    await signingIn;

    // The slow 401 about the old token arrives last.
    calls[0]!.reply({ error: { code: "UNAUTHORIZED" } }, 401);
    await expect(mine).rejects.toMatchObject({ kind: "rejected" });
    await flush();

    expect(JSON.parse(keychain.get(SESSION_KEY)!).token).toBe(fresh.token);
    expect(community.getCommunityState().user?.nickname).toBe("Yeni");
  });
});

describe("Notlarım", () => {
  it("is null without a session, with no request", async () => {
    const { fetch } = scriptedFetch();
    await expect(community.fetchMyContributions()).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("lists the notes under the stored session", async () => {
    await load({ stored: session("Gezgin", "vgb_stored") });
    const { calls } = scriptedFetch();
    const mine = community.fetchMyContributions();
    await flush();
    expect(calls[0]!.url).toBe(`${API}/me/contributions`);
    calls[0]!.reply({ items: [contribution()] });
    await expect(mine).resolves.toHaveLength(1);
  });
});

describe("with the mock source", () => {
  it("sends nothing and lists nothing", async () => {
    await load({ source: "mock", stored: session("Gezgin", "vgb_stored") });
    const { fetch } = scriptedFetch();
    expect(community.communityAvailable).toBe(false);
    await expect(community.fetchMyContributions()).resolves.toBeNull();
    await expect(community.sendContribution(ASSET, NOTE)).rejects.toMatchObject({ kind: "unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("accounts", () => {
  it("signs up with a new account and keeps its session", async () => {
    const { calls } = scriptedFetch();
    const signedUp = community.register({ username: "gezgin", password: "parola123", email: "gezgin@ornek.test" });
    await flush();

    expect(calls[0]!.url).toBe(`${API}/auth/register`);
    const opened = account("gezgin", "gezgin", "vgb_account");
    calls[0]!.reply(opened, 201);
    expect((await signedUp).username).toBe("gezgin");
    expect(community.getCommunityState().user?.username).toBe("gezgin");
    expect(JSON.parse(keychain.get(SESSION_KEY)!).token).toBe(opened.token);
  });

  it("turns a visitor's anonymous session into the account, so their notes stay theirs", async () => {
    const stored = session("Gezgin", "vgb_anon");
    await load({ stored });
    const { calls } = scriptedFetch();
    const signedUp = community.register({ username: "gezgin", password: "parola123", email: "gezgin@ornek.test" });
    await flush();

    expect(calls[0]!.url).toBe(`${API}/auth/upgrade`);
    expect(bearer(calls[0]!.init)).toBe(`Bearer ${stored.token}`);
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ username: "gezgin", password: "parola123", email: "gezgin@ornek.test" });
    calls[0]!.reply({ ...stored.user, username: "gezgin" });
    await signedUp;
    expect(community.getCommunityState().user).toMatchObject({ nickname: "Gezgin", username: "gezgin" });
    expect(JSON.parse(keychain.get(SESSION_KEY)!).token).toBe(stored.token);
  });

  it("changes the full name and keeps the account's new details with its session", async () => {
    const stored = account("Gezgin", "gezgin", "vgb_account");
    await load({ stored });
    const { calls } = scriptedFetch();
    const updated = community.updateProfile({ fullName: "Ayşe Yılmaz" });
    await flush();

    expect([calls[0]!.url, calls[0]!.init?.method]).toEqual([`${API}/me`, "PATCH"]);
    calls[0]!.reply({ ...stored.user, fullName: "Ayşe Yılmaz", photoUrl: "/avatars/x?v=1&exp=1&sig=s" });
    expect((await updated).fullName).toBe("Ayşe Yılmaz");
    expect(JSON.parse(keychain.get(SESSION_KEY)!)).toMatchObject({ token: stored.token, user: { fullName: "Ayşe Yılmaz" } });
    expect(community.avatarUri(community.getCommunityState().user)).toBe(`${API}/avatars/x?v=1&exp=1&sig=s`);
  });

  it("says a wrong password in its own words and keeps the visitor signed out", async () => {
    const { calls } = scriptedFetch();
    const signingIn = community.login({ username: "gezgin", password: "yanlis" });
    await flush();
    calls[0]!.reply({ error: { code: "INVALID_CREDENTIALS", message: "Wrong username or password" } }, 401);

    await expect(signingIn).rejects.toThrow("Kullanıcı adı ya da parola yanlış.");
    expect(community.getCommunityState().user).toBeNull();
  });

  it("signs out on this device even when the API cannot be reached", async () => {
    await load({ stored: account("gezgin", "gezgin", "vgb_account") });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    await community.logout();

    expect(community.getCommunityState().user).toBeNull();
    expect(keychain.has(SESSION_KEY)).toBe(false);
  });
});
