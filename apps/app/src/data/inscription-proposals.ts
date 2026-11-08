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

/** A small store: its listeners are told when its value changes. */
function signal() {
  const listeners = new Set<() => void>();
  return {
    notify: () => listeners.forEach((listener) => listener()),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Bumped on each inscription sent, so Kitabelerim asks again. */
let sent = 0;
const sentSignal = signal();
const bump = () => {
  sent += 1;
  sentSignal.notify();
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
    // Released however the work ends: a photo that cannot be decoded must not keep its native context.
    try {
      if (Math.max(width, height) > SEND_SIDE) context.resize(width >= height ? { width: SEND_SIDE } : { height: SEND_SIDE });
      const rendered = await context.renderAsync();
      try {
        return (await rendered.saveAsync({ format: SaveFormat.JPEG, compress: SEND_QUALITY })).uri;
      } finally {
        rendered.release();
      }
    } finally {
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
  // `toString`, not `size`: React Native's URLSearchParams may not have the newer `size`.
  const search = query.toString();
  const url = `${resolveApiUrl()}/assets/${encodeURIComponent(assetId)}/inscription-proposals${search ? `?${search}` : ""}`;
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
 * account from its list (`/me/inscription-proposals`): an answer means on, a 404 off. Any other
 * failure (no network) leaves it `unknown` and is asked again after PROBE_RETRY_MS, once for all
 * the screens that use it. The list the answer brought is kept for Kitabelerim's first look.
 */
export type VolunteersState = "unknown" | "on" | "off";
const probe = {
  user: null as string | null,
  state: "unknown" as VolunteersState,
  asking: false,
  /** No new question before this time (after a failure). */
  waitUntil: 0,
  timer: null as ReturnType<typeof setTimeout> | null,
  /** The list the last answer brought, with the `sent` it was for; taken once. */
  items: null as { sent: number; items: InscriptionProposal[] } | null,
};
const probeSignal = signal();
const OFF = "INSCRIPTION_VOLUNTEERS_OFF";
const PROBE_RETRY_MS = 30_000;

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

function ask(user: string) {
  if (probe.asking || Date.now() < probe.waitUntil) return;
  probe.asking = true;
  const askedAt = sent;
  const settle = (state: VolunteersState) => {
    if (probe.user !== user) return;
    probe.asking = false;
    probe.state = state;
    probeSignal.notify();
  };
  const later = () => {
    if (probe.user !== user) return;
    probe.asking = false;
    probe.waitUntil = Date.now() + PROBE_RETRY_MS;
    if (probe.timer) clearTimeout(probe.timer);
    probe.timer = setTimeout(() => {
      probe.timer = null;
      if (probe.user === user && probe.state === "unknown") ask(user);
    }, PROBE_RETRY_MS);
  };
  fetchMyInscriptionProposals().then(
    (items) => {
      // No token after all (signing in or out): nothing was asked, so nothing is known.
      if (items === null) return later();
      if (probe.user === user) probe.items = { sent: askedAt, items };
      settle("on");
    },
    (error: unknown) => (error instanceof DataError && error.code === OFF ? settle("off") : later()),
  );
}

/** Whether this server takes inscriptions from the signed-in account; `unknown` until it has said. */
export function useInscriptionVolunteersState(): VolunteersState {
  const { user } = useCommunity();
  const id = communityAvailable && user?.username ? user.id : null;
  useSyncExternalStore(probeSignal.subscribe, () => `${probe.user}:${probe.state}`, () => "");
  useEffect(() => {
    if (id === null) return;
    if (probe.user !== id) {
      // Another account: what the last one was told does not hold, and its answer is dropped.
      if (probe.timer) clearTimeout(probe.timer);
      Object.assign(probe, { user: id, state: "unknown", asking: false, waitUntil: 0, timer: null, items: null });
    }
    if (probe.state === "unknown") ask(id);
  }, [id]);
  if (id === null) return "off";
  return probe.user === id ? probe.state : "unknown";
}

/** True once the server is known to take inscriptions from this account. */
export const useInscriptionVolunteers = () => useInscriptionVolunteersState() === "on";

/** Profil · Kitabelerim: fetched again for a new account and after each one sent; the probe's list first. */
export function useMyInscriptionProposals(): ResourceWithRetry<InscriptionProposal[] | null> {
  const { user } = useCommunity();
  const count = useSyncExternalStore(sentSignal.subscribe, () => sent, () => sent);
  const key = user === undefined ? null : `${user?.id ?? ""}:${count}`;
  // `key` stands for the account and the count read here.
  const load = useCallback(() => {
    if (key === null) return new Promise<never>(() => {});
    const kept = probe.items;
    probe.items = null;
    if (kept && probe.user === user?.id && kept.sent === count) return Promise.resolve(kept.items);
    return fetchMyInscriptionProposals();
  }, [key]);
  return useResource(load);
}

/** The photo's address: the API gives its media path, served by the API itself when local. */
export function proposalPhotoUri(photo: string): string | null {
  if (!photo) return null;
  return photo.startsWith("/") ? `${resolveApiUrl()}${photo}` : photo;
}
