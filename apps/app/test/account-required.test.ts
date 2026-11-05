import type { AppUser } from "@vagabonds/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import { afterSignIn, isAccount, needsSignIn } from "../src/lib/account-gate";
import { markTourSeen, tourSeen, tourSeenKey } from "../src/lib/map-tour";
import { store } from "./mocks/async-storage";

const visitor = (username: string | null): AppUser =>
  ({ id: `id-${username ?? "anon"}`, nickname: "Gezgin", username, role: "visitor", createdAt: "2026-11-04T08:00:00.000Z" }) as AppUser;

describe("the account gate", () => {
  it("sends a visitor without an account to sign in, from any screen but that one", () => {
    expect(needsSignIn(null, true, "(tabs)")).toBe(true);
    expect(needsSignIn(null, true, "asset")).toBe(true);
    expect(needsSignIn(null, true, "auth")).toBe(false);
  });

  it("does not take an old nickname session for an account", () => {
    expect(needsSignIn(visitor(null), true, "(tabs)")).toBe(true);
    expect(needsSignIn(visitor("gezgin"), true, "(tabs)")).toBe(false);
  });

  it("decides nothing while the stored session loads, nor without a server to open an account on", () => {
    expect(needsSignIn(undefined, true, "(tabs)")).toBe(false);
    expect(needsSignIn(null, false, "(tabs)")).toBe(false);
  });
});

describe("an account", () => {
  it("has a username; an old nickname session does not", () => {
    expect(isAccount(visitor("gezgin"))).toBe(true);
    expect(isAccount(visitor(null))).toBe(false);
    expect(isAccount(null)).toBe(false);
    expect(isAccount(undefined)).toBe(false);
  });
});

describe("after signing in", () => {
  it("opens the page a shared link asked for", () => {
    expect(afterSignIn("/asset/bursa-osmangazi-ulucami")).toBe("/asset/bursa-osmangazi-ulucami");
    expect(afterSignIn("/map?city=bursa")).toBe("/map?city=bursa");
  });

  it("opens the greeting otherwise, and never a page outside the app or the sign-in screen", () => {
    expect(afterSignIn(undefined)).toBe("/");
    expect(afterSignIn("https://baska.site")).toBe("/");
    expect(afterSignIn("//baska.site/yol")).toBe("/");
    expect(afterSignIn("/auth?mode=login")).toBe("/");
  });
});

describe("the map's tour", () => {
  beforeEach(() => store.clear());

  it("is seen once per account on this phone", async () => {
    expect(await tourSeen("ayse")).toBe(false);
    markTourSeen("ayse");
    await Promise.resolve();
    expect(await tourSeen("ayse")).toBe(true);
    // Another account on the same phone still gets it.
    expect(await tourSeen("mehmet")).toBe(false);
  });

  it("keeps the phone's own mark without a server, apart from the accounts'", () => {
    expect(tourSeenKey(null)).toBe("vagabonds-map-tour-seen");
    expect(tourSeenKey("ayse")).toBe("vagabonds-map-tour-seen:ayse");
  });
});
