import { describe, expect, it } from "vitest";

import type { A11ySettings } from "../src/settings/a11y-settings";
import { parseA11ySettings } from "../src/settings/a11y-storage";
import { focusRingCss } from "../src/settings/focus-ring";

const defaults: A11ySettings = {
  audioDescription: true,
  captions: true,
  largeText: false,
  highContrast: false,
  strongFocusRing: true,
  soundEffects: true,
  haptics: true,
};

describe("saved accessibility switches", () => {
  it("keeps the switches that were saved", () => {
    expect(parseA11ySettings(JSON.stringify({ largeText: true, audioDescription: false }), defaults)).toEqual({
      largeText: true,
      audioDescription: false,
    });
  });

  it("keeps the sound and vibration switches too", () => {
    expect(parseA11ySettings(JSON.stringify({ soundEffects: false, haptics: false }), defaults)).toEqual({ soundEffects: false, haptics: false });
  });

  it("leaves out what is not a switch, or not one of them", () => {
    expect(parseA11ySettings(JSON.stringify({ largeText: "yes", unknown: true, captions: false }), defaults)).toEqual({ captions: false });
  });

  it("gives nothing for an empty or broken store", () => {
    expect(parseA11ySettings(null, defaults)).toEqual({});
    expect(parseA11ySettings("{not json", defaults)).toEqual({});
    expect(parseA11ySettings("[]", defaults)).toEqual({});
  });
});

describe("the web's focus ring", () => {
  it("is thick, set off and wins over the controls' own when the switch is on", () => {
    const css = focusRingCss("#A05568", true);
    expect(css).toContain("outline-width: 3px !important");
    expect(css).toContain("outline-offset: 3px !important");
    expect(css).toContain("outline-color: #A05568 !important");
  });

  it("is still drawn, thinner, when the switch is off", () => {
    const css = focusRingCss("#A05568", false);
    expect(css).toContain("outline-width: 2px;");
    expect(css).toContain("outline-style: solid;");
    expect(css).not.toContain("!important");
  });

  it("leaves fields to their own focused edge", () => {
    expect(focusRingCss("#000", true)).toContain(":focus-visible:not(input):not(textarea)");
  });
});
