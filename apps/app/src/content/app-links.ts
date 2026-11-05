/**
 * Where the web's home page sends a visitor for the mobile app.
 *
 * - `expoGo`: the link Expo Go opens (an `exp://` URL, e.g. an EAS Update channel or the dev
 *   server on the network), set at build time with `EXPO_PUBLIC_APP_URL`. Unset, the page uses the
 *   dev server it is served from when that is on the network (`exp://<ip>:8081`), else shows no QR.
 * - `appStore`, `googlePlay`: the store pages; until the app is published they say "Yakında".
 */
export const appLinks: { expoGo: string | null; appStore: string | null; googlePlay: string | null } = {
  expoGo: process.env.EXPO_PUBLIC_APP_URL || null,
  appStore: null,
  googlePlay: null,
};

/** The Expo Go link for this page: the configured one, or the network dev server serving it. */
export function expoGoLink(location: { hostname: string; host: string; port: string } | null): string | null {
  if (appLinks.expoGo) return appLinks.expoGo;
  if (!location || location.port !== "8081") return null;
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "::1";
  return local ? null : `exp://${location.host}`;
}
