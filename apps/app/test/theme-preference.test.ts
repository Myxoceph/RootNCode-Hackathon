import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_THEME_PREFERENCE, resolveColorScheme } from "../src/theme/theme-preference";
import { readThemePreference, writeThemePreference } from "../src/theme/theme-storage";
import { store } from "./mocks/async-storage";

describe("theme preference", () => {
  it("opens light by default, whatever the device uses", () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe("light");
    expect(resolveColorScheme(DEFAULT_THEME_PREFERENCE, "dark")).toBe("light");
  });

  it("keeps a light or dark choice regardless of the device", () => {
    expect(resolveColorScheme("dark", "light")).toBe("dark");
    expect(resolveColorScheme("light", "dark")).toBe("light");
  });

  it("follows the device when the choice is system", () => {
    expect(resolveColorScheme("system", "dark")).toBe("dark");
    expect(resolveColorScheme("system", "light")).toBe("light");
  });
});

describe("saved theme preference", () => {
  beforeEach(() => store.clear());

  it("opens with the default when nothing is saved", async () => {
    expect(await readThemePreference()).toBe(DEFAULT_THEME_PREFERENCE);
  });

  it("reads back the saved choice after a restart", async () => {
    await writeThemePreference("dark");
    expect(await readThemePreference()).toBe("dark");
    await writeThemePreference("system");
    expect(await readThemePreference()).toBe("system");
  });

  it("ignores a value it does not know", async () => {
    store.set("vagabonds-theme-preference", "sepia");
    expect(await readThemePreference()).toBe(DEFAULT_THEME_PREFERENCE);
  });
});
