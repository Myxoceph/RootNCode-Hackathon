import { beforeEach, describe, expect, it, vi } from "vitest";

type Store = typeof import("../src/data/new-badges");

const ALICE = "0b9f6c2e-6d0e-4a55-8c1a-0e7d2f4b5a11";
const BOB = "7d1c2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const badge = (code: string, points = 10) => ({ code, title: code, description: `${code} açıklaması`, badge: "⭐", points });

let store: Store;
let storage: Map<string, string>;
const codes = () => store.pendingBadges().map((b) => b.code);

/** A fresh run of the app; `keep` keeps what the device stored. */
async function start(keep = false) {
  const saved = keep ? new Map(storage) : new Map<string, string>();
  vi.resetModules();
  storage = (await import("./mocks/async-storage")).store;
  storage.clear();
  for (const [key, value] of saved) storage.set(key, value);
  store = await import("../src/data/new-badges");
}

beforeEach(async () => {
  storage = new Map();
  await start();
});

describe("new badges", () => {
  it("does not celebrate what an account had earned before this device first saw it", async () => {
    await store.noteEarned(ALICE, [badge("bursa-ilk-adim"), badge("iki-sehir")]);
    expect(codes()).toEqual([]);
  });

  it("celebrates a badge that came in with a later read, once", async () => {
    await store.noteEarned(ALICE, [badge("bursa-ilk-adim")]);
    await store.noteEarned(ALICE, [badge("bursa-ilk-adim"), badge("ilk-not")]);
    expect(codes()).toEqual(["ilk-not"]);
    await store.noteEarned(ALICE, [badge("bursa-ilk-adim"), badge("ilk-not")]);
    expect(codes()).toEqual(["ilk-not"]);
  });

  it("remembers what was shown after a restart", async () => {
    await store.noteEarned(ALICE, [badge("bursa-ilk-adim")]);
    await store.noteEarned(ALICE, [badge("bursa-ilk-adim"), badge("ilk-not")]);
    await start(true);
    await store.noteEarned(ALICE, [badge("bursa-ilk-adim"), badge("ilk-not")]);
    expect(codes()).toEqual([]);
  });

  it("celebrates a sealed visit's badges at once and not again when Rozetlerim reads them", async () => {
    await store.noteEarned(ALICE, [badge("bursa-ilk-adim")]);
    await store.celebrateEarned(ALICE, [badge("zaman-yolcusu", 40), badge("cami-meraklisi")]);
    expect(codes()).toEqual(["zaman-yolcusu", "cami-meraklisi"]);
    await store.noteEarned(ALICE, [badge("bursa-ilk-adim"), badge("zaman-yolcusu"), badge("cami-meraklisi")]);
    expect(codes()).toEqual(["zaman-yolcusu", "cami-meraklisi"]);
    await start(true);
    await store.noteEarned(ALICE, [badge("bursa-ilk-adim"), badge("zaman-yolcusu"), badge("cami-meraklisi")]);
    expect(codes()).toEqual([]);
  });

  it("does not let a visit's badges make the first read on a device celebrate the old ones", async () => {
    await store.celebrateEarned(ALICE, [badge("zaman-yolcusu")]);
    store.dismissAllBadges();
    await store.noteEarned(ALICE, [badge("bursa-ilk-adim"), badge("zaman-yolcusu")]);
    expect(codes()).toEqual([]);
  });

  it("keeps each account's badges apart", async () => {
    await store.noteEarned(ALICE, [badge("bursa-ilk-adim")]);
    await store.noteEarned(BOB, [badge("konya-ilk-adim")]);
    await store.noteEarned(BOB, [badge("konya-ilk-adim"), badge("bursa-ilk-adim")]);
    expect(codes()).toEqual(["bursa-ilk-adim"]);
  });

  it("shows them one after another, or puts them all away", async () => {
    await store.celebrateEarned(null, [badge("a"), badge("b"), badge("c")]);
    store.dismissBadge();
    expect(codes()).toEqual(["b", "c"]);
    store.dismissAllBadges();
    expect(codes()).toEqual([]);
    await store.celebrateEarned(null, [badge("a")]);
    expect(codes()).toEqual([]);
  });

  it("treats unreadable storage as a first read", async () => {
    storage.set(`vagabonds-badges-seen:${ALICE}`, "{bozuk");
    await store.noteEarned(ALICE, [badge("bursa-ilk-adim")]);
    expect(codes()).toEqual([]);
  });

  it("keeps a held celebration closed, with its badges in line, until it is let go", async () => {
    const release = store.holdBadges();
    await store.celebrateEarned(ALICE, [badge("first")]);
    expect(codes()).toEqual(["first"]);
    expect(store.heldBadges()).toEqual([]);
    release();
    release();
    expect(store.heldBadges()).toEqual([badge("first")]);
  });
});
