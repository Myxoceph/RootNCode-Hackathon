import { CreateContributionRequestSchema, NicknameSchema, normalizeContributionText } from "@vagabonds/contracts";
import { describe, expect, it } from "vitest";
import { hashToken, newToken } from "../src/modules/community/auth.ts";
import { toPulseItems } from "../src/modules/community/community.mapper.ts";

describe("contribution text", () => {
  it("removes control and bidi-override characters and collapses blank lines", () => {
    const text = "  Kapı\u0000 sabah 9'da‮ açılıyor.\r\n\r\n\r\n\r\nAvlu\tserin.   \n";
    expect(normalizeContributionText(text)).toBe("Kapı sabah 9'da açılıyor.\n\nAvlu serin.");
  });

  it("enforces the length after cleaning", () => {
    expect(CreateContributionRequestSchema.safeParse({ kind: "tip", body: "  kısa\u0000\u0000\u0000   " }).success).toBe(false);
    expect(CreateContributionRequestSchema.safeParse({ kind: "tip", body: "x".repeat(1001) }).success).toBe(false);
    expect(CreateContributionRequestSchema.safeParse({ kind: "tip", body: "Cuma günleri kalabalık." }).success).toBe(true);
  });

  it("does not accept photo contributions yet", () => {
    expect(CreateContributionRequestSchema.safeParse({ kind: "photo", body: "Avludan bir fotoğraf." }).success).toBe(false);
  });
});

describe("nickname", () => {
  it("accepts Turkish letters, digits and simple separators", () => {
    expect(NicknameSchema.parse("  Gezgin Ayşe_34 ")).toBe("Gezgin Ayşe_34");
  });

  it("rejects markup, symbols and wrong lengths", () => {
    for (const bad of ["<b>x</b>", "a", "x".repeat(33), "-başta", "ali@ev"]) {
      expect(NicknameSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("tokens", () => {
  it("are random, prefixed and stored only as a SHA-256 hex digest", () => {
    const a = newToken();
    const b = newToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^vgb_[A-Za-z0-9_-]{43}$/);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
  });
});

describe("pulse items", () => {
  const records = {
    tips: [{ id: 7n, text_tr: "Sabah erken gidin.", text_en: "Go early.", origin: "field_visit", collected_at: new Date("2026-10-01") }],
    community: [
      {
        id: "0b6f3c1e-1d6a-4c7e-9a43-6b1f2e9d8c11",
        asset_id: "bursa-osmangazi-ulucami",
        kind: "memory",
        body: "Dedemle burada bayram namazı kılardık.",
        status: "approved",
        created_at: new Date("2026-10-19T08:00:00Z"),
        reviewed_at: new Date("2026-10-19T09:00:00Z"),
        reject_reason: null,
        user: { nickname: "Gezgin" },
      },
    ],
    communityTotal: 1,
  };

  it("lists dataset tips first, in the requested language, then community items with their author", () => {
    expect(toPulseItems(records, "en")).toEqual([
      { id: "tip-7", kind: "tip", text: "Go early.", origin: "field_visit", author: null, date: "2026-10-01" },
      {
        id: "0b6f3c1e-1d6a-4c7e-9a43-6b1f2e9d8c11",
        kind: "memory",
        text: "Dedemle burada bayram namazı kılardık.",
        origin: "community",
        author: "Gezgin",
        date: "2026-10-19",
      },
    ]);
  });
});
