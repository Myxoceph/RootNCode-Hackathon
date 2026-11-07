import {
  JOURNAL_PHOTO_SEND_SIDE,
  JournalEntrySchema,
  JournalPageResponseSchema,
  JournalPhotoSchema,
  type JournalEntry,
  type JournalLayout,
  type JournalPageResponse,
  type JournalPhoto,
} from "@vagabonds/contracts";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";

import { getMessages } from "@/i18n";

import { sessionRejected, signedInToken } from "./community";
import { resolveApiUrl } from "./config";
import { DataError } from "./errors";
import { request, statusError, type RequestOptions } from "./http";
import { uploadFile } from "./upload";

const UPLOAD_TIMEOUT_MS = 90_000;
const SEND_QUALITY = 0.85;
const words = () => getMessages().journal.errors;

function errorFor(token: string) {
  return (status: number, code: string | null, details: string[]) => {
    if (status === 401) sessionRejected(token);
    const known: Record<string, string> = {
      JOURNAL_ENTRY_FULL: words().entryFull,
      JOURNAL_FULL: words().journalFull,
      JOURNAL_PHOTO_LIMIT: words().dayLimit,
      INVALID_IMAGE: words().unreadable,
      UNSUPPORTED_MEDIA_TYPE: words().unreadable,
    };
    const message = status === 413 ? words().tooLarge : code ? known[code] : undefined;
    return message ? new DataError("rejected", message, details) : statusError(status, code, details);
  };
}

async function call<T>(path: string, schema: Parameters<typeof request<T>>[1], options: Omit<RequestOptions, "token" | "errorFor"> = {}): Promise<T> {
  const token = await signedInToken(words().signIn);
  return (await request(`${resolveApiUrl()}${path}`, schema, { ...options, token, errorFor: errorFor(token) }))!;
}

export const fetchJournalPage = (cursor: string | null): Promise<JournalPageResponse> =>
  call(`/me/journal${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, JournalPageResponseSchema);

export const createJournalEntry = (text: string | null, layout: JournalLayout | null): Promise<JournalEntry> => call("/me/journal", JournalEntrySchema, { body: { text, layout } });

export const updateJournalEntry = (id: string, text: string | null, layout?: JournalLayout): Promise<JournalEntry> =>
  call(`/me/journal/${id}`, JournalEntrySchema, { body: layout === undefined ? { text } : { text, layout }, method: "PATCH" });

/** Answers 204: the schema is never read. */
export const deleteJournalEntry = async (id: string): Promise<void> => {
  await call(`/me/journal/${id}`, JournalEntrySchema, { method: "DELETE" });
};

export const deleteJournalPhoto = async (id: string): Promise<void> => {
  await call(`/me/journal/photos/${id}`, JournalPhotoSchema, { method: "DELETE" });
};

/** A photo's signed path as an address an image can load. */
export const journalImageUri = (path: string): string => `${resolveApiUrl()}${path}`;

/**
 * A JPEG no longer than `JOURNAL_PHOTO_SEND_SIDE`, off the JavaScript thread: a phone's HEIC becomes
 * something the server reads, and a 12 MB photo a light upload. The sizes the app shows are the server's.
 */
async function prepare(uri: string, width: number, height: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > JOURNAL_PHOTO_SEND_SIDE) {
    context.resize(width >= height ? { width: JOURNAL_PHOTO_SEND_SIDE } : { height: JOURNAL_PHOTO_SEND_SIDE });
  }
  const rendered = await context.renderAsync();
  try {
    return (await rendered.saveAsync({ format: SaveFormat.JPEG, compress: SEND_QUALITY })).uri;
  } finally {
    rendered.release();
    context.release();
  }
}

/** Sends a photo picked on this device to the entry; it answers once the server has made its sizes. */
export async function uploadJournalPhoto(entryId: string, photoId: string, uri: string, width: number, height: number): Promise<JournalPhoto> {
  const token = await signedInToken(words().signIn);
  const url = `${resolveApiUrl()}/me/journal/${entryId}/photos?id=${photoId}`;
  const type = "image/jpeg";
  let prepared: string;
  try {
    prepared = await prepare(uri, width, height);
  } catch (error) {
    throw new DataError("rejected", words().unreadable, [String(error)]);
  }
  if (Platform.OS !== "web") {
    try {
      return await uploadFile(prepared, url, JournalPhotoSchema, { type, token, errorFor: errorFor(token), timeoutMs: UPLOAD_TIMEOUT_MS });
    } finally {
      // The copy made for sending is the visitor's private photo: it does not stay in the cache.
      try {
        new File(prepared).delete();
      } catch {
        // Already gone; the system clears its cache in any case.
      }
    }
  }
  let data: Blob;
  try {
    data = await (await fetch(prepared)).blob();
  } catch (error) {
    throw new DataError("rejected", words().unreadable, [String(error)]);
  }
  return (await request(url, JournalPhotoSchema, { rawBody: { data, type }, token, timeoutMs: UPLOAD_TIMEOUT_MS, errorFor: errorFor(token) }))!;
}
