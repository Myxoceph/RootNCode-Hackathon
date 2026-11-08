import { beforeEach, describe, expect, it, vi } from "vitest";

import { store } from "./mocks/async-storage";

let owner: string | null = null;
vi.mock("@/data/community", () => ({
  currentUserId: () => Promise.resolve(owner),
  useCommunity: () => ({ user: undefined }),
}));

const { readLastCity, rememberCity, rememberOpenCity } = await import("../src/lib/last-city");

/** The writes go out without being awaited; a few turns let them land. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("the city a visitor left the map on", () => {
  beforeEach(() => {
    store.clear();
    owner = null;
  });

  it("is kept for the account that opened it, and never opens another account's map", async () => {
    owner = "ayse";
    rememberCity("bursa");
    rememberOpenCity("bursa");
    await settle();
    expect(await readLastCity()).toBe("bursa");
    expect(store.get("vagabonds-open-city:ayse")).toBe("bursa");

    // Ayşe signs out, Mehmet signs in on the same phone: his map opens on Turkey.
    owner = "mehmet";
    expect(await readLastCity()).toBeNull();
    expect(store.has("vagabonds-open-city:mehmet")).toBe(false);
  });

  it("is forgotten for that account alone once it goes back to the Turkey view", async () => {
    owner = "ayse";
    rememberOpenCity("bursa");
    owner = "mehmet";
    rememberOpenCity("konya");
    await settle();
    owner = "ayse";
    rememberOpenCity(null);
    await settle();
    expect(store.has("vagabonds-open-city:ayse")).toBe(false);
    expect(store.get("vagabonds-open-city:mehmet")).toBe("konya");
  });

  it("keeps the phone's own city without a session (no server, no accounts)", async () => {
    rememberCity("hatay");
    await settle();
    expect(store.get("vagabonds-last-city")).toBe("hatay");
  });
});
