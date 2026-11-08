import { describe, expect, it } from "vitest";

import { dataLanguage } from "../src/lib/text-lang";

describe("dataLanguage", () => {
  it("marks Turkish data on an English page", () => {
    expect(dataLanguage("Yeşil Külliye'nin mimarı", "en")).toBe("tr");
    expect(dataLanguage("Niğbolu Savaşı'nda esir düşen gayrimüslim bir usta", "en")).toBe("tr");
  });

  it("leaves English that only names Turkish places", () => {
    expect(dataLanguage("The architect of the Yeşil complex in Bursa", "en")).toBeUndefined();
    expect(dataLanguage("Built by Hacı İvaz Paşa for the sultan", "en")).toBeUndefined();
  });

  it("never marks anything on a Turkish page, or empty text", () => {
    expect(dataLanguage("Yeşil Külliye'nin mimarı", "tr")).toBeUndefined();
    expect(dataLanguage("", "en")).toBeUndefined();
    expect(dataLanguage(null, "en")).toBeUndefined();
  });
});
