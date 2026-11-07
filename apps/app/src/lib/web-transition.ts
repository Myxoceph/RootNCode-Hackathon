import type { ViewStyle } from "react-native";

/**
 * A CSS transition for a style on the web (react-native-web passes it through; native ignores it).
 * React Native's own style types do not know the property, so it is given here as a `ViewStyle`.
 */
export function webTransition(property: string, duration: string): ViewStyle {
  return {
    transitionProperty: property,
    transitionDuration: duration,
  } as ViewStyle;
}
