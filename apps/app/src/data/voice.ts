import { VoiceTranscriptionResponseSchema } from "@vagabonds/contracts";
import type { AudioSource } from "expo-audio";
import { Platform } from "react-native";

import { accountToken, sessionRejected } from "./community";
import { resolveApiUrl } from "./config";
import { DataError } from "./errors";
import { request, statusError } from "./http";
import { uploadFile } from "./upload";
import { getLang, getMessages } from "@/i18n";

/**
 * Sesli Rehber's two API calls: a recording to text (`POST /voice/transcribe`) and an answer to
 * speech (`GET /voice/speech`). Both need the account, as Rehber does. Recordings are not stored.
 */

const words = () => getMessages().errors.voice;
/** The provider turns a short recording into text in about a second. */
const TRANSCRIBE_TIMEOUT_MS = 20_000;

function voiceError(status: number, code: string | null, details: string[]): DataError {
  if (code === "VOICE_UNAVAILABLE") return new DataError("unavailable", words().down, details, code);
  if (status === 413) return new DataError("rejected", words().tooLong, details, code);
  if (status === 400 || status === 415) return new DataError("rejected", words().unreadable, details, code);
  return statusError(status, code, details);
}

/** The words of the recording at `uri` (the recorder's file, or a blob URL on the web); empty when none were understood. */
export async function transcribe(uri: string, signal?: AbortSignal): Promise<string> {
  const token = await accountToken();
  if (token === null) throw new DataError("rejected", words().signIn, ["/voice/transcribe"], "ACCOUNT_REQUIRED");
  const url = `${resolveApiUrl()}/voice/transcribe?lang=${getLang()}`;
  const errorFor = (status: number, code: string | null, details: string[]) => {
    if (status === 401) sessionRejected(token);
    return voiceError(status, code, details);
  };
  if (Platform.OS !== "web") {
    // The phone's recorder writes .m4a (AAC in MP4).
    const result = await uploadFile(uri, url, VoiceTranscriptionResponseSchema, { type: "audio/mp4", token, errorFor, timeoutMs: TRANSCRIBE_TIMEOUT_MS, signal });
    return result.text;
  }
  let audio: Blob;
  try {
    audio = await (await fetch(uri)).blob();
  } catch (error) {
    throw new DataError("rejected", words().unreadable, [uri, String(error)]);
  }
  // A browser names its own type (audio/webm;codecs=opus).
  const type = audio.type && audio.type.startsWith("audio/") ? audio.type : "audio/webm";
  const result = await request(url, VoiceTranscriptionResponseSchema, {
    rawBody: { data: audio, type },
    token,
    signal,
    timeoutMs: TRANSCRIBE_TIMEOUT_MS,
    errorFor,
  });
  return result!.text;
}


/**
 * Where a player gets `text` read aloud. A phone's player streams the address itself with the
 * account's token; a browser's cannot send headers, so the speech is downloaded first.
 * `null` without an account.
 */
export async function speechSource(text: string, signal?: AbortSignal): Promise<AudioSource> {
  const token = await accountToken();
  if (token === null) return null;
  const uri = `${resolveApiUrl()}/voice/speech?${new URLSearchParams({ text, lang: getLang() }).toString()}`;
  const headers = { Authorization: `Bearer ${token}` };
  if (Platform.OS !== "web") return { uri, headers };
  const response = await fetch(uri, { headers, signal });
  if (!response.ok) throw new DataError("unavailable", words().noSpeech, [`${response.status} ${uri}`]);
  return { uri: URL.createObjectURL(await response.blob()) };
}
