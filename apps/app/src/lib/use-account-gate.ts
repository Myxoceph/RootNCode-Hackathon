import { useRootNavigationState, useRouter, useSegments } from "expo-router";
import { useEffect, useRef } from "react";

import { communityAvailable, useCommunity } from "@/data";
import { needsSignIn } from "@/lib/account-gate";

/**
 * Sends a visitor without an account to `/auth`, from wherever they came in (the app's opening
 * or a shared link). A first visit opens on "Kayıt ol"; one who just signed out on "Giriş yap".
 */
export function useAccountGate() {
  const { user } = useCommunity();
  const segments = useSegments();
  const router = useRouter();
  const mounted = useRootNavigationState()?.key != null;
  const hadAccount = useRef(false);
  if (user?.username) hadAccount.current = true;

  const screen = segments[0];
  const closed = needsSignIn(user, communityAvailable, screen);
  useEffect(() => {
    if (!mounted || !closed) return;
    router.replace({ pathname: "/auth", params: { mode: hadAccount.current ? "login" : "register" } });
  }, [mounted, closed, router]);
}
