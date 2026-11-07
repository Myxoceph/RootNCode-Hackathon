import { useTheme } from "@vagabonds/ui";
import { Redirect } from "expo-router";
import { View } from "react-native";

import { communityAvailable, useCommunity } from "@/data";
import { isAccount } from "@/lib/account-gate";

/**
 * `/`: the app's opening leads to the welcome page (`/welcome`), which stays until the visitor
 * goes on. Without an account it waits instead on the plain background: the account gate takes
 * the visitor to sign in, and signing in comes back here.
 */
export default function OpeningScreen() {
  const { user } = useCommunity();
  const { scheme, colors: c } = useTheme();
  // The stored session is in, and it is an account (or there is no server to need one).
  const ready = user !== undefined && (isAccount(user) || !communityAvailable);
  if (ready) return <Redirect href="/welcome" />;
  return <View style={{ flex: 1, backgroundColor: scheme === "dark" ? c.background : c.surface }} />;
}
