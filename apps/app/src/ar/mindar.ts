/** MindAR, bundled into the app by scripts/vendor-web-libs.mts. Pinned: `.mind` files are tied to it. */
export const MINDAR_VERSION = "1.2.5";

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
  | "unknown";

export type TrackerStep = "page" | "library" | "camera" | "video" | "targets";

/** Messages the tracker page posts to the app. */
export type TrackerEvent =
  /** Camera and MindAR are running; searching for a target from now on. */
  | { type: "ready"; videoWidth: number; videoHeight: number }
  | { type: "found"; target: number }
  | { type: "lost"; target: number }
  /** Start-up progress, so a page that stalls shows where. */
  | { type: "step"; step: TrackerStep }
  /** Tracker frames processed per second over the last two seconds. */
  | { type: "stats"; fps: number }
  | { type: "error"; reason: TrackerFailure; message: string };

export function parseTrackerEvent(data: unknown): TrackerEvent | null {
  if (typeof data !== "string") return null;
  try {
    const event = JSON.parse(data) as TrackerEvent;
    return typeof event?.type === "string" ? event : null;
  } catch {
    return null;
  }
}
