import { Redirect } from "expo-router";

/** The sequence belongs to the seal, which needs the phone's camera (ADR 0001): an old link goes to the map. */
export default function NoSequenceOnWeb() {
  return <Redirect href="/map" />;
}
