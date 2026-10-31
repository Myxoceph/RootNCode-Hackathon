import { useRef, useState } from "react";
import {
  PanResponder,
  Platform,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Read by screen readers as the control's name. */
  label: string;
  /** Read after each change, e.g. "%35". */
  valueText: string;
  trackColor: string;
  fillColor: string;
  thumbColor: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A horizontal slider. Drag it, swipe up/down with a screen reader
 * (`adjustable`), or use the arrow keys on the web.
 */
export function Slider({ value, min, max, step, onChange, label, valueText, trackColor, fillColor, thumbColor, style }: SliderProps) {
  const [width, setWidth] = useState(0);
  const latest = useRef({ width, min, max, step, onChange });
  latest.current = { width, min, max, step, onChange };

  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const fromX = (x: number) => {
    const { width: w, min: lo, max: hi, step: s, onChange: set } = latest.current;
    if (w === 0) return;
    const raw = lo + (Math.min(w, Math.max(0, x)) / w) * (hi - lo);
    set(Math.round(raw / s) * s);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => fromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => fromX(e.nativeEvent.locationX),
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === "increment") onChange(clamp(value + step));
    if (e.nativeEvent.actionName === "decrement") onChange(clamp(value - step));
  };

  // react-native-web forwards keyboard events on focusable views; native has no keyboard here.
  const webKeys =
    Platform.OS === "web"
      ? ({
          tabIndex: 0,
          onKeyDown: (e: { key: string; preventDefault: () => void }) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(clamp(value + step));
            else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(clamp(value - step));
            else return;
            e.preventDefault();
          },
        } as object)
      : {};

  const fraction = (value - min) / (max - min);

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: valueText }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={onAction}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.hit, style]}
      {...webKeys}
      {...pan.panHandlers}
    >
      <View pointerEvents="none" style={[styles.track, { backgroundColor: trackColor }]}>
        <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: fillColor }]} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.thumb, { left: fraction * width - THUMB / 2, backgroundColor: thumbColor }]}
      />
    </View>
  );
}

const THUMB = 22;

const styles = StyleSheet.create({
  hit: {
    minHeight: 44,
    justifyContent: "center",
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
  },
  thumb: {
    position: "absolute",
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    top: (44 - THUMB) / 2,
  },
});
