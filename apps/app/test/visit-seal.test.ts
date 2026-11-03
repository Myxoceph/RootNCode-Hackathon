import type { AssetDetail, Media } from "@vagabonds/contracts";
import { describe, expect, it } from "vitest";

import { visitSealTarget } from "../src/lib/visit-seal";

function asset(...photos: Array<[subject: string | null, isCover?: boolean]>): AssetDetail {
  const media = photos.map(([subject, isCover = false], i) => ({ id: `m${i}`, kind: "photo", subject, isCover }) as unknown as Media);
  return { media } as unknown as AssetDetail;
}

describe("visitSealTarget", () => {
  it("prefers a part to frame over a view of the building", () => {
    expect(visitSealTarget(asset(["exterior", true], ["mihrab"], ["portal"]))?.part).toBe("Taçkapı");
  });

  it("falls back to a view of the building", () => {
    expect(visitSealTarget(asset(["aerial", true], ["photo"], ["exterior"]))?.part).toBe("Dış cephe");
  });

  it("uses the cover photo when no photo is sorted, but never one from above", () => {
    expect(visitSealTarget(asset(["photo"], ["photo", true]))).toMatchObject({ photo: { id: "m1" }, part: "Genel görünüm" });
    expect(visitSealTarget(asset(["aerial", true]))).toBeNull();
    expect(visitSealTarget(asset())).toBeNull();
  });
});
