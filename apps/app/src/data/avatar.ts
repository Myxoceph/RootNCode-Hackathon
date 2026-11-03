import { AppUserSchema, type AppUser } from "@vagabonds/contracts";
import { Platform } from "react-native";

import { keepUser, sessionRejected, signedInToken } from "./community";
import { resolveApiUrl } from "./config";
import { DataError } from "./errors";
import { request, statusError } from "./http";
import { uploadFile } from "./upload";

const TIMEOUT_MS = 30_000;
const MESSAGES: Record<string, string> = {
  INVALID_IMAGE: "Bu fotoğraf kullanılamıyor: JPEG ya da PNG olmalı, kenarları en az 64 piksel.",
  UNSUPPORTED_MEDIA_TYPE: "Fotoğraf JPEG ya da PNG olmalı.",
};
const TOO_LARGE = "Fotoğraf çok büyük: en çok 2 MB olabilir. Daha küçük bir fotoğraf seç.";

/**
 * Puts the profile photo (`PUT /me/avatar`): the image picker's file on a phone, a blob or data URL
 * on the web. JPEG or PNG, at most 2 MB; resize a camera photo before sending it.
 */
export async function uploadAvatar(uri: string, type: "image/jpeg" | "image/png"): Promise<AppUser> {
  const token = await signedInToken("Profil fotoğrafı koymak");
  const url = `${resolveApiUrl()}/me/avatar`;
  const errorFor = (status: number, code: string | null, details: string[]) => {
    if (status === 401) sessionRejected(token);
    const message = status === 413 ? TOO_LARGE : code ? MESSAGES[code] : undefined;
    return message ? new DataError("rejected", message, details) : statusError(status, code, details);
  };
  let user: AppUser;
  if (Platform.OS !== "web") {
    user = await uploadFile(uri, url, AppUserSchema, { type, token, errorFor, timeoutMs: TIMEOUT_MS, method: "PUT" });
  } else {
    let data: Blob;
    try {
      data = await (await fetch(uri)).blob();
    } catch (error) {
      throw new DataError("rejected", "Fotoğraf okunamadı. Tekrar dene.", [uri, String(error)]);
    }
    user = (await request(url, AppUserSchema, { rawBody: { data, type }, method: "PUT", token, timeoutMs: TIMEOUT_MS, errorFor }))!;
  }
  await keepUser(user, token);
  return user;
}
