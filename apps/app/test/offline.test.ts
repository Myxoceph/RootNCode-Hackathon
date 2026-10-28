import { beforeEach, describe, expect, it, vi } from "vitest";

type Offline = typeof import("../src/data/offline");
let offline: Offline;

beforeEach(async () => {
  vi.resetModules();
  offline = await import("../src/data/offline");
});

describe("offline banner state", () => {
  it("shows since the oldest stored answer on screen", () => {
    offline.markStale("asset:tr:a", 2000);
    offline.markStale("asset:tr:b", 1000);
    expect(offline.getOfflineState().since).toBe(1000);
  });

  it("stays while another request is still answered from storage", () => {
    offline.markStale("asset:tr:a", 1000);
    offline.markStale("cities:tr", 3000);
    offline.markFresh("cities:tr");
    expect(offline.getOfflineState().since).toBe(1000);
    offline.markFresh("asset:tr:a");
    expect(offline.getOfflineState().since).toBeNull();
  });

  it("is not cleared by a fresh answer to a request that was never stale", () => {
    offline.markStale("asset:tr:a", 1000);
    offline.markFresh("asset:tr:b");
    expect(offline.getOfflineState().since).toBe(1000);
  });

  it("forgets everything on Yenile and bumps the epoch the hooks refetch on", () => {
    offline.markStale("asset:tr:a", 1000);
    offline.refreshData();
    expect(offline.getOfflineState()).toEqual({ since: null, epoch: 1 });
  });
});
