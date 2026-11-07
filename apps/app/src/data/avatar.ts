import { AppUserSchema, type AppUser } from "@vagabonds/contracts";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";

import { keepUser, sessionRejected, signedInToken } from "./community";
import { getMessages } from "@/i18n";

import { resolveApiUrl } from "./config";
import { DataError } from "./errors";
import { request, statusError } from "./http";
import { uploadFile } from "./upload";

const TIMEOUT_MS = 30_000;
const words = () => getMessages().moreErrors.avatar;

/**
 * Puts the profile photo (`PUT /me/avatar`): the image picker's file on a phone, a blob or data URL
 * on the web. JPEG or PNG, at most 2 MB; resize a camera photo before sending it.
 */
export async function uploadAvatar(uri: string, type: "image/jpeg" | "image/png"): Promise<AppUser> {
  const token = await signedInToken(getMessages().moreErrors.signIn.setPhoto);
  const url = `${resolveApiUrl()}/me/avatar`;
  const errorFor = (status: number, code: string | null, details: string[]) => {
    if (status === 401) sessionRejected(token);
    const message = status === 413 ? words().tooLarge : code === "INVALID_IMAGE" || code === "UNSUPPORTED_MEDIA_TYPE" ? words()[code] : undefined;
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
      throw new DataError("rejected", words().unreadable, [uri, String(error)]);
    }
    user = (await request(url, AppUserSchema, { rawBody: { data, type }, method: "PUT", token, timeoutMs: TIMEOUT_MS, errorFor }))!;
  }
  await keepUser(user, token);
  return user;
}

/** A picked photo is sent at most this long on its longer side, as a JPEG: well under the 2 MB limit. */
const SEND_SIDE = 900;
const SEND_QUALITY = 0.85;

/** Puts a photo picked on this device as the profile photo, made smaller first. */
export async function uploadPickedAvatar(uri: string, width: number, height: number): Promise<AppUser> {
  let prepared: string;
  try {
    const context = ImageManipulator.manipulate(uri);
    if (Math.max(width, height) > SEND_SIDE) context.resize(width >= height ? { width: SEND_SIDE } : { height: SEND_SIDE });
    const rendered = await context.renderAsync();
    try {
      prepared = (await rendered.saveAsync({ format: SaveFormat.JPEG, compress: SEND_QUALITY })).uri;
    } finally {
      rendered.release();
      context.release();
    }
  } catch (error) {
    throw new DataError("rejected", words().unreadable, [uri, String(error)]);
  }
  return uploadAvatar(prepared, "image/jpeg");
}
