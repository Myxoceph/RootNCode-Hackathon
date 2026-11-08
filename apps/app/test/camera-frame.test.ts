import { describe, expect, it } from "vitest";

import { isCameraFrame } from "../src/lib/camera-frame";

const CACHE = "file:///var/app/Caches/";

describe("isCameraFrame", () => {
  it("takes the camera's own frame in the cache", () => {
    expect(isCameraFrame(`${CACHE}inscription-propose-1731000000000.jpg`, CACHE)).toBe(true);
    expect(isCameraFrame("file:///var/app/Caches/inscription-propose-1.jpg", "file:///var/app/Caches")).toBe(true);
  });

  it("turns away what a link could set", () => {
    expect(isCameraFrame("https://example.com/inscription-propose-1.jpg", CACHE)).toBe(false);
    expect(isCameraFrame(`${CACHE}../Documents/inscription-propose-1.jpg`, CACHE)).toBe(false);
    expect(isCameraFrame(`${CACHE}inscription-ask.jpg`, CACHE)).toBe(false);
    expect(isCameraFrame("file:///etc/inscription-propose-1.jpg", CACHE)).toBe(false);
  });
});
