import AsyncStorage from "@react-native-async-storage/async-storage";
import { useGlobalSearchParams, usePathname, useRootNavigationState, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

import { communityAvailable, useCommunity } from "@/data";
import { isAccount, needsSignIn } from "@/lib/account-gate";

/** Set once an account has been signed in on this phone: signed out, it is asked to sign in, not to sign up. */
const HAD_ACCOUNT_KEY = "vagabonds-had-account";

/**
 * Sends a visitor without an account to `/auth`, from wherever they came in (the app's opening
 * or a shared link, which it opens once signed in). On a phone that never had an account it
 * opens on "Kayıt ol"; on one that had, on "Giriş yap".
 * The web's home page (`/`) is open to all: its laptop leads into the site, where the gate is.
 */
export function useAccountGate() {
  const { user } = useCommunity();
  const segments = useSegments();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const router = useRouter();
  const mounted = useRootNavigationState()?.key != null;
  const [hadAccount, setHadAccount] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(HAD_ACCOUNT_KEY)
      .then((value) => active && setHadAccount(value !== null))
      .catch(() => active && setHadAccount(false));
    return () => {
      active = false;
    };
  }, []);

  const signedIn = isAccount(user);
  useEffect(() => {
    if (!signedIn) return;
    setHadAccount(true);
    void AsyncStorage.setItem(HAD_ACCOUNT_KEY, "1").catch(() => {});
  }, [signedIn]);

  const home = Platform.OS === "web" && pathname === "/";
  const closed = !home && needsSignIn(user, communityAvailable, segments[0]);
  useEffect(() => {
    if (!mounted || !closed || hadAccount === undefined) return;
    const query = new URLSearchParams(
      Object.entries(params).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : (value ?? []).map((one) => [key, one]))),
    ).toString();
    const next = pathname === "/" ? undefined : `${pathname}${query ? `?${query}` : ""}`;
    router.replace({ pathname: "/auth", params: { mode: hadAccount ? "login" : "register", ...(next && { next }) } });
    // The page asked for is read when the gate closes, not followed as it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, closed, hadAccount, router]);
}
