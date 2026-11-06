import { describe, expect, it } from "vitest";

import { inCity } from "../src/lib/place-names";
import { dayLabel } from "../src/lib/welcome-lines";

describe("a city with its locative ending", () => {
  it("follows the city's last sounds", () => {
    expect(["Bursa", "Edirne", "Sinop", "Konya", "Hatay", "Kayseri", "İstanbul"].map(inCity)).toEqual([
      "Bursa'da",
      "Edirne'de",
      "Sinop'ta",
      "Konya'da",
      "Hatay'da",
      "Kayseri'de",
      "İstanbul'da",
    ]);
  });
});

describe("a forecast day's name", () => {
  const today = new Date(2026, 10, 6, 21, 30);
  it("is today, tomorrow, then the short weekday", () => {
    expect(dayLabel("2026-11-06", today, "tr")).toBe("Bugün");
    expect(dayLabel("2026-11-07", today, "tr")).toBe("Yarın");
    expect(dayLabel("2026-11-08", today, "tr")).toBe("Paz");
  });
});
