import type { RewardArt as Art, RewardKind } from "@vagabonds/contracts";
import { palette } from "@vagabonds/ui";
import type { ReactNode } from "react";
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";

/**
 * Each reward drawn as what it is: the mug, the notebook, the cap, the shirt, the museum's ticket,
 * the tea at the han's café. The drawing picked in the admin panel (`art`) comes first; without one
 * a reward is drawn by what its code says it
 * is ("kupa", "defter", "muze"…), and failing that by its kind. Flat, each in its own colours, on a
 * 120 × 120 square; decorative, as the card says what the reward is in words.
 */
export function RewardArt({ code, kind, art: chosen = null, size = 96 }: { code: string; kind: RewardKind; art?: Art | null; size?: number }) {
  const art = ART[chosen ?? pick(code, kind)];
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" aria-hidden>
      {/* The shadow it stands on. */}
      <Ellipse cx={60} cy={104} rx={34} ry={5} fill={INK} fillOpacity={0.14} />
      {art()}
    </Svg>
  );
}


/** By the sample catalogue's codes (docs/rewards.md), then by words in the code, then by kind. */
const BY_CODE: Record<string, Art> = {
  "vakif-kupa": "mug",
  "vakif-defter": "notebook",
  "vakif-sapka": "cap",
  "vakif-tisort": "shirt",
  "vgm-muze-giris": "ticket",
  "han-kafe-indirim": "tea",
};
const BY_WORD: Array<[RegExp, Art]> = [
  [/kupa|mug|cup|bardak/, "mug"],
  [/defter|notebook|ajanda|kitap|book/, "notebook"],
  [/sapka|hat|cap|bere/, "cap"],
  [/tisort|shirt|sweat|hoodie/, "shirt"],
  [/muze|museum|giris|bilet|ticket/, "ticket"],
  [/kafe|cafe|kahve|coffee|cay|tea|cafe/, "tea"],
];
const BY_KIND: Record<RewardKind, Art> = { merch: "gift", museum: "museum", discount: "tag", experience: "lantern" };

export function pick(code: string, kind: RewardKind): Art {
  return BY_CODE[code] ?? BY_WORD.find(([words]) => words.test(code))?.[1] ?? BY_KIND[kind];
}

const INK = palette.gece900;
const GOLD = palette.altin300;
const GOLD_DEEP = palette.altin600;
const PAPER = "#FBF6EA";
const WHITE = "#FFFFFF";
/** The colours of the things themselves, from çini, kilim and the bazaar: each drawing has its own. */
const TURQUOISE = "#1F9A9E";
const TURQUOISE_LIGHT = "#5FC4C2";
const TURQUOISE_DEEP = "#13696D";
const LAPIS = "#2C55A8";
const LAPIS_DEEP = "#1C3672";
const POMEGRANATE = "#C2362F";
const POMEGRANATE_DEEP = "#8E2027";
const EMERALD = "#2F9467";
const EMERALD_DEEP = "#1F6B49";
const SAFFRON = "#F0A63A";
const TEA = "#B8401C";
const ROSE = "#E46A7E";
const VIOLET = "#7B4FA0";
const LEAF = "#5BAA4A";
const CREAM = "#F6E7C1";
const STEAM = "#B9C2CF";

/** The eight-pointed Seljuk star, the app's mark, at (x, y). */
function Star({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  const s = r * 0.72;
  return (
    <G>
      <Rect x={x - s} y={y - s} width={s * 2} height={s * 2} fill={fill} />
      <Rect x={x - s} y={y - s} width={s * 2} height={s * 2} fill={fill} transform={`rotate(45 ${x} ${y})`} />
    </G>
  );
}

/** A çini tulip: three petals on a stem with two leaves. */
function Tulip({ x, y, s, petal, heart }: { x: number; y: number; s: number; petal: string; heart: string }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Path d="M0 10 v12" stroke={LEAF} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M0 18 q-6 -2 -7 -7 q5 1 7 5 Z M0 20 q6 -2 7 -7 q-5 1 -7 5 Z" fill={LEAF} />
      <Path d="M-6 0 q0 9 6 11 q6 -2 6 -11 q-3 3 -6 -2 q-3 5 -6 2 Z" fill={petal} />
      <Path d="M0 -2 q-2 6 0 12 q2 -6 0 -12 Z" fill={heart} />
    </G>
  );
}

