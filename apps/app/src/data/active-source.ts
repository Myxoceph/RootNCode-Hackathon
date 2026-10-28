import { createApiSource } from "./api-source";
import { createCachedSource } from "./cached-source";
import { resolveApiUrl, resolveDataSourceKind } from "./config";
import { createMockSource } from "./mock-source";
import type { DataSource } from "./source";

/**
 * The one place that decides where data comes from: the API by default, its answers kept
 * on the device for a weak or missing network (./cached-source.ts); the bundled fixtures
 * with `EXPO_PUBLIC_DATA_SOURCE=mock`. Screens stay the same either way.
 */
export const dataSource: DataSource =
  resolveDataSourceKind() === "mock" ? createMockSource() : createCachedSource(createApiSource(resolveApiUrl()));
