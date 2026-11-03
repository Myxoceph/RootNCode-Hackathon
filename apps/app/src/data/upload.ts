import { File } from "expo-file-system";

import { DataError, type SchemaParser } from "./errors";

export interface UploadOptions {
  /** The file's media type, sent as Content-Type. */
  type: string;
  /** Sent as `Authorization: Bearer <token>`. */
  token: string;
  /** The error for an answer that is not 2xx. */
  errorFor: (status: number, code: string | null, details: string[]) => DataError;
  timeoutMs: number;
  signal?: AbortSignal | undefined;
}

/**
 * A file on the phone (a recording, a photo), POSTed as the request body and its answer validated
 * against `schema`. React Native's `fetch` cannot read a local file into a request body (Android
 * answers "File not found"); the file system's upload can. Every failure is a `DataError`, as `request`'s.
 */
export async function uploadFile<T>(uri: string, url: string, schema: SchemaParser<T>, { type, token, errorFor, timeoutMs, signal }: UploadOptions): Promise<T> {
  const file = new File(uri.startsWith("/") ? `file://${uri}` : uri);
  if (!file.exists || file.size === 0) throw new DataError("rejected", "Dosya okunamadı. Tekrar dene.", [uri]);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel);
  let result: { status: number; body: string };
  try {
    result = await file.upload(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "Content-Type": type },
      mimeType: type,
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw DataError.fromSchema("Sunucudan gelen veri", parsed.error);
  return parsed.data;
}
