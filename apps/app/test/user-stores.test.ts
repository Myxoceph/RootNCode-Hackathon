import { beforeEach, describe, expect, it, vi } from "vitest";

type Routes = typeof import("../src/lib/saved-routes");
type Unlocked = typeof import("../src/lib/unlocked-assets");

const API = "http://api.test";
const SESSION_KEY = "vagabonds-community-session";

function session(id: string, token: string) {
  return { user: { id, nickname: "Gezgin", username: "gezgin", role: "visitor", createdAt: "2026-10-25T08:00:00.000Z" }, token: token.padEnd(40, "x") };
}
const ALICE = "0b9f6c2e-6d0e-4a55-8c1a-0e7d2f4b5a11";

/** Answers each request by its path; records them. */
function fakeApi(answers: Record<string, unknown>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const path = url.slice(API.length);
      const key = `${init.method ?? "GET"} ${path}`;
      if (key.startsWith("DELETE")) return new Response(null, { status: 204 });
      if (key === "POST /me/routes") {
        const { route } = JSON.parse(init.body as string) as { route: object };
        return Response.json({ ...route, savedAt: "2026-11-03T08:00:00.000Z" });
      }
      return Response.json(answers[key] ?? { error: { code: "NOT_FOUND" } }, { status: key in answers ? 200 : 404 });
    }),
  );
  return calls;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let routes: Routes;
let unlocked: Unlocked;
let storage: Map<string, string>;

async function load(signedIn: boolean) {
  vi.resetModules();
  vi.stubEnv("EXPO_PUBLIC_API_URL", API);
  vi.stubEnv("EXPO_PUBLIC_DATA_SOURCE", "api");
  const keychain = (await import("./mocks/secure-store")).store;
  keychain.clear();
  if (signedIn) keychain.set(SESSION_KEY, JSON.stringify(session(ALICE, "vgb_alice")));
  const async = await import("./mocks/async-storage");
  storage = async.store;
  storage.clear();
  routes = await import("../src/lib/saved-routes");
  unlocked = await import("../src/lib/unlocked-assets");
}

beforeEach(async () => {
  await load(true);
});

describe("saved routes", () => {
  it("come from the account, and a new one is sent there", async () => {
    const calls = fakeApi({ "GET /me/routes": { version: "0.3.21", items: [] } });
    // Rehber saves a trip before Rotalarım was ever opened: the account's list is loaded first.
    await routes.saveRoute({ region: "bursa", duration: "half", dishes: ["pideli-kofte"], title: "Bursa yarım gün", stops: 5 });
    expect(calls.map((c) => `${c.init.method ?? "GET"} ${c.url.slice(API.length)}`)).toEqual(["GET /me/routes", "POST /me/routes"]);
    const sent = JSON.parse(calls[1]!.init.body as string) as { key: string; route: { kind: string } };
    expect(sent).toMatchObject({ key: "bursa|half|pideli-kofte", route: { kind: "planner" } });
    expect((calls[1]!.init.headers as Record<string, string>).Authorization).toMatch(/^Bearer vgb_alice/);
  });

  it("are not kept on the phone, and never come from the old shared list", async () => {
    storage.set("vagabonds-saved-routes", JSON.stringify([{ id: "x", title: "Başkasının rotası" }]));
    fakeApi({ "GET /me/routes": { version: "0.3.21", items: [] } });
    await routes.removeRoute("nothing");
    expect(storage.has("vagabonds-saved-routes")).toBe(false);
  });

  it("signed out: kept for this run only, nothing sent", async () => {
    await load(false);
    const calls = fakeApi({});
    await routes.saveRoute({ region: "bursa", duration: "1", dishes: [], title: "Bursa bir gün", stops: 8 });
    expect(calls).toEqual([]);
    expect([...storage.keys()].some((key) => key.startsWith("vagabonds-saved-routes"))).toBe(false);
  });
});

describe("unlocked assets", () => {
  it("demo unlocks are kept per account, and the old shared list is dropped", async () => {
    storage.set("vagabonds-unlocked-assets", JSON.stringify(["bursa-osmangazi-ulucami"]));
    fakeApi({ "GET /me/visits": { version: "0.3.21", items: [] } });
    await unlocked.unlockForDemo("bursa-osmangazi-koza-hani");
    await flush();
    expect(storage.get(`vagabonds-unlocked-assets:${ALICE}`)).toBe(JSON.stringify(["bursa-osmangazi-koza-hani"]));
    expect(storage.has("vagabonds-unlocked-assets")).toBe(false);
  });

  it("signed out: a demo unlock is not written anywhere", async () => {
    await load(false);
    fakeApi({});
    await unlocked.unlockForDemo("bursa-osmangazi-koza-hani");
    expect([...storage.keys()].filter((key) => key.startsWith("vagabonds-unlocked-assets"))).toEqual([]);
  });
});
