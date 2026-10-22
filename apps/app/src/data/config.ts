import Constants from "expo-constants";
import { Platform } from "react-native";

const API_PORT = 3000;

/**
 * Base URL of the API, without a trailing slash.
 *
 * 1. `EXPO_PUBLIC_API_URL` when set. The web build behind Caddy uses `/api`
 *    (deploy/web.Dockerfile); a phone pointed at the demo server uses `https://<domain>/api`.
 * 2. In development on a phone, the computer running the Expo dev server: Expo Go
 *    already reaches it, so the API on the same machine needs no extra setup.
 * 3. Otherwise `http://localhost:3000` (web and simulators on the same computer).
 */
export function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const devServerHost = Constants.expoConfig?.hostUri?.split(":")[0];
  if (Platform.OS !== "web" && devServerHost) return `http://${devServerHost}:${API_PORT}`;

  return `http://localhost:${API_PORT}`;
}

/** `mock` serves the bundled fixtures instead of the API (offline development, UI work). */
export type DataSourceKind = "api" | "mock";

export function resolveDataSourceKind(): DataSourceKind {
  return process.env.EXPO_PUBLIC_DATA_SOURCE === "mock" ? "mock" : "api";
}
