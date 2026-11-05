import * as Speech from "expo-speech";
import { localeTag } from "@/i18n";

/** Reads a text aloud in Turkish, cutting off whatever was being read before. */
export function speak(text: string) {
  Speech.stop();
  Speech.speak(text, { language: localeTag(), rate: 0.95 });
}

export function stopSpeaking() {
  Speech.stop();
}
