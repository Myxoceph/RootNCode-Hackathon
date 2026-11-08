import {
  InscriptionProposalListResponseSchema,
  InscriptionProposalResponseSchema,
  type InscriptionProposal,
  type InscriptionProposalQuery,
} from "@vagabonds/contracts";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Platform } from "react-native";

import { getMessages } from "@/i18n";

import { accountToken, communityAvailable, sessionRejected, signedInToken, useCommunity } from "./community";
import { resolveApiUrl } from "./config";
import { DataError } from "./errors";
import { request, statusError } from "./http";
import { useResource, type ResourceWithRetry } from "./hooks";
import { uploadFile } from "./upload";

/**
 * Kitabe Gönüllüleri (Veri Döngüsü H7/Y5), the visitor's side: the photo of an inscription that is not
 * in the app yet goes to an expert (`POST /assets/:id/inscription-proposals`), who reads it from the
 * photo; the visitor follows where it stands in Profil (`GET /me/inscription-proposals`). Accounts only.
 */

/** A photo, a model call and the expert's queue each: the API waits up to 45 s for the model's look. */
const TIMEOUT_MS = 60_000;
/** Sharp enough for the expert to read the letters; the API keeps at most 1600 px of it. */
const SEND_SIDE = 2048;
const SEND_QUALITY = 0.9;

const words = () => getMessages().moreErrors.inscription;

let sent = 0;
const listeners = new Set<() => void>();
const bump = () => {
  sent += 1;
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function errorFor(token: string) {
  return (status: number, code: string | null, details: string[]) => {
    if (status === 401) sessionRejected(token);
    const known = words() as Record<string, string>;
    const message = status === 413 ? known.tooLarge : code && known[code] ? known[code] : undefined;
    return message ? new DataError("rejected", message, details, code ?? undefined) : statusError(status, code, details);
  };
}

/** A picked or taken photo as a JPEG no larger than the expert needs (and without its EXIF). */
async function prepare(uri: string, width: number, height: number): Promise<string> {
  try {
    const context = ImageManipulator.manipulate(uri);
    if (Math.max(width, height) > SEND_SIDE) context.resize(width >= height ? { width: SEND_SIDE } : { height: SEND_SIDE });
    const rendered = await context.renderAsync();
    try {
      return (await rendered.saveAsync({ format: SaveFormat.JPEG, compress: SEND_QUALITY })).uri;
    } finally {
      rendered.release();
      context.release();
    }
  } catch (error) {
    throw new DataError("rejected", words().unreadable, [uri, String(error)]);
  }
}

/** Sends the photo of an inscription on `assetId`, with where it is and a note when given. */
export async function sendInscriptionProposal(
  assetId: string,
  photo: { uri: string; width: number; height: number },
  extra: InscriptionProposalQuery,
): Promise<InscriptionProposal> {
  if (!communityAvailable) throw new DataError("unavailable", words().needsServer);
  const token = await signedInToken(getMessages().moreErrors.signIn.inscription);
  const prepared = await prepare(photo.uri, photo.width, photo.height);
  const query = new URLSearchParams();
  if (extra.location?.trim()) query.set("location", extra.location.trim());
  if (extra.note?.trim()) query.set("note", extra.note.trim());
  const url = `${resolveApiUrl()}/assets/${encodeURIComponent(assetId)}/inscription-proposals${query.size > 0 ? `?${query}` : ""}`;
  let answer;
  if (Platform.OS !== "web") {
    answer = await uploadFile(prepared, url, InscriptionProposalResponseSchema, { type: "image/jpeg", token, errorFor: errorFor(token), timeoutMs: TIMEOUT_MS });
  } else {
    let data: Blob;
    try {
      data = await (await fetch(prepared)).blob();
    } catch (error) {
      throw new DataError("rejected", words().unreadable, [prepared, String(error)]);
    }
    answer = (await request(url, InscriptionProposalResponseSchema, { rawBody: { data, type: "image/jpeg" }, token, timeoutMs: TIMEOUT_MS, errorFor: errorFor(token) }))!;
  }
  bump();
  return answer.proposal;
}

/**
 * Whether this server takes inscriptions: the routes are there only with Veri Döngüsü on
 * (INTAKE_ENABLED), so where they are not the app offers nothing and stays as it was. Learnt once per
 * account from its list (`/me/inscription-proposals`); a 404 means off.
 */
const probe: { user: string | null; on: boolean | null } = { user: null, on: null };
const OFF = "INSCRIPTION_VOLUNTEERS_OFF";

/** The inscriptions the account sent, newest first; null without an account. */
export async function fetchMyInscriptionProposals(): Promise<InscriptionProposal[] | null> {
  const token = await accountToken();
  if (token === null) return null;
  const errors = errorFor(token);
  const answer = await request(`${resolveApiUrl()}/me/inscription-proposals`, InscriptionProposalListResponseSchema, {
    token,
    errorFor: (status, code, details) => (status === 404 ? new DataError("unavailable", words().needsServer, details, OFF) : errors(status, code, details)),
  });
  return answer!.items;
}

function settle(user: string, on: boolean) {
  if (probe.user !== user || probe.on === on) return;
  probe.on = on;
  listeners.forEach((listener) => listener());
}

/** True once the server is known to take inscriptions from this account; false until then and when it does not. */
export function useInscriptionVolunteers(): boolean {
  const { user } = useCommunity();
  const id = user?.username ? user.id : null;
  useSyncExternalStore(subscribe, () => `${probe.user}:${probe.on}`, () => "");
  useEffect(() => {
    if (!communityAvailable || id === null || probe.user === id) return;
    probe.user = id;
    probe.on = null;
    fetchMyInscriptionProposals().then(
      () => settle(id, true),
      // Only a missing route says off; a failed request is asked again with the next account or start.
      (error: unknown) => {
        if (error instanceof DataError && error.code === OFF) settle(id, false);
        else if (probe.user === id) probe.user = null;
      },
    );
  }, [id]);
  return id !== null && probe.user === id && probe.on === true;
}

/** Profil · Kitabelerim: fetched again for a new account and after each one sent. */
export function useMyInscriptionProposals(): ResourceWithRetry<InscriptionProposal[] | null> {
  const { user } = useCommunity();
  const count = useSyncExternalStore(subscribe, () => sent, () => sent);
  const key = user === undefined ? null : `${user?.id ?? ""}:${count}`;
  const load = useCallback(() => (key === null ? new Promise<never>(() => {}) : fetchMyInscriptionProposals()), [key]);
  return useResource(load);
}

/** The photo's address: the API gives its media path, served by the API itself when local. */
export function proposalPhotoUri(photo: string): string | null {
  if (!photo) return null;
  return photo.startsWith("/") ? `${resolveApiUrl()}${photo}` : photo;
}
