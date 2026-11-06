import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

/** The city last opened on the map (`cities` code), kept on the device for the next greeting. */
const KEY = "vagabonds-last-city";

/** Remembers the city just opened. A failed write only means the greeting falls back. */
export function rememberCity(code: string): void {
  void AsyncStorage.setItem(KEY, code).catch(() => {});
}

/** The city last opened on the map; `null` when none was, `undefined` while it is being read. */
export function useLastCity(): string | null | undefined {
  const [city, setCity] = useState<string | null>();
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(KEY).then(
      (code) => active && setCity(code),
      () => active && setCity(null),
    );
    return () => {
      active = false;
    };
  }, []);
  return city;
}
