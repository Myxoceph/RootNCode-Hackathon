import { fontFamily, useTheme } from "@vagabonds/ui";
import Svg, { Defs, Ellipse, G, Mask, Path, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";

import type { LinkKind, NetworkLink, NetworkMonument } from "@/content/bursa-network";

/**
 * The drawn Bursa map from the Hayrat design, its fog, and the links between
 * monuments. Purely visual: the pins on top are separate, accessible buttons.
 * Stands in for the real map component (task Y6).
 */
export interface MapTransform {
  scale: number;
  x: number;
  y: number;
}

/** The part of the drawing that holds the monuments; it is fitted into the free screen area. */
export const MAP_FOCUS = { cx: 142, cy: 234, width: 280, height: 240 };

const FOG_MARGIN = 2000;

export function linkColor(kind: LinkKind, colors: ReturnType<typeof useTheme>["colors"]): string {
  return kind === "revenue" ? colors.highlightMark : kind === "patron" ? colors.warning : colors.success;
}

function curve(a: NetworkMonument, b: NetworkMonument): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const cx = (a.x + b.x) / 2 - dy * 0.22;
  const cy = (a.y + b.y) / 2 + dx * 0.22;
  return `M${a.x} ${a.y}Q${cx} ${cy} ${b.x} ${b.y}`;
}

const roads = [
  "M-300 252C80 232 180 272 580 242",
  "M-300 182C60 170 90 215 120 232",
  "M152 262C164 340 138 420 170 900",
  "M60 -300C80 90 100 150 112 206",
  "M206 -300C215 90 232 150 240 236",
  "M-300 330C80 320 150 300 580 310",
];

const districts: Array<[string, number, number]> = [
  ["ÇEKİRGE", 8, 150],
  ["HANLAR BÖLGESİ", 104, 350],
  ["YEŞİL", 236, 276],
  ["GÖKDERE", 186, 388],
  ["KÜLTÜRPARK", 18, 86],
];

interface FogMapProps {
  width: number;
  height: number;
  transform: MapTransform;
  monuments: NetworkMonument[];
  /** Fog clearing radius per monument id, 0 while still hidden. */
  radii: Record<string, number>;
  /** Links with both ends found: drawn in their color, fog cleared along them. */
  drawn: NetworkLink[];
  /** Links with one end found: a dashed gold trail toward the other end. */
  hints: NetworkLink[];
}

export function FogMap({ width, height, transform, monuments, radii, drawn, hints }: FogMapProps) {
  const { colors: c } = useTheme();
  const byId = Object.fromEntries(monuments.map((m) => [m.id, m]));
  const pair = (l: NetworkLink) => [byId[l.from], byId[l.to]] as const;

  return (
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        {/* Black in the mask clears the fog: solid at the center, fading out at the edge. */}
        <RadialGradient id="clearing" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#000" stopOpacity={1} />
          <Stop offset="0.55" stopColor="#000" stopOpacity={0.95} />
          <Stop offset="1" stopColor="#000" stopOpacity={0} />
        </RadialGradient>
        <Mask id="fog" maskUnits="userSpaceOnUse" x={-FOG_MARGIN} y={-FOG_MARGIN} width={FOG_MARGIN * 2 + 280} height={FOG_MARGIN * 2 + 600}>
          <Rect x={-FOG_MARGIN} y={-FOG_MARGIN} width={FOG_MARGIN * 2 + 280} height={FOG_MARGIN * 2 + 600} fill="#fff" />
          {drawn.map((l) => {
            const [a, b] = pair(l);
            return a && b ? (
              <Path key={`${l.from}-${l.to}`} d={curve(a, b)} stroke="#000" strokeOpacity={0.55} strokeWidth={30} strokeLinecap="round" fill="none" />
            ) : null;
          })}
          {monuments.map((m) => {
            const r = radii[m.id] ?? 0;
            return r > 0 ? <Ellipse key={m.id} cx={m.x} cy={m.y} rx={r} ry={r} fill="url(#clearing)" /> : null;
          })}
        </Mask>
      </Defs>

      <Rect width={width} height={height} fill={c.mapBackground} />
      <G transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
        {/* Parks, the river and the stream */}
        <G fill={c.success} opacity={0.18}>
          <Path d="M-300 470C80 440 180 500 580 450L580 900L-300 900Z" />
          <Ellipse cx={46} cy={112} rx={40} ry={26} />
          <Ellipse cx={258} cy={330} rx={22} ry={30} />
        </G>
        <G stroke={c.primary} strokeOpacity={0.25} strokeLinecap="round" fill="none">
          <Path d="M-300 400C70 372 150 424 580 362" strokeWidth={9} />
          <Path d="M178 -300C170 120 190 200 176 330" strokeWidth={5} />
        </G>
        {roads.map((d) => (
          <Path key={`edge${d}`} d={d} stroke={c.mapRoadEdge} strokeWidth={8.5} fill="none" strokeLinecap="round" />
        ))}
        {roads.map((d) => (
          <Path key={`road${d}`} d={d} stroke={c.mapRoad} strokeWidth={5.5} fill="none" strokeLinecap="round" />
        ))}
        {districts.map(([label, x, y]) => (
          <SvgText key={label} x={x} y={y} fill={c.textSecondary} fontFamily={fontFamily.sansSemiBold} fontSize={8} letterSpacing={0.6}>
            {label}
          </SvgText>
        ))}

        <Rect
          x={-FOG_MARGIN}
          y={-FOG_MARGIN}
          width={FOG_MARGIN * 2 + 280}
          height={FOG_MARGIN * 2 + 600}
          fill={c.fog}
          opacity={0.92}
          mask="url(#fog)"
        />

        {hints.map((l) => {
          const [a, b] = pair(l);
          return a && b ? (
            <Path key={`hint${l.from}-${l.to}`} d={curve(a, b)} stroke={c.highlightMark} strokeWidth={1.6} strokeDasharray="2 6" strokeLinecap="round" fill="none" />
          ) : null;
        })}
        {drawn.map((l) => {
          const [a, b] = pair(l);
          return a && b ? (
            <Path key={`line${l.from}-${l.to}`} d={curve(a, b)} stroke={linkColor(l.kind, c)} strokeWidth={2.6} strokeLinecap="round" fill="none" />
          ) : null;
        })}
      </G>
    </Svg>
  );
}
