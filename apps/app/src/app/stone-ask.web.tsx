import { Redirect } from "expo-router";

/**
 * Taşa Sor needs the phone's camera; the web has none (ADR 0001), so an old link
 * goes to the map. Being a `.web` file, the camera's code is not in the web bundle at all.
 */
export default function NoCameraOnWeb() {
  return <Redirect href="/map" />;
}
