import { DataError, type SchemaParser } from "./errors";

const TIMEOUT_MS = 10_000;

/** API error codes that mean "this asset does not exist", as opposed to a broken request. */
const NOT_FOUND_CODES = new Set(["ASSET_NOT_FOUND", "INVALID_ID"]);

export interface RequestOptions {
  /** Resolve to `null` instead of throwing when the API says the asset does not exist. */
  allowNotFound?: boolean;
  /** Sent as JSON in a POST; without it the request is a GET. */
  body?: unknown;
  /** Sent as it is in a POST, e.g. a voice recording; in place of `body`. */
  rawBody?: { data: Blob; type: string };
  /** Only for a request without a body that is not a GET (`DELETE`, or a `POST` with nothing to send). */
  method?: "POST" | "DELETE";
  /** Sent as `Authorization: Bearer <token>`. */
  token?: string;
  /** The error for an answer that is not 2xx; `statusError` by default. */
  errorFor?: (status: number, code: string | null, details: string[]) => DataError;
  /** How long to wait for the answer; 10 s by default. The assistant needs longer. */
  timeoutMs?: number;
  /** Cancels the request, e.g. when the visitor clears the conversation it belongs to. */
  signal?: AbortSignal;
}

/**
 * One request to the API, validated against `schema`. Every failure is a `DataError`: no network,
 * an error status, a body that is not JSON (a Wi-Fi login page in between) or one that breaks the contract.
 */
export async function request<T>(url: string, schema: SchemaParser<T>, options: RequestOptions = {}): Promise<T | null> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.rawBody) headers["Content-Type"] = options.rawBody.type;
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? TIMEOUT_MS);
  const cancel = () => controller.abort();
  if (options.signal?.aborted) cancel();
  options.signal?.addEventListener("abort", cancel);

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? (options.body === undefined && !options.rawBody ? "GET" : "POST"),
      headers,
      body: options.rawBody ? options.rawBody.data : options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw new DataError("unavailable", "İstek iptal edildi.", [url]);
    // The connection works but the answer is late: "check your internet" would send the visitor the wrong way.
    if (timedOut) throw new DataError("unavailable", "Sunucu zamanında cevap vermedi. Biraz sonra tekrar dene.", [url]);
    throw new DataError(
      "unavailable",
      "Sunucuya ulaşılamıyor. İnternet bağlantını kontrol edip tekrar dene.",
      [url, String(error)],
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }

  if (!response.ok) {
    const code = await readErrorCode(response);
    if (options.allowNotFound && code !== null && NOT_FOUND_CODES.has(code)) return null;
    const details = [`${response.status} ${code ?? ""} ${url}`.trim()];
    throw (options.errorFor ?? statusError)(response.status, code, details);
  }

  // Done, nothing to read (archive, delete, sign out).
  if (response.status === 204) return null;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // Not JSON at all: most likely not our API but a Wi-Fi login page (hotel, museum) in between.
    throw new DataError("unavailable", "Sunucuya ulaşılamıyor. Wi-Fi giriş sayfası açıksa önce oturum aç.", [url]);
  }

  const result = schema.safeParse(body);
  if (!result.success) throw DataError.fromSchema("Sunucudan gelen veri", result.error);
  return result.data;
}

async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown } };
    return typeof body.error?.code === "string" ? body.error.code : null;
  } catch {
    return null;
  }
}

export function statusError(status: number, _code: string | null, details: string[]): DataError {
  if (status === 429) return new DataError("unavailable", "Çok fazla istek gönderildi. Biraz bekleyip tekrar dene.", details);
  if (status >= 500) return new DataError("unavailable", "Sunucuda bir sorun oluştu. Biraz sonra tekrar dene.", details);
  return new DataError("unavailable", "İstek tamamlanamadı.", details);
}
