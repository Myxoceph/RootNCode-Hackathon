import AsyncStorage from "@react-native-async-storage/async-storage";

/** The web has no secure store: the session lives in the site's storage, like a login cookie would. */
const KEY = "vagabonds-community-session";

export function readSession(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

export function writeSession(value: string): Promise<void> {
  return AsyncStorage.setItem(KEY, value);
}

export function clearSession(): Promise<void> {
  return AsyncStorage.removeItem(KEY);
}
