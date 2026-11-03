import { VoiceTranscriptionResponseSchema } from "@vagabonds/contracts";
import type { AudioSource } from "expo-audio";
import { File } from "expo-file-system";
import { Platform } from "react-native";

import { accountToken, sessionRejected } from "./community";
import { resolveApiUrl } from "./config";
import { DataError } from "./errors";
import { request, statusError } from "./http";

/**
 * Sesli Rehber's two API calls: a recording to text (`POST /voice/transcribe`) and an answer to
 * speech (`GET /voice/speech`). Both need the account, as Rehber does. Recordings are not stored.
 */

const SIGN_IN = "Sesli soru için giriş yap.";
/** The provider turns a short recording into text in about a second. */
const TRANSCRIBE_TIMEOUT_MS = 20_000;

function voiceError(status: number, code: string | null, details: string[]): DataError {
  if (code === "VOICE_UNAVAILABLE") return new DataError("unavailable", "Sesli soru şu an kullanılamıyor; yazarak sorabilirsin.", details, code);
  if (status === 413) return new DataError("rejected", "Kayıt çok uzun. Sorunu biraz daha kısa sor.", details, code);
  if (status === 400 || status === 415) return new DataError("rejected", "Kayıt okunamadı. Tekrar dene ya da yazarak sor.", details, code);
  return statusError(status, code, details);
}

/** The words of the recording at `uri` (the recorder's file, or a blob URL on the web); empty when none were understood. */
export async function transcribe(uri: string, signal?: AbortSignal): Promise<string> {
  const token = await accountToken();
  if (token === null) throw new DataError("rejected", SIGN_IN, ["/voice/transcribe"], "ACCOUNT_REQUIRED");
  const url = `${resolveApiUrl()}/voice/transcribe?lang=tr`;
  const errorFor = (status: number, code: string | null, details: string[]) => {
    if (status === 401) sessionRejected(token);
    return voiceError(status, code, details);
  };
  if (Platform.OS !== "web") return uploadRecording(uri, url, token, errorFor, signal);
  let audio: Blob;
  try {
    audio = await (await fetch(uri)).blob();
  } catch (error) {
    throw new DataError("rejected", "Kayıt okunamadı. Tekrar dene ya da yazarak sor.", [uri, String(error)]);
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
 * A phone's recording, sent straight from its file: React Native's `fetch` cannot read a local
 * file into a request body (Android answers "File not found"), the file system's upload can.
 */
async function uploadRecording(
  uri: string,
  url: string,
  token: string,
  errorFor: (status: number, code: string | null, details: string[]) => DataError,
  signal?: AbortSignal,
): Promise<string> {
  const file = new File(uri.startsWith("/") ? `file://${uri}` : uri);
  if (!file.exists || file.size === 0) throw new DataError("rejected", "Kayıt okunamadı. Tekrar dene ya da yazarak sor.", [uri]);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TRANSCRIBE_TIMEOUT_MS);
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel);
  let result: { status: number; body: string };
  try {
    // The phone's recorder writes .m4a (AAC in MP4).
    result = await file.upload(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "Content-Type": "audio/mp4" },
      mimeType: "audio/mp4",
      sessionType: "foreground",
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw new DataError("unavailable", "İstek iptal edildi.", [url]);
    if (timedOut) throw new DataError("unavailable", "Sunucu zamanında cevap vermedi. Biraz sonra tekrar dene.", [url]);
    throw new DataError("unavailable", "Sunucuya ulaşılamıyor. İnternet bağlantını kontrol edip tekrar dene.", [url, String(error)]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
  let body: unknown = null;
  try {
    body = JSON.parse(result.body);
  } catch {
    // Not our API's JSON; handled below.
  }
  if (result.status < 200 || result.status >= 300) {
    const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
    const known = typeof code === "string" ? code : null;
    throw errorFor(result.status, known, [`${result.status} ${known ?? ""} ${url}`.trim()]);
  }
  if (body === null) throw new DataError("unavailable", "Sunucuya ulaşılamıyor. Wi-Fi giriş sayfası açıksa önce oturum aç.", [url]);
  const parsed = VoiceTranscriptionResponseSchema.safeParse(body);
  if (!parsed.success) throw DataError.fromSchema("Sunucudan gelen veri", parsed.error);
  return parsed.data.text;
}

/**
 * Where a player gets `text` read aloud. A phone's player streams the address itself with the
 * account's token; a browser's cannot send headers, so the speech is downloaded first.
 * `null` without an account.
 */
export async function speechSource(text: string, signal?: AbortSignal): Promise<AudioSource> {
  const token = await accountToken();
  if (token === null) return null;
  const uri = `${resolveApiUrl()}/voice/speech?${new URLSearchParams({ text, lang: "tr" }).toString()}`;
  const headers = { Authorization: `Bearer ${token}` };
  if (Platform.OS !== "web") return { uri, headers };
  const response = await fetch(uri, { headers, signal });
  if (!response.ok) throw new DataError("unavailable", "Ses hazırlanamadı.", [`${response.status} ${uri}`]);
  return { uri: URL.createObjectURL(await response.blob()) };
}
