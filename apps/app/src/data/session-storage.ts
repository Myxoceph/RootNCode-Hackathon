import * as SecureStore from "expo-secure-store";

/** The visitor's anonymous session (./community.ts), in the phone's keychain/keystore. */
const KEY = "vagabonds-community-session";

export function readSession(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}

export function writeSession(value: string): Promise<void> {
  return SecureStore.setItemAsync(KEY, value);
}

export function clearSession(): Promise<void> {
  return SecureStore.deleteItemAsync(KEY);
}
