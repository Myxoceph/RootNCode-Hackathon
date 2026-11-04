import type { AppUser } from "@vagabonds/contracts";

/**
 * Whether the visitor must sign in before anything else: with a server, every screen but the
 * sign-in one needs an account. A nickname session from before is not one. Without a server
 * (the sample data) no account can be opened, so nothing is closed off. `undefined` is the
 * stored session still loading: nothing is decided yet.
 */
export function needsSignIn(user: AppUser | null | undefined, available: boolean, screen: string | undefined): boolean {
  if (!available || user === undefined) return false;
  if (user?.username) return false;
  return screen !== "auth";
}
