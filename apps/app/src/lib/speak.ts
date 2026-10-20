import * as Speech from "expo-speech";

/** Reads a text aloud in Turkish, cutting off whatever was being read before. */
export function speak(text: string) {
  Speech.stop();
  Speech.speak(text, { language: "tr-TR", rate: 0.95 });
}

export function stopSpeaking() {
  Speech.stop();
}
