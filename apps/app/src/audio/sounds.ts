import type { CapsuleType } from "@/content/capsules";

/** The capsules' sounds, in the app itself: they start at once, without a connection. */
export const capsuleSounds: Record<CapsuleType, number> = {
  cami: require("./capsules/cami.mp3"),
  turbe: require("./capsules/turbe.mp3"),
  sifahane: require("./capsules/darussifa.mp3"),
  kervan: require("./capsules/han.mp3"),
  medrese: require("./capsules/medrese.mp3"),
  hamam: require("./capsules/hamam.mp3"),
  su: require("./capsules/su.mp3"),
  tekke: require("./capsules/tekke.mp3"),
  imaret: require("./capsules/imaret.mp3"),
  carsi: require("./capsules/carsi.mp3"),
};
