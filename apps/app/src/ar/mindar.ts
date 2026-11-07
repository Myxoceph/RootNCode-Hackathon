import { AR_MINDAR_VERSION } from "@vagabonds/contracts";

/**
 * MindAR, bundled into the app by scripts/vendor-web-libs.mts. Pinned in the contract:
 * `.mind` files only load in the release that compiled them, and the dataset's are compiled with it.
 */
export const MINDAR_VERSION = AR_MINDAR_VERSION;

/** Why the tracker page could not start. */
export type TrackerFailure =
  /** The user (or the OS) refused the camera. */
  | "camera-denied"
  /** No camera, or it is in use by another app. */
  | "camera-unavailable"
  /** The WebView or browser has no getUserMedia (old WebView, insecure page). */
  | "camera-unsupported"
  /** The bundled MindAR script did not run. */
  | "load-failed"
  /** The photo to compile on the device could not be downloaded (offline); a `.mind` file that does not download falls back to it. */
  | "image-unavailable"
  | "unknown";

export type TrackerStep = "page" | "library" | "compile" | "camera" | "video" | "targets";

/** Messages the tracker page posts to the app. */
export type TrackerEvent =
  /** Camera and MindAR are running; searching for a target from now on. */
  | { type: "ready"; videoWidth: number; videoHeight: number }
  | { type: "found"; target: number }
  | { type: "lost"; target: number }
  /** Compiling a photo target on the device, 0 to 1. */
  | { type: "compile"; progress: number }
  /** The compiled `.mind` file, base64, so the app can keep it and skip compiling next time. */
  | { type: "compiled"; mind: string }
  /** Start-up progress, so a page that stalls shows where. */
  | { type: "step"; step: TrackerStep }
  /** Tracker frames processed per second over the last two seconds. */
  | { type: "stats"; fps: number }
  /** Where a found target lies: its corners (top left, top right, bottom right, bottom left) as fractions of the view. */
  | { type: "pose"; target: number; corners: Array<[number, number]> }
  /** The frame frozen by `capture`, searched again: the target it shows, or null; `error` when the search itself failed. */
  | { type: "captured"; target: number | null; ms: number; error?: string }
  | { type: "error"; reason: TrackerFailure; message: string };

/** What the app asks of the tracker page: freeze a frame and check it, or let the camera run on. */
export type TrackerCommand = "capture" | "resume";

export function parseTrackerEvent(data: unknown): TrackerEvent | null {
  if (typeof data !== "string") return null;
  try {
    const event = JSON.parse(data) as TrackerEvent;
    return typeof event?.type === "string" ? event : null;
  } catch {
    return null;
  }
}
