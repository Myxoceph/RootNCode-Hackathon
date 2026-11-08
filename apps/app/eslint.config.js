// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "web-build/*", ".expo/*", "expo-env.d.ts"],
  },
  {
    rules: {
      // React Compiler takes the rules of hooks as kept: breaking one is an error, a missing dependency a warning.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // React Compiler's own checks, on as warnings for now: most are the Animated idiom
      // (`useRef(new Animated.Value(0)).current`) and effects that set state on purpose; to be
      // worked down, file by file.
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      // Style only; the code uses both.
      "@typescript-eslint/array-type": "off",
    },
  },
]);