/** A kilim band: a row of diamonds in turn of colours, between two lines. */
function Kilim({ x, y, w, h, colors, edge }: { x: number; y: number; w: number; h: number; colors: string[]; edge: string }) {
  const n = Math.max(1, Math.round(w / h));
  const step = w / n;
  return (
    <G>
      {Array.from({ length: n }, (_, i) => {
        const cx = x + step * (i + 0.5);
        return <Path key={i} d={`M${cx} ${y} l${step / 2} ${h / 2} l${-step / 2} ${h / 2} l${-step / 2} ${-h / 2} Z`} fill={colors[i % colors.length]} />;
      })}
      <Path d={`M${x} ${y} h${w} M${x} ${y + h} h${w}`} stroke={edge} strokeWidth={1.4} />
    </G>
  );
}

function Percent({ x, y, s, fill }: { x: number; y: number; s: number; fill: string }) {
  return (
    <G>
      <Circle cx={x - s * 0.45} cy={y - s * 0.45} r={s * 0.22} fill={fill} />
      <Circle cx={x + s * 0.45} cy={y + s * 0.45} r={s * 0.22} fill={fill} />
      <Line x1={x + s * 0.6} y1={y - s * 0.7} x2={x - s * 0.6} y2={y + s * 0.7} stroke={fill} strokeWidth={s * 0.2} strokeLinecap="round" />
    </G>
  );
}

