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
  | "unknown";

/** What to tell a person when the tracker cannot start. */
export const trackerFailureText: Record<TrackerFailure, string> = {
  "camera-denied": "Kamera izni verilmedi. Telefonun ayarlarından izin verip yeniden dene.",
  "camera-unavailable": "Kamera açılamadı. Başka bir uygulama kullanıyor olabilir.",
  "camera-unsupported": "Bu WebView kameraya erişemiyor.",
  "load-failed": "AR kütüphanesi yüklenemedi.",
  unknown: "AR başlatılamadı.",
};

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
