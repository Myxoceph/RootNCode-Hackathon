import { MonumentsPayloadSchema, type MonumentsPayload } from "@vagabonds/contracts";
import mock from "@vagabonds/contracts/mock/mock_monuments.json";

import { DataError } from "./errors";
import type { DataSource } from "./source";

/** Parses a raw payload, turning schema failures into a readable `DataError`. */
export function parseMonumentsPayload(raw: unknown, source: string): MonumentsPayload {
  const result = MonumentsPayloadSchema.safeParse(raw);
  if (!result.success) throw DataError.fromSchema(source, result.error);
  return result.data;
}

/** Serves the bundled mock payload, the same shape the API will return. */
export function createMockSource(raw: unknown = mock): DataSource {
  let payload: MonumentsPayload | undefined;
  // Parsed on first use, not at import, so a broken mock shows the error screen instead of crashing on launch.
  const load = () => (payload ??= parseMonumentsPayload(raw, "Örnek eser verisi"));

  return {
    async listMonuments() {
      return load().monuments;
    },
    async getMonument(slug) {
      return load().monuments.find((m) => m.slug === slug) ?? null;
    },
  };
}
