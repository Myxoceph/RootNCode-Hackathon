import { useEffect } from "react";
import { AppState } from "react-native";

import { useCommunity } from "@/data";
import { fetchMyAchievements } from "@/data/community";

/** At most this often, the app asks whether a badge came in while it was away. */
const EVERY_MS = 60_000;

/**
 * Badges earned without a visit on this phone (a note approved later) come in with
 * `GET /me/achievements`; this asks for it when the app opens and when it comes back to the front,
 * so their celebration does not wait for Rozetlerim (data/new-badges.ts).
 */
export function useBadgeWatch(): void {
  const { user } = useCommunity();
  const account = user?.username ? user.id : null;

  useEffect(() => {
    if (!account) return;
    let last = 0;
    const check = () => {
      if (Date.now() - last < EVERY_MS) return;
      last = Date.now();
      // Offline or refused: tried again on the next return to the app.
      fetchMyAchievements().catch(() => {});
    };
    check();
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") check();
    });
    return () => subscription.remove();
  }, [account]);
}
