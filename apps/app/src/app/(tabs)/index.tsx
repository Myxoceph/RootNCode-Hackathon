import { Redirect } from "expo-router";

/** The app opens on Eserler; it has no page of its own at `/`. */
export default function OpeningScreen() {
  return <Redirect href="/monuments" />;
}
