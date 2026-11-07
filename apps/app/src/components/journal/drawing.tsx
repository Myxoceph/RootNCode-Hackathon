import type { JournalStroke, JournalStrokeColor, JournalStrokeSize } from "@vagabonds/contracts";
import { memo, useRef, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { decodeStroke, encodeStroke, hasRoomFor, linePath, penWidth, POINT_EVERY, simplifyLine, strokeAt, STROKE_COLORS, type Point } from "@/lib/journal-drawing";

/** The finished lines of a page. Drawn again only when they change: not at each move of a pen. */
export const Strokes = memo(function Strokes({ strokes, width, height }: { strokes: readonly JournalStroke[]; width: number; height: number }) {
  if (strokes.length === 0) return null;
  return (
    <Svg aria-hidden pointerEvents="none" width={width} height={height} style={StyleSheet.absoluteFill}>
      {strokes.map((stroke, at) => (
        <Path
          key={at}
          d={linePath(decodeStroke(stroke.d, width))}
          stroke={STROKE_COLORS[stroke.color]}
          strokeWidth={penWidth(stroke.size, width)}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </Svg>
  );
});

export interface Pen {
  color: JournalStrokeColor;
  size: JournalStrokeSize;
  rubber: boolean;
}

/** The page under a pen: takes every touch, adds a line as it is drawn, and rubs out a line it touches. */
export function DrawingPad({
  strokes,
  pen,
  width,
  height,
  onStrokes,
  onFull,
}: {
  strokes: readonly JournalStroke[];
  pen: Pen;
  width: number;
  height: number;
  onStrokes: (change: (strokes: JournalStroke[]) => JournalStroke[]) => void;
  onFull: () => void;
}) {
  const [line, setLine] = useState<Point[]>([]);
  const points = useRef<Point[]>([]);
  const origin = useRef<Point>({ x: 0, y: 0 });
  const now = useRef({ strokes, pen, width, onStrokes, onFull });
  now.current = { strokes, pen, width, onStrokes, onFull };

  const rub = (point: Point) => {
    const at = strokeAt(now.current.strokes, point, now.current.width);
    if (at === -1) return;
    now.current.strokes = now.current.strokes.filter((_stroke, index) => index !== at);
    now.current.onStrokes((current) => current.filter((_stroke, index) => index !== at));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        origin.current = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
        if (now.current.pen.rubber) {
          rub(origin.current);
          return;
        }
        points.current = [origin.current];
        setLine(points.current);
      },
      onPanResponderMove: (_event, { dx, dy }) => {
        const point = { x: origin.current.x + dx, y: origin.current.y + dy };
        if (now.current.pen.rubber) {
          rub(point);
          return;
        }
        const last = points.current[points.current.length - 1]!;
        if (Math.hypot(point.x - last.x, point.y - last.y) < POINT_EVERY) return;
        points.current = [...points.current, point];
        setLine(points.current);
      },
      onPanResponderRelease: () => {
        if (now.current.pen.rubber || points.current.length === 0) return;
        const { color, size } = now.current.pen;
        const d = encodeStroke(simplifyLine(points.current), now.current.width);
        points.current = [];
        setLine([]);
        if (hasRoomFor(now.current.strokes, d)) now.current.onStrokes((current) => [...current, { color, size, d }]);
        else now.current.onFull();
      },
      onPanResponderTerminate: () => {
        points.current = [];
        setLine([]);
      },
    }),
  ).current;

  return (
    <View {...responder.panHandlers} style={[styles.pad, { width, height }]}>
      {/* The line being drawn apart from the finished ones, so a move redraws only this. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {line.length > 0 && (
          <Svg width={width} height={height}>
            <Path d={linePath(line)} stroke={STROKE_COLORS[pen.color]} strokeWidth={penWidth(pen.size, width)} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 9500,
  },
});
