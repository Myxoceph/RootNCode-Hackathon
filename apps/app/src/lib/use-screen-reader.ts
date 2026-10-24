import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * `true` while VoiceOver, TalkBack or another screen reader is running; `null` until
 * the system has answered, so a screen can wait before opening the camera.
 */
export function useScreenReaderStatus(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isScreenReaderEnabled().then((value) => active && setEnabled(value));
    const sub = AccessibilityInfo.addEventListener("screenReaderChanged", setEnabled);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return enabled;
}

/** `true` while VoiceOver, TalkBack or another screen reader is running. */
export function useScreenReaderEnabled(): boolean {
  return useScreenReaderStatus() ?? false;
}
