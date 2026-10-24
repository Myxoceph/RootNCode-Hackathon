import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** A screen that waits for the answer shows nothing meanwhile; it never waits longer. */
const ANSWER_TIMEOUT_MS = 1000;

/**
 * `true` while VoiceOver, TalkBack or another screen reader is running; `null` until
 * the system has answered (at most a second), so a screen can wait before opening the camera.
 */
export function useScreenReaderStatus(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const answer = (value: boolean) => active && setEnabled((current) => current ?? value);
    AccessibilityInfo.isScreenReaderEnabled().then(answer, () => answer(false));
    const timeout = setTimeout(() => answer(false), ANSWER_TIMEOUT_MS);
    const sub = AccessibilityInfo.addEventListener("screenReaderChanged", setEnabled);
    return () => {
      active = false;
      clearTimeout(timeout);
      sub.remove();
    };
  }, []);

  return enabled;
}

/** `true` while VoiceOver, TalkBack or another screen reader is running. */
export function useScreenReaderEnabled(): boolean {
  return useScreenReaderStatus() ?? false;
}
