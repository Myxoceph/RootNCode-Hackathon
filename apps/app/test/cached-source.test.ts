import type { AssetDetail } from "@vagabonds/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ulucamiFixture from "../src/data/fixtures/details.json";
import type { DataSource } from "../src/data/source";

vi.mock("../src/data/offline", () => ({ markStale: vi.fn(), markFresh: vi.fn() }));

const ID = "bursa-osmangazi-ulucami";
const asset = (ulucamiFixture as Record<string, unknown>)[ID] as AssetDetail;

let storage: typeof import("./mocks/async-storage");
let offline: { markStale: ReturnType<typeof vi.fn>; markFresh: ReturnType<typeof vi.fn> };
let DataError: typeof import("../src/data/errors").DataError;
let createCachedSource: typeof import("../src/data/cached-source").createCachedSource;
let PREFIX: string;

beforeEach(async () => {
  vi.resetModules();
  storage = await import("./mocks/async-storage");
  offline = (await import("../src/data/offline")) as unknown as typeof offline;
  offline.markStale.mockClear();
  offline.markFresh.mockClear();
  ({ DataError } = await import("../src/data/errors"));
  ({ createCachedSource, VERSION_PREFIX: PREFIX } = await import("../src/data/cached-source"));
});

afterEach(() => {
  vi.useRealTimers();
});

function source(getAsset: DataSource["getAsset"]): DataSource {
  const unused = () => Promise.reject(new Error("not used"));
  return { getAsset, listAssets: unused, getRelations: unused, getPulse: unused, listCities: unused, getWeather: unused };
}

function stored(key: string, data: unknown, savedAt = 1000) {
  storage.store.set(PREFIX + key, JSON.stringify({ savedAt, data }));
}

/** Lets queued storage writes finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const offlineError = () => new DataError("unavailable", "Sunucuya ulaşılamıyor.");

describe("cached source", () => {
  it("answers from the network and stores the answer, without reading storage", async () => {
    const getItem = vi.spyOn(storage.default, "getItem");
    const api = createCachedSource(source(async () => asset));

    await expect(api.getAsset(ID, "tr")).resolves.toBe(asset);
    expect(getItem).not.toHaveBeenCalledWith(PREFIX + `asset:tr:${ID}`);
    expect(offline.markFresh).toHaveBeenCalledWith(`asset:tr:${ID}`);

    await settle();
    expect(JSON.parse(storage.store.get(PREFIX + `asset:tr:${ID}`)!).data.id).toBe(ID);
  });

  it("shows the stored answer when the network fails, and says since when", async () => {
    stored(`asset:tr:${ID}`, asset, 1234);
    const api = createCachedSource(source(() => Promise.reject(offlineError())));

    await expect(api.getAsset(ID, "tr")).resolves.toMatchObject({ id: ID });
    expect(offline.markStale).toHaveBeenCalledWith(`asset:tr:${ID}`, 1234);
  });

  it("keeps a stored 'no such asset'", async () => {
    stored("asset:tr:gone", null);
    const api = createCachedSource(source(() => Promise.reject(offlineError())));
    await expect(api.getAsset("gone", "tr")).resolves.toBeNull();
  });

  it("does not hide data that breaks the contract behind the stored answer", async () => {
    stored(`asset:tr:${ID}`, asset);
    const invalid = new DataError("invalid", "Sunucudan gelen veri beklenen biçimde değil.");
    const api = createCachedSource(source(() => Promise.reject(invalid)));
    await expect(api.getAsset(ID, "tr")).rejects.toBe(invalid);
  });

  it("shows the error when nothing was stored, or the stored answer no longer fits the contract", async () => {
    const error = offlineError();
    const api = createCachedSource(source(() => Promise.reject(error)));
    await expect(api.getAsset(ID, "tr")).rejects.toBe(error);

    stored(`asset:tr:${ID}`, { id: ID });
    await expect(api.getAsset(ID, "tr")).rejects.toBe(error);
  });

  it("does not wait more than 4 seconds for a slow network when an answer is stored", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    stored(`asset:tr:${ID}`, asset, 1234);
    let arrive!: (value: AssetDetail) => void;
    const api = createCachedSource(source(() => new Promise((resolve) => (arrive = resolve))));

    const answer = api.getAsset(ID, "tr");
    await vi.advanceTimersByTimeAsync(4000);
    await expect(answer).resolves.toMatchObject({ id: ID });
    expect(offline.markStale).toHaveBeenCalledWith(`asset:tr:${ID}`, 1234);

    // The request goes on and refreshes the store when it gets through.
    arrive({ ...asset, name: "Yeni ad" });
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(storage.store.get(PREFIX + `asset:tr:${ID}`)!).data.name).toBe("Yeni ad");
  });

  it("keeps waiting for a slow network when nothing is stored", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let arrive!: (value: AssetDetail) => void;
    const api = createCachedSource(source(() => new Promise((resolve) => (arrive = resolve))));

    const answer = api.getAsset(ID, "tr");
    await vi.advanceTimersByTimeAsync(4000);
    arrive(asset);
    await expect(answer).resolves.toBe(asset);
    expect(offline.markFresh).toHaveBeenCalledWith(`asset:tr:${ID}`);
  });

  it("keeps about 4 MB, dropping the answers saved longest ago", async () => {
    const big = "x".repeat(1_500_000);
    const api = createCachedSource(source(async (id) => ({ ...asset, id, name: big })));
    for (const id of ["a", "b", "c"]) await api.getAsset(id, "tr");
    await settle();

    expect(storage.store.has(PREFIX + "asset:tr:a")).toBe(false);
    expect(storage.store.has(PREFIX + "asset:tr:b")).toBe(true);
    expect(storage.store.has(PREFIX + "asset:tr:c")).toBe(true);
  });

  it("clears answers of other contract versions on the first save, and nothing else", async () => {
    storage.store.set("vagabonds-cache:0.0.1:asset:tr:old", "{}");
    storage.store.set("vagabonds-community-session", "{}");
    const api = createCachedSource(source(async () => asset));
    await api.getAsset(ID, "tr");
    await settle();

    expect(storage.store.has("vagabonds-cache:0.0.1:asset:tr:old")).toBe(false);
    expect(storage.store.has("vagabonds-community-session")).toBe(true);
  });
});
