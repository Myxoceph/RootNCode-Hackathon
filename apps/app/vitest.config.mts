import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/**
 * Unit tests in Node. The native modules the tested code reaches for are swapped for small
 * in-memory stand-ins (test/mocks): storage, the keychain, audio, the bits of React Native used.
 */
export default defineConfig({
  resolve: {
    alias: {
      // Same as tsconfig's paths; the longer prefix first.
      "@/assets/": path("./assets/"),
      "@/": path("./src/"),
      "react-native": path("./test/mocks/react-native.ts"),
      "@react-native-async-storage/async-storage": path("./test/mocks/async-storage.ts"),
      "expo-secure-store": path("./test/mocks/secure-store.ts"),
      "expo-constants": path("./test/mocks/expo-constants.ts"),
      "expo-audio": path("./test/mocks/expo-audio.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