const ART: Record<Art, () => ReactNode> = {
  mug: () => (
    <G>
      <Path d="M48 30 c-5 -6 5 -9 0 -16 M60 28 c-5 -6 5 -9 0 -16 M72 30 c-5 -6 5 -9 0 -16" stroke={STEAM} strokeWidth={3} strokeLinecap="round" fill="none" />
      <Path d="M80 52 h6 a12 12 0 0 1 0 24 h-6" stroke={LAPIS} strokeWidth={7} fill="none" strokeLinecap="round" />
      <Path d="M80 52 h6 a12 12 0 0 1 0 24 h-6" stroke={SAFFRON} strokeWidth={2} fill="none" strokeLinecap="round" />
      <Path d="M34 40 h48 v50 a10 10 0 0 1 -10 10 h-28 a10 10 0 0 1 -10 -10 Z" fill={WHITE} />
      {/* A çini mug: a turquoise rim, a kilim band, tulips in red and violet round a gold star, a lapis foot. */}
      <Rect x={34} y={40} width={48} height={8} rx={3} fill={TURQUOISE} />
      <Rect x={34} y={46} width={48} height={2} fill={GOLD} />
      <Kilim x={34} y={50} w={48} h={6} colors={[POMEGRANATE, TURQUOISE, SAFFRON, LAPIS]} edge={LAPIS_DEEP} />
      <Tulip x={42} y={62} s={0.8} petal={POMEGRANATE} heart={SAFFRON} />
      <Tulip x={74} y={62} s={0.8} petal={VIOLET} heart={ROSE} />
      <Circle cx={58} cy={72} r={10} fill={GOLD} />
      <Circle cx={58} cy={72} r={10} stroke={LAPIS} strokeWidth={1.5} fill="none" />
      <Star x={58} y={72} r={6.5} fill={POMEGRANATE} />
      <Circle cx={58} cy={72} r={2} fill={TURQUOISE_LIGHT} />
      <Path d="M34 88 h48 v2 a10 10 0 0 1 -10 10 h-28 a10 10 0 0 1 -10 -10 Z" fill={LAPIS} />
      <Path d="M38 92 h40" stroke={TURQUOISE_LIGHT} strokeWidth={1.5} strokeDasharray="2 3" />
    </G>
  ),
  notebook: () => (
    <G transform="rotate(-8 60 62)">
      {/* The pages' edge, in saffron gilt. */}
      <Rect x={31} y={23} width={58} height={78} rx={6} fill={SAFFRON} />
      <Path d="M88 28 v68" stroke={CREAM} strokeWidth={1.2} strokeDasharray="1 2" />
      <Rect x={28} y={20} width={58} height={78} rx={6} fill={POMEGRANATE} />
      <Rect x={28} y={20} width={10} height={78} rx={3} fill={EMERALD_DEEP} />
      <Path d="M30 30 h6 M30 50 h6 M30 70 h6 M30 88 h6" stroke={GOLD} strokeWidth={2} />
      {/* A kitabe panel: a cream field in a gold frame, the lines in lapis, turquoise corners. */}
      <Rect x={43} y={28} width={37} height={62} rx={3} fill={GOLD} />
      <Rect x={46} y={31} width={31} height={56} rx={2} fill={CREAM} />
      {/* The panel's corners, turned to point inward. */}
      <Path d="M46 31 h8 l-8 8 Z" fill={TURQUOISE} />
      <Path d="M77 31 v8 l-8 -8 Z" fill={TURQUOISE} />
      <Path d="M46 87 v-8 l8 8 Z" fill={TURQUOISE} />
      <Path d="M77 87 h-8 l8 -8 Z" fill={TURQUOISE} />
      <Path d="M51 45 q4 -5 8 0 t8 0 t5 0 M51 54 q4 -5 8 0 t8 0 t5 0" stroke={LAPIS} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <Tulip x={61.5} y={60} s={0.62} petal={POMEGRANATE} heart={SAFFRON} />
      {/* Two ribbons. */}
      <Path d="M68 98 v13 l3.5 -4 l3.5 4 v-13 Z" fill={TURQUOISE} />
      <Path d="M76 98 v9 l3 -3 l3 3 v-9 Z" fill={SAFFRON} />
      <G transform="rotate(38 92 56)">
        <Rect x={88} y={22} width={8} height={56} rx={4} fill={LAPIS} />
        <Rect x={88} y={40} width={8} height={4} fill={POMEGRANATE} />
        <Rect x={88} y={30} width={8} height={5} fill={GOLD} />
        <Path d="M88 78 h8 l-4 10 Z" fill={CREAM} />
        <Path d="M91 84 h2 l-1 4 Z" fill={INK} />
      </G>
    </G>
  ),
  cap: () => (
    <G>
      <Path d="M24 76 a36 36 0 0 1 72 0 Z" fill={LAPIS} />
      {/* Panels in turn of colours, and a kilim band round it. */}
      <Path d="M60 40 a36 36 0 0 1 22 9 l-8 27 h-14 Z" fill={TURQUOISE} />
      <Path d="M60 40 a36 36 0 0 0 -22 9 l8 27 h14 Z" fill={LAPIS_DEEP} fillOpacity={0.35} />
      <Kilim x={26} y={66} w={68} h={8} colors={[SAFFRON, POMEGRANATE, WHITE, EMERALD]} edge={GOLD} />
      <Path d="M18 76 h70 q22 0 22 8 q0 5 -12 5 h-80 q-6 0 -6 -6 q0 -7 6 -7 Z" fill={POMEGRANATE} />
      <Path d="M24 80 h76" stroke={SAFFRON} strokeWidth={1.5} strokeDasharray="3 3" />
      <Circle cx={60} cy={39} r={4.5} fill={SAFFRON} />
      <Circle cx={50} cy={54} r={8} fill={GOLD} />
      <Star x={50} y={54} r={5} fill={POMEGRANATE} />
      <Circle cx={50} cy={54} r={1.6} fill={WHITE} />
    </G>
  ),
  shirt: () => (
    <G>
      <Path d="M44 22 q16 12 32 0 l26 12 l-10 22 l-10 -5 v49 h-44 v-49 l-10 5 l-10 -22 Z" fill={EMERALD} />
      {/* Sleeves in saffron, the collar in pomegranate. */}
      <Path d="M76 22 l26 12 l-10 22 l-10 -5 Z" fill={SAFFRON} />
      <Path d="M44 22 l-26 12 l10 22 l10 -5 Z" fill={SAFFRON} />
      <Path d="M28 50 l10 -5 M92 50 l-10 -5" stroke={POMEGRANATE} strokeWidth={3} strokeLinecap="round" />
      <Path d="M44 22 q16 12 32 0" stroke={POMEGRANATE} strokeWidth={4} fill="none" />
      {/* Three cities on the chest, each its own colour, over a kilim band. */}
      <Path d="M45 64 a5 5 0 0 1 10 0 Z" fill={GOLD} />
      <Path d="M55 64 a5 5 0 0 1 10 0 Z" fill={TURQUOISE_LIGHT} />
      <Path d="M65 64 a5 5 0 0 1 10 0 Z" fill={ROSE} />
      <Rect x={50} y={56} width={1.5} height={4} fill={GOLD} />
      <Rect x={60} y={56} width={1.5} height={4} fill={TURQUOISE_LIGHT} />
      <Rect x={70} y={56} width={1.5} height={4} fill={ROSE} />
      <Rect x={45} y={64} width={30} height={2.5} fill={WHITE} />
      <Kilim x={38} y={84} w={44} h={7} colors={[POMEGRANATE, WHITE, LAPIS, SAFFRON]} edge={EMERALD_DEEP} />
    </G>
  ),
  ticket: () => (
    <G transform="rotate(-10 60 62)">
      <Path d="M14 40 h92 v12 a8 8 0 0 0 0 16 v12 h-92 v-12 a8 8 0 0 0 0 -16 Z" fill={LAPIS} />
      <Path d="M78 40 h28 v12 a8 8 0 0 0 0 16 v12 h-28 Z" fill={SAFFRON} />
      <Kilim x={18} y={42} w={56} h={5} colors={[POMEGRANATE, TURQUOISE_LIGHT, GOLD, WHITE]} edge={LAPIS_DEEP} />
      <Line x1={78} y1={42} x2={78} y2={78} stroke={PAPER} strokeWidth={2} strokeDasharray="3 3" />
      {/* The museum's gate: a turquoise dome over a cream arch with a red door. */}
      <Path d="M30 74 v-14 a8 8 0 0 1 16 0 v14 Z" fill={CREAM} />
      <Path d="M28 56 a10 10 0 0 1 20 0 Z" fill={TURQUOISE_LIGHT} />
      <Rect x={37} y={41} width={2} height={5} fill={GOLD} />
      <Path d="M35 74 v-10 a3 3 0 0 1 6 0 v10 Z" fill={POMEGRANATE} />
      <Path d="M54 56 h18" stroke={GOLD} strokeWidth={3} strokeLinecap="round" />
      <Path d="M54 63 h14" stroke={TURQUOISE_LIGHT} strokeWidth={3} strokeLinecap="round" />
      <Path d="M54 70 h16" stroke={PAPER} strokeWidth={3} strokeLinecap="round" />
      <Circle cx={92} cy={60} r={9} fill={POMEGRANATE} />
      <Star x={92} y={60} r={5.5} fill={GOLD} />
    </G>
  ),
  tea: () => (
    <G>
      {/* A tulip glass of tea on its saucer, and the discount's tag. */}
      <Ellipse cx={52} cy={96} rx={30} ry={6} fill={POMEGRANATE} />
      <Ellipse cx={52} cy={95} rx={26} ry={4.5} fill={WHITE} />
      <Ellipse cx={52} cy={95} rx={16} ry={2.6} stroke={GOLD} strokeWidth={1.4} fill="none" />
      {[30, 40, 64, 74].map((x) => (
        <Circle key={x} cx={x} cy={96} r={1.3} fill={LAPIS} />
      ))}
      <Path d="M36 38 h32 q-4 12 -4 24 q0 16 6 28 h-36 q6 -12 6 -28 q0 -12 -4 -24 Z" fill="#EAF3F6" fillOpacity={0.95} />
      <Path d="M39 50 h26 q-2 6 -2 12 q0 14 5 24 h-32 q5 -10 5 -24 q0 -6 -2 -12 Z" fill={TEA} />
      <Path d="M40 50 h24" stroke={SAFFRON} strokeWidth={2} />
      <Path d="M43 54 q-1 14 2 28" stroke={WHITE} strokeOpacity={0.5} strokeWidth={3} strokeLinecap="round" fill="none" />
      <Path d="M36 38 h32" stroke={GOLD_DEEP} strokeWidth={2.5} />
      <Path d="M50 32 c-4 -5 4 -8 0 -14" stroke={STEAM} strokeWidth={2.5} strokeLinecap="round" fill="none" />
      {/* A sugar cube and a spoon. */}
      <Rect x={73} y={86} width={7} height={7} rx={1.5} fill={WHITE} stroke={STEAM} strokeWidth={0.8} />
      <Path d="M18 84 l18 10" stroke={GOLD_DEEP} strokeWidth={2.2} strokeLinecap="round" />
      <Ellipse cx={17} cy={83} rx={3.5} ry={2.2} fill={GOLD} transform="rotate(30 17 83)" />
      <G transform="rotate(14 92 44)">
        <Path d="M78 30 h22 a4 4 0 0 1 4 4 v20 a4 4 0 0 1 -4 4 h-22 l-8 -14 Z" fill={SAFFRON} />
        <Path d="M100 30 a4 4 0 0 1 4 4 v20 a4 4 0 0 1 -4 4 h-3 v-28 Z" fill={POMEGRANATE} />
        <Circle cx={78} cy={44} r={2.5} fill={PAPER} />
        <Percent x={89} y={44} s={8} fill={LAPIS_DEEP} />
      </G>
      <Path d="M76 44 q-8 -8 -2 -18" stroke={TURQUOISE} strokeWidth={1.6} fill="none" strokeLinecap="round" />
    </G>
  ),
  gift: () => (
    <G>
      <Rect x={28} y={50} width={64} height={48} rx={5} fill={POMEGRANATE} />
      <Rect x={24} y={40} width={72} height={16} rx={4} fill={POMEGRANATE} />
      <Rect x={24} y={52} width={72} height={4} fill={POMEGRANATE_DEEP} />
      <Rect x={55} y={40} width={10} height={58} fill={GOLD} />
      <Path d="M60 40 c-10 -18 -28 -10 -18 0 Z M60 40 c10 -18 28 -10 18 0 Z" fill={TURQUOISE} />
      <Star x={42} y={76} r={4} fill={GOLD} />
      <Star x={78} y={76} r={4} fill={GOLD} />
    </G>
  ),
  museum: () => (
    <G>
      <Path d="M60 18 a22 22 0 0 1 22 22 h-44 a22 22 0 0 1 22 -22 Z" fill={TURQUOISE} />
      <Rect x={58.5} y={10} width={3} height={8} fill={GOLD} />
      <Rect x={22} y={40} width={76} height={8} rx={2} fill={SAFFRON} />
      <Rect x={26} y={48} width={68} height={46} fill={PAPER} />
      {[34, 54, 74].map((x) => (
        <Path key={x} d={`M${x} 94 v-24 a6 6 0 0 1 12 0 v24 Z`} fill={LAPIS} />
      ))}
      <Path d="M26 60 h68" stroke={POMEGRANATE} strokeWidth={2} strokeDasharray="4 3" />
      <Rect x={20} y={94} width={80} height={6} rx={2} fill={INK} fillOpacity={0.35} />
    </G>
  ),
  tag: () => (
    <G transform="rotate(-18 60 60)">
      <Path d="M32 34 h46 l20 26 l-20 26 h-46 a6 6 0 0 1 -6 -6 v-40 a6 6 0 0 1 6 -6 Z" fill={POMEGRANATE} />
      <Circle cx={80} cy={60} r={5} fill={PAPER} />
      <Path d="M85 60 q14 -2 20 -14" stroke={TURQUOISE} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <Percent x={52} y={60} s={14} fill={GOLD} />
    </G>
  ),
  lantern: () => (
    <G>
      <Path d="M60 12 v10" stroke={GOLD_DEEP} strokeWidth={3} strokeLinecap="round" />
      <Path d="M48 30 a12 8 0 0 1 24 0 Z" fill={GOLD} />
      <Path d="M44 30 h32 l6 50 h-44 Z" fill={TURQUOISE_DEEP} />
      <Path d="M48 36 h10 l-1 38 h-11 Z" fill={POMEGRANATE} fillOpacity={0.9} />
      <Path d="M62 36 h10 l2 38 h-11 Z" fill={TURQUOISE_LIGHT} fillOpacity={0.9} />
      <Path d="M60 46 q-6 9 0 18 q6 -9 0 -18 Z" fill={SAFFRON} />
      <Rect x={36} y={80} width={48} height={8} rx={3} fill={GOLD_DEEP} />
      <Path d="M56 22 h8 v8 h-8 Z" fill={GOLD_DEEP} />
    </G>
  ),
};
