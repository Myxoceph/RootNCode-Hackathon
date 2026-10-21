import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** `true` while VoiceOver, TalkBack or another screen reader is running. */
export function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

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
