import { VisionAskResponseSchema, type VisionAskResponse } from "@vagabonds/contracts";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { accountToken, sessionRejected } from "./community";
import { resolveApiUrl } from "./config";
import { DataError } from "./errors";
import { statusError } from "./http";
import { uploadFile } from "./upload";

/**
 * Taşa Sor's API call: a photo of a detail of the asset, sent with a question to
 * `POST /vision/ask`. It needs the account, as Rehber does. Photos are not stored.
 */

/** Wide enough to read a carving or an inscription's letters; about 150 to 400 KB as JPEG. */
const PHOTO_WIDTH = 1024;
const PHOTO_QUALITY = 0.7;
/** The model answers in 1 to 8 s; the API gives up at 25 s. */
const ASK_TIMEOUT_MS = 30_000;

function visionError(status: number, code: string | null, details: string[]): DataError {
  if (code === "VISION_UNAVAILABLE") return new DataError("unavailable", "Taşa Sor şu an cevap veremiyor. Biraz sonra tekrar dene.", details, code);
  if (code === "ASSET_NOT_FOUND") return new DataError("rejected", "Bu eser bulunamadı.", details, code);
  if (status === 413) return new DataError("rejected", "Fotoğraf çok büyük. Tekrar çek.", details, code);
  if (status === 400 || status === 415) return new DataError("rejected", "Fotoğraf okunamadı. Tekrar çek.", details, code);
  return statusError(status, code, details);
}

/** The camera's photo at `uri`, made small enough to send; the new file's URI. */
export async function shrinkPhoto(uri: string): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: PHOTO_WIDTH });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG });
  return saved.uri;
}

/** What the photo at `uri` (a JPEG on the phone) shows of the asset `assetId`, answering `question`. */
export async function askStone(uri: string, assetId: string, question?: string, signal?: AbortSignal): Promise<VisionAskResponse> {
  const token = await accountToken();
  if (token === null) throw new DataError("rejected", "Taşa Sor için giriş yap.", ["/vision/ask"], "ACCOUNT_REQUIRED");
  const params = new URLSearchParams({ assetId, lang: "tr", ...(question && { question }) });
  return uploadFile(uri, `${resolveApiUrl()}/vision/ask?${params.toString()}`, VisionAskResponseSchema, {
    type: "image/jpeg",
    token,
    timeoutMs: ASK_TIMEOUT_MS,
    signal,
    errorFor: (status, code, details) => {
      if (status === 401) sessionRejected(token);
      return visionError(status, code, details);
    },
  });
}
