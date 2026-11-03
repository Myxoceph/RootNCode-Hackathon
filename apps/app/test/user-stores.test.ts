import { beforeEach, describe, expect, it, vi } from "vitest";

type Routes = typeof import("../src/lib/saved-routes");
type ChatResponse = import("@vagabonds/contracts").ChatResponse;
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
  const answer = (over: object) =>
    ({ answer: "Etli ekmek **denenmeli** [1].", citations: [], attachments: { trip: null, transit: null }, ...over }) as unknown as ChatResponse;
  const place = { name: "Konya Garı", lat: 37, lng: 32, stopCode: null };
  const plan = (itineraries: object[]) => ({ from: place, to: { ...place, name: "Mevlana Müzesi", assetId: "mevlana" }, itineraries });
  const dish = { ref: 1, kind: "dish", id: "etli-ekmek", title: "Etli ekmek" };

  it("keeps the dishes an answer cites, once each, without its markers", () => {
    const [food, ...rest] = routes.adviceOf("Ne yenir?", answer({ citations: [dish, { ...dish, ref: 2 }, { ref: 3, kind: "asset", id: "a", title: "Ulucami" }] }));
    expect(rest).toEqual([]);
    expect(food).toEqual({ kind: "food", title: "Etli ekmek", question: "Ne yenir?", answer: "Etli ekmek denenmeli.", dishes: [{ id: "etli-ekmek", title: "Etli ekmek" }], about: null });
  });

  it("keeps directions only when a bus or tram helps, and nothing of a trip", () => {
    expect(routes.adviceOf("Nasıl?", answer({ attachments: { trip: null, transit: plan([]) } }))).toEqual([]);
    expect(routes.adviceOf("Nasıl?", answer({ attachments: { trip: null, transit: plan([{}]) } }))[0]).toMatchObject({ kind: "transit", title: "Konya Garı → Mevlana Müzesi" });
    expect(routes.adviceOf("Plan?", answer({ citations: [dish], attachments: { trip: {}, transit: null } }))).toEqual([]);
  });

  it("ties an answer to the route planned before it, in that route's city", () => {
    const trip = (code: string) => ({ city: { code, label: code === "konya" ? "Konya" : "Bursa" }, duration: "half", theme: null, days: [{ date: "2026-11-03" }] }) as never;
    const food = (id: string) => answer({ citations: [{ ...dish, id }] });
    expect(routes.adviceOf("Ne yenir?", food("konya-etliekmek"), { trips: [trip("bursa"), trip("konya")] })[0]?.about).toEqual({ kind: "route", key: "trip|konya|half||2026-11-03", title: "Konya gezi planı" });
    expect(routes.adviceOf("Konya'da ne yenir?", food("konya-etliekmek"), { trips: [trip("bursa")] })[0]?.about).toBeNull();
    expect(routes.adviceOf("Nasıl?", answer({ attachments: { trip: null, transit: plan([{}]) } }), { trips: [trip("bursa")] })[0]?.about).toBeNull();
    expect(routes.adviceOf("Yakında ne yenir?", food("konya-etliekmek"), { asset: { id: "a1", name: "Ulucami" }, trips: [trip("konya")] })[0]?.about).toEqual({ kind: "asset", key: "a1", title: "Ulucami" });
  });

  it("reads a food answer as a menu, and plain words as words", () => {
    expect(routes.menuOf("Iki önerim var:\n\n- Pideli Köfte: yoğurtla sunulur\n- Kestane\n\nAfiyet olsun.")).toEqual({
      intro: "Iki önerim var:",
      dishes: [{ name: "Pideli Köfte", text: "Yoğurtla sunulur" }, { name: "Kestane", text: "" }],
      outro: "Afiyet olsun.",
    });
    expect(routes.menuOf("Etli ekmek denenmeli.")).toEqual({ intro: "Etli ekmek denenmeli.", dishes: [], outro: "" });
  });

  it("names each kind of entry apart, and a planner route as before", () => {
    expect(routes.routeKey({ kind: "planner", region: "bursa", duration: "half", dishes: ["b", "a"] } as never)).toBe("bursa|half|a+b");
    expect(routes.routeKey({ region: "bursa", duration: "half", dishes: ["a", "b"] })).toBe("bursa|half|a+b");
    expect(routes.routeKey({ kind: "food", dishes: [{ id: "b", title: "B" }, { id: "a", title: "A" }] })).toBe("food||a|b");
    expect(routes.routeKey({ kind: "transit", transit: plan([]) as never })).toBe("transit||Konya Garı|mevlana");
    expect(routes.routeKey({ kind: "food", dishes: [{ id: "a", title: "A" }], about: { kind: "route", key: "trip|bursa", title: "Bursa" } })).toBe("food|trip|bursa|a");
  });

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
