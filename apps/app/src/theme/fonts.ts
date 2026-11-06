import { Amiri_400Regular, Amiri_700Bold } from "@expo-google-fonts/amiri";
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
} from "@expo-google-fonts/hanken-grotesk";
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono";
import { Fraunces_400Regular } from "@expo-google-fonts/fraunces";
import type { fontFamily } from "@vagabonds/ui";

/**
 * Font files keyed by the family names in `@vagabonds/ui`'s `fontFamily`.
 * The `satisfies` check fails to compile if a token family has no file here.
 */
export const fontFiles = {
  Fraunces_400Regular,
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  Amiri_400Regular,
  Amiri_700Bold,
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
} satisfies Record<(typeof fontFamily)[keyof typeof fontFamily], unknown>;
