import { beforeEach, describe, expect, it, vi } from "vitest";

import { messages, type Messages } from "../src/i18n/messages";

/** Every text in a dictionary, with its path; functions are called with sample arguments. */
function texts(node: unknown, path = ""): Array<[string, string]> {
  if (typeof node === "string") return [[path, node]];
  if (typeof node === "function") {
    const args = Array.from({ length: node.length }, (_, i) => (i === 0 ? "Bursa" : 3));
    return texts((node as (...a: unknown[]) => unknown)(...args), path);
  }
  if (Array.isArray(node)) return node.flatMap((item, i) => texts(item, `${path}[${i}]`));
  if (node && typeof node === "object") return Object.entries(node).flatMap(([key, value]) => texts(value, path ? `${path}.${key}` : key));
  return [];
}

describe("the dictionaries", () => {
  it("say something for every entry, in both languages", () => {
    for (const lang of ["tr", "en"] as const) {
      const empty = texts(messages[lang]).filter(([, text]) => text.trim() === "");
      expect(empty.map(([path]) => `${lang}.${path}`)).toEqual([]);
    }
  });

  it("have the same entries in both languages", () => {
    const paths = (m: Messages) => texts(m).map(([path]) => path).sort();
    expect(paths(messages.en)).toEqual(paths(messages.tr));
  });

  it("keep Turkish letters out of the English, but for names", () => {
    // Names of places, the Turkish language and the team keep their own spelling.
    const names = /Türkiye|Türkçe|KÖK&KOD/g;
    const turkish = texts(messages.en).filter(([, text]) => /[çğıöşüÇĞİÖŞÜ]/.test(text.replace(names, "")));
    expect(turkish.map(([path]) => path)).toEqual([]);
  });
});

describe("the app's language", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("is the phone's when it is English, Turkish otherwise", async () => {
    const { deviceLang } = await import("../src/i18n/lang");
    expect(deviceLang("en-GB")).toBe("en");
    expect(deviceLang("en_US")).toBe("en");
    expect(deviceLang("tr-TR")).toBe("tr");
    expect(deviceLang("de-DE")).toBe("tr");
    expect(deviceLang(undefined)).toBe("tr");
  });

  it("follows a choice at once and keeps it on the device", async () => {
    const { store } = await import("./mocks/async-storage");
    const { getLang, setLang } = await import("../src/i18n/lang");
    const { getMessages } = await import("../src/i18n");
    expect(getLang()).toBe("tr");
    setLang("en");
    expect(getLang()).toBe("en");
    expect(getMessages().tabs.map).toBe("Map");
    await Promise.resolve();
    expect(store.get("vagabonds-lang")).toBe("en");
    setLang("tr");
  });
});
