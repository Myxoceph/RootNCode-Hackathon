import Svg, { G, Rect } from "react-native-svg";

/** The eight-pointed star: the mark of a resolved monument. Decorative; hidden from screen readers. */
export function Star({ size = 24, color, outline = false }: { size?: number; color: string; outline?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="-12 -12 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <G fill={outline ? "none" : color} stroke={outline ? color : "none"} strokeWidth={1.3}>
        <Rect x={-7} y={-7} width={14} height={14} />
        <Rect x={-7} y={-7} width={14} height={14} transform="rotate(45)" />
      </G>
    </Svg>
  );
}
