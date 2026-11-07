import type { AdminAssetRecord } from "@vagabonds/contracts";
import { describe, expect, it } from "vitest";

import { withBlocks } from "../src/lib/dossier-custom";
import { mergePhotos, placementsIn } from "../src/lib/dossier-photos";

type Photo = AdminAssetRecord["media"][number];
type Block = AdminAssetRecord["customBlocks"][number];

const photo = (key: string, change: Partial<Photo> = {}): Photo => ({
  key,
  caption: { tr: key, en: null },
  alt: { tr: key, en: null },
  isCover: false,
  dossierAfter: null,
  uploaded: false,
  ...change,
});
const block = (id: string, after: string): Block => ({ id, title: { tr: id, en: null }, body: { tr: "metin", en: null }, after });
const record = (media: Photo[], customBlocks: Block[] = []) => ({ media, customBlocks }) as unknown as AdminAssetRecord;

describe("the panel's photos after an upload or a removal", () => {
  it("adds the uploaded photo and keeps what was changed and not saved", () => {
    const draft = [photo("a", { caption: { tr: "Yeni yazı", en: null }, isCover: true }), photo("b")];
    const server = [photo("a", { isCover: true }), photo("b"), photo("p-new", { uploaded: true })];
    const merged = mergePhotos(draft, server);
    expect(merged.map((m) => m.key)).toEqual(["a", "b", "p-new"]);
    expect(merged[0]!.caption.tr).toBe("Yeni yazı");
    expect(merged.filter((m) => m.isCover).map((m) => m.key)).toEqual(["a"]);
  });

  it("keeps the draft's order", () => {
    const merged = mergePhotos([photo("b"), photo("a")], [photo("a"), photo("b")]);
    expect(merged.map((m) => m.key)).toEqual(["b", "a"]);
  });

  it("gives the cover to a photo uploaded as the cover", () => {
    const merged = mergePhotos([photo("a", { isCover: true })], [photo("a"), photo("p-new", { isCover: true, uploaded: true })]);
    expect(merged.filter((m) => m.isCover).map((m) => m.key)).toEqual(["p-new"]);
  });

  it("drops a removed photo, and a removed cover's place goes where the server put it", () => {
    const draft = [photo("p-old", { isCover: true, uploaded: true }), photo("b")];
    const merged = mergePhotos(draft, [photo("b", { isCover: true })]);
    expect(merged).toEqual([photo("b", { isCover: true })]);
  });

  it("reads each photo's place in the dossier from the record", () => {
    expect(placementsIn(record([photo("a", { dossierAfter: "timeline" }), photo("b")]))).toEqual({ a: "timeline" });
    expect(placementsIn(null)).toEqual({});
  });
});

describe("the dossier's added blocks", () => {
  it("only changes the blocks when none is taken out", () => {
    const before = record([photo("a", { dossierAfter: "custom:x" })], [block("x", "identity")]);
    const after = withBlocks(before, [{ ...block("x", "identity"), title: { tr: "Yeni", en: null } }]);
    expect(after.customBlocks[0]!.title.tr).toBe("Yeni");
    expect(after.media[0]!.dossierAfter).toBe("custom:x");
  });

  it("moves what followed a block taken out to where it stood", () => {
    const before = record([photo("a", { dossierAfter: "custom:x" }), photo("b", { dossierAfter: "facts" })], [block("x", "timeline"), block("y", "custom:x")]);
    const after = withBlocks(before, [block("y", "custom:x")]);
    expect(after.customBlocks).toEqual([block("y", "timeline")]);
    expect(after.media.map((m) => m.dossierAfter)).toEqual(["timeline", "facts"]);
  });

  it("follows a chain of blocks taken out together", () => {
    const before = record([photo("a", { dossierAfter: "custom:y" })], [block("x", "people"), block("y", "custom:x"), block("z", "custom:y")]);
    const after = withBlocks(before, [block("z", "custom:y")]);
    expect(after.customBlocks[0]!.after).toBe("people");
    expect(after.media[0]!.dossierAfter).toBe("people");
  });
});
