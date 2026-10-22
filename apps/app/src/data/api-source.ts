import {
  AssetDetailSchema,
  AssetListResponseSchema,
  AssetRelationsResponseSchema,
  MetaEnumsResponseSchema,
} from "@vagabonds/contracts";

import { DataError, type SchemaParser } from "./errors";
import type { DataSource } from "./source";

const TIMEOUT_MS = 10_000;

/** API error codes that mean "this asset does not exist", as opposed to a broken request. */
const NOT_FOUND_CODES = new Set(["ASSET_NOT_FOUND", "INVALID_ID"]);

interface RequestOptions {
  /** Resolve to `null` instead of throwing when the API says the asset does not exist. */
  allowNotFound?: boolean;
}

export function createApiSource(baseUrl: string): DataSource {
  async function request<T>(path: string, schema: SchemaParser<T>, options: RequestOptions = {}): Promise<T | null> {
    const url = `${baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    } catch (error) {
      throw new DataError(
        "unavailable",
        "Sunucuya ulaşılamıyor. İnternet bağlantını kontrol edip tekrar dene.",
        [url, String(error)],
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const code = await readErrorCode(response);
      if (options.allowNotFound && code !== null && NOT_FOUND_CODES.has(code)) return null;
      throw new DataError("unavailable", messageForStatus(response.status), [
        `${response.status} ${code ?? ""} ${url}`.trim(),
      ]);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new DataError("invalid", "Sunucudan gelen veri okunamadı.", [url]);
    }

    const result = schema.safeParse(body);
    if (!result.success) throw DataError.fromSchema("Sunucudan gelen veri", result.error);
    return result.data;
  }

  return {
    async listAssets({ city, limit, offset }, lang) {
      const params = new URLSearchParams({ lang, limit: String(limit), offset: String(offset) });
      if (city) params.set("city", city);
      // Never null: the list endpoint has no "not found".
      return (await request(`/assets?${params}`, AssetListResponseSchema))!;
    },
    getAsset(id, lang) {
      return request(`/assets/${encodeURIComponent(id)}?lang=${lang}`, AssetDetailSchema, { allowNotFound: true });
    },
    getRelations(id, lang) {
      return request(`/assets/${encodeURIComponent(id)}/relations?lang=${lang}`, AssetRelationsResponseSchema, {
        allowNotFound: true,
      });
    },
    async listCities(lang) {
      const enums = (await request(`/meta/enums?lang=${lang}`, MetaEnumsResponseSchema))!;
      return enums.cities
        .filter((city) => city.assetCount > 0)
        .map(({ code, label, assetCount }) => ({ code, label, assetCount }));
    },
  };
}

async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown } };
    return typeof body.error?.code === "string" ? body.error.code : null;
  } catch {
    return null;
  }
}

function messageForStatus(status: number): string {
  if (status === 429) return "Çok fazla istek gönderildi. Biraz bekleyip tekrar dene.";
  if (status >= 500) return "Sunucuda bir sorun oluştu. Biraz sonra tekrar dene.";
  return "İstek tamamlanamadı.";
}
