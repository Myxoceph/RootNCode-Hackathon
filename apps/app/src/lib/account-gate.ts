import type { AppUser } from "@vagabonds/contracts";

/** An account: signed in with a username. A nickname session from before the app needed one is not. */
export function isAccount(user: AppUser | null | undefined): user is AppUser & { username: string } {
  return Boolean(user?.username);
}

/**
 * Whether the visitor must sign in before anything else: with a server, every screen but the
 * sign-in one needs an account. Without a server (the sample data) no account can be opened, so
 * nothing is closed off. `undefined` is the stored session still loading: nothing is decided yet.
 */
export function needsSignIn(user: AppUser | null | undefined, available: boolean, screen: string | undefined): boolean {
  if (!available || user === undefined) return false;
  if (isAccount(user)) return false;
  return screen !== "auth";
}

/**
 * Where to go once signed in: the page the visitor came in for (a shared link), or `otherwise`.
 * Only a path inside the app counts, and never the sign-in screen itself.
 */
export function afterSignIn(next: string | undefined, otherwise = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/auth")) return otherwise;
  return next;
}
