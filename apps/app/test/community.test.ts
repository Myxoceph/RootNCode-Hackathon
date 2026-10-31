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

describe("sending a note", () => {
  it("opens an anonymous session under the nickname on the first note, and keeps it", async () => {
    const { calls } = scriptedFetch();
    const sent = community.sendContribution(ASSET, NOTE, "Gezgin");
    await flush();

    expect(calls[0]!.url).toBe(`${API}/auth/anonymous`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ nickname: "Gezgin" });
    const opened = session("Gezgin", "vgb_first");
    calls[0]!.reply(opened, 201);
    await flush();

    expect(calls[1]!.url).toBe(`${API}/assets/${ASSET.id}/contributions`);
    expect(bearer(calls[1]!.init)).toBe(`Bearer ${opened.token}`);
    calls[1]!.reply(contribution(), 201);
    await sent;

    expect(JSON.parse(keychain.get(SESSION_KEY)!).token).toBe(opened.token);
    expect(community.getCommunityState()).toMatchObject({
      user: { nickname: "Gezgin" },
      sent: 1,
      assetNames: { [ASSET.id]: "Ulucami" },
    });
  });

  it("sends later notes under the stored session", async () => {
    const stored = session("Gezgin", "vgb_stored");
    await load({ stored });
    const { calls } = scriptedFetch();
    const sent = community.sendContribution(ASSET, NOTE);
    await flush();

    expect(calls).toHaveLength(1);
    expect(bearer(calls[0]!.init)).toBe(`Bearer ${stored.token}`);
    calls[0]!.reply(contribution(), 201);
    await sent;
  });

  it("asks for a nickname without a session, before any request", async () => {
    const { fetch } = scriptedFetch();
    await expect(community.sendContribution(ASSET, NOTE)).rejects.toMatchObject({ kind: "rejected", message: "Takma ad gerekli." });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("says when the hourly limit is reached, without a number that could go stale", async () => {
    await load({ stored: session("Gezgin", "vgb_stored") });
    const { calls } = scriptedFetch();
    const sent = community.sendContribution(ASSET, NOTE);
    await flush();
    calls[0]!.reply({ error: { code: "CONTRIBUTION_LIMIT" } }, 429);
    await expect(sent).rejects.toMatchObject({ kind: "rejected", message: "Saatlik not sınırına ulaştın. Biraz sonra tekrar dene." });
  });

  it("keeps the new session when sending under it fails, so the nickname is not asked again", async () => {
    const { calls } = scriptedFetch();
    const sent = community.sendContribution(ASSET, NOTE, "Gezgin");
    await flush();
    calls[0]!.reply(session("Gezgin", "vgb_first"), 201);
    await flush();
    calls[1]!.reply({ error: { code: "INTERNAL" } }, 500);

    await expect(sent).rejects.toMatchObject({ kind: "unavailable" });
    expect(community.getCommunityState().user?.nickname).toBe("Gezgin");
  });
});

describe("an expired session", () => {
  it("is forgotten on a 401, so the next note asks for a nickname", async () => {
    await load({ stored: session("Gezgin", "vgb_revoked") });
    const { calls } = scriptedFetch();
    const mine = community.fetchMyContributions();
    await flush();
    calls[0]!.reply({ error: { code: "UNAUTHORIZED" } }, 401);

    await expect(mine).rejects.toMatchObject({ message: "Oturumun sona ermiş. Takma adını yeniden girip tekrar gönder." });
    await flush();
    expect(keychain.has(SESSION_KEY)).toBe(false);
    expect(community.getCommunityState().user).toBeNull();
  });

  it("does not take a session opened meanwhile down with it", async () => {
    await load({ stored: session("Eski", "vgb_revoked") });
    const { calls } = scriptedFetch();

    // Notlarım asks with the revoked token; the answer is slow.
    const mine = community.fetchMyContributions();
    await flush();
    // A note with the same token is turned down first, and the session forgotten...
    const first = community.sendContribution(ASSET, NOTE);
    await flush();
    calls[1]!.reply({ error: { code: "UNAUTHORIZED" } }, 401);
    await expect(first).rejects.toMatchObject({ kind: "rejected" });
    // ...so the visitor sends again under a new nickname.
    const fresh = session("Yeni", "vgb_fresh");
    const second = community.sendContribution(ASSET, NOTE, "Yeni");
    await flush();
    calls[2]!.reply(fresh, 201);
    await flush();
    calls[3]!.reply(contribution(), 201);
    await second;

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
    await expect(community.sendContribution(ASSET, NOTE, "Gezgin")).rejects.toMatchObject({ kind: "unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
