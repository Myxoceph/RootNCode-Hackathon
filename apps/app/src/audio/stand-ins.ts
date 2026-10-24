import type { CapsuleType } from "@/content/capsules";

/**
 * The web's synthesized ambiences, recorded for phones (scripts/render-capsule-sounds.mts):
 * they play until the CC0 recordings arrive (H9). The web synthesizes them live instead
 * (`stand-ins.web.ts`), so these files stay out of the web build.
 */
export const standInSounds: Record<CapsuleType, number> | null = {
  sifahane: require("./stand-ins/sifahane.m4a"),
  kervan: require("./stand-ins/kervan.m4a"),
  medrese: require("./stand-ins/medrese.m4a"),
  hamam: require("./stand-ins/hamam.m4a"),
};
