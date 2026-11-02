import { describe, expect, it } from "vitest";

import { yearOfDating } from "../src/lib/dating";

describe("yearOfDating", () => {
  it("takes the Gregorian year after the Hijri one", () => {
    expect(yearOfDating("H. 802 / M. 1399-1400")).toBe("1399");
  });

  it("skips a day and month between M. and the year", () => {
    expect(yearOfDating("H. 804 / M. 8 Mart 1402")).toBe("1402");
    expect(yearOfDating("H. 816 / M. Aralık 1413")).toBe("1413");
  });

  it("falls back to any year, then to the dating itself", () => {
    expect(yearOfDating("1573")).toBe("1573");
    expect(yearOfDating("XIV. yüzyıl")).toBe("XIV. yüzyıl");
    expect(yearOfDating(null)).toBeNull();
  });
});
