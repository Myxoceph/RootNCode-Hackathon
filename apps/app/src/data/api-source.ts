import {
  AssetDetailSchema,
  AssetListResponseSchema,
  AssetRelationsResponseSchema,
  MetaEnumsResponseSchema,
  PulseResponseSchema,
  WeatherResponseSchema,
} from "@vagabonds/contracts";

import type { SchemaParser } from "./errors";
import { request as requestJson, type RequestOptions } from "./http";
import type { DataSource } from "./source";

export function createApiSource(baseUrl: string): DataSource {
  const request = <T>(path: string, schema: SchemaParser<T>, options?: RequestOptions) =>
    requestJson(`${baseUrl}${path}`, schema, options);

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
    getPulse(id, lang) {
      return request(`/assets/${encodeURIComponent(id)}/pulse?lang=${lang}`, PulseResponseSchema, { allowNotFound: true });
    },
    async getWeather(city, lang) {
      // The weather is a nicety: without it the app goes on.
      try {
        return await request(`/weather?city=${encodeURIComponent(city)}&lang=${lang}`, WeatherResponseSchema, { allowNotFound: true });
      } catch {
        return null;
      }
    },
    async getWeatherAt(point, lang) {
      try {
        return await request(`/weather?at=${point.lat.toFixed(3)},${point.lng.toFixed(3)}&lang=${lang}`, WeatherResponseSchema, { allowNotFound: true });
      } catch {
        return null;
      }
    },
    async listCities(lang) {
      const enums = (await request(`/meta/enums?lang=${lang}`, MetaEnumsResponseSchema))!;
      return enums.cities
        .filter((city) => city.assetCount > 0)
        .map(({ code, label, assetCount, plate }) => ({ code, label, assetCount, plate }));
    },
  };
}
