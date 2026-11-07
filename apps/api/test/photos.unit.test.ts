import { describe, expect, it } from "vitest";
import { checkImage, InvalidImageError } from "../src/modules/community/photo-image.ts";
import { createPhotoUrls } from "../src/modules/community/photo-urls.ts";
import { GPS_MARKER, jpegWithExif, pngWithText } from "./helpers/images.ts";

describe("checkImage", () => {
  it("reads a JPEG's size and drops EXIF and comments but keeps JFIF and the colour profile", () => {
    const image = checkImage(jpegWithExif(1200, 800));
    expect(image).toMatchObject({ type: "image/jpeg", width: 1200, height: 800 });
    const text = image.bytes.toString("latin1");
    expect(text).not.toContain(GPS_MARKER);
    expect(text).not.toContain("Ahmet's phone");
    expect(text).toContain("JFIF");
    expect(text).toContain("ICC_PROFILE");
    // The scan data is copied unchanged up to the end marker.
    expect(image.bytes.subarray(-5)).toEqual(Buffer.from([0x12, 0x34, 0x56, 0xff, 0xd9]));
  });

  it("reads a PNG's size and drops text and EXIF chunks", () => {
    const image = checkImage(pngWithText(640, 480));
    expect(image).toMatchObject({ type: "image/png", width: 640, height: 480 });
    const text = image.bytes.toString("latin1");
    expect(text).not.toContain("Ayse");
    expect(text).not.toContain(GPS_MARKER);
    expect(text).toContain("IDAT");
  });

  it("rejects other formats and broken files", () => {
    expect(() => checkImage(Buffer.from("GIF89a....."))).toThrow(InvalidImageError);
    expect(() => checkImage(jpegWithExif().subarray(0, 30))).toThrow(InvalidImageError);
    expect(() => checkImage(pngWithText().subarray(0, 40))).toThrow(InvalidImageError);
  });
});

describe("photo paths", () => {
  const urls = createPhotoUrls(Buffer.alloc(32, 7));
  const id = "0b6f3c1e-1d6a-4c7e-9a43-6b1f2e9d8c11";

  it("signs a path that verifies for that photo until it expires", () => {
    const now = Date.UTC(2026, 9, 30, 12, 15);
    const params = new URL(urls.signedPath(id, now), "http://api.test").searchParams;
    const exp = params.get("exp") ?? undefined;
    const sig = params.get("sig") ?? undefined;
    expect(urls.verify(id, exp, sig, now)).toBe(true);
    expect(urls.verify("1b6f3c1e-1d6a-4c7e-9a43-6b1f2e9d8c11", exp, sig, now)).toBe(false);
    expect(urls.verify(id, exp, `${sig}x`, now)).toBe(false);
    expect(urls.verify(id, exp, sig, Number(exp) + 1)).toBe(false);
    expect(urls.verify(id, undefined, undefined, now)).toBe(false);
  });

  it("gives the same path within an hour, so it can be cached", () => {
    const now = Date.UTC(2026, 9, 30, 12, 0);
    expect(urls.signedPath(id, now + 60_000)).toBe(urls.signedPath(id, now + 30 * 60_000));
  });
});
