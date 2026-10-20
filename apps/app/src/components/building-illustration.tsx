import { Fragment } from "react";
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

/**
 * The Muradiye Camii drawing from the Hayrat design, in its 1920s ("past")
 * and present-day ("now") states. Stands in for the archive photo and the
 * live camera image until real photos arrive (task H8). Decorative: the
 * screens describe the difference in words for screen readers.
 */
export function BuildingIllustration({ mode, id }: { mode: "past" | "now"; id: string }) {
  const past = mode === "past";
  const C = past
    ? { sky1: "#d2d2d2", sky2: "#bdbdbd", wall: "#a9a9a9", wall2: "#8f8f8f", dome: "#787878", dark: "#4d4d4d", ground: "#8e8e8e", tree: "#5e5e5e" }
    : { sky1: "#8FBCE6", sky2: "#E6EEF5", wall: "#D9CCB4", wall2: "#C2B399", dome: "#8794A3", dark: "#5A4F42", ground: "#B8B0A2", tree: "#4E7A49" };

  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 280 600"
      preserveAspectRatio="xMidYMid slice"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <LinearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.sky1} />
          <Stop offset="1" stopColor={C.sky2} />
        </LinearGradient>
        {past && (
          <RadialGradient id={`vignette${id}`} cx="50%" cy="50%" r="70%">
            <Stop offset="55%" stopColor="#000" stopOpacity={0} />
            <Stop offset="100%" stopColor="#1a1206" stopOpacity={0.7} />
          </RadialGradient>
        )}
      </Defs>
      <Rect width={280} height={430} fill={`url(#sky${id})`} />
      <Rect y={430} width={280} height={170} fill={C.ground} />
      {!past && <Path d="M0 470h280M0 520h280" stroke="#a49c8e" strokeWidth={1.5} />}

      {/* Minaret */}
      <Rect x={226} y={190} width={12} height={240} fill={C.wall} />
      <Rect x={221} y={244} width={22} height={6} fill={C.wall2} />
      <Path d="M225 190l7-52 7 52z" fill={C.dome} />
      <Rect x={221} y={398} width={22} height={32} fill={C.wall2} />

      {/* Prayer hall, dome and windows */}
      <Rect x={70} y={300} width={140} height={130} fill={C.wall} />
      {[90, 118, 150, 178].map((x) => (
        <Path key={x} d={`M${x} 352v-12a6 6 0 0 1 12 0v12z`} fill={C.dark} opacity={0.8} />
      ))}
      <Rect x={86} y={290} width={108} height={12} fill={C.wall2} />
      <Path d="M84 290a56 56 0 0 1 112 0z" fill={C.dome} />
      <Path d="M140 234v-14" stroke={C.dark} strokeWidth={2} />
      <Circle cx={140} cy={218} r={3} fill="none" stroke={C.dark} strokeWidth={1.5} />

      {/* Five-domed portico */}
      <Rect x={58} y={370} width={164} height={60} fill={C.wall2} />
      {[0, 1, 2, 3, 4].map((i) => {
        const x = 63 + i * 32;
        return (
          <Fragment key={i}>
            <Path d={`M${x} 430V398a12 12 0 0 1 24 0V430z`} fill={C.dark} />
            <Path d={`M${x - 1} 370a13 13 0 0 1 26 0z`} fill={C.dome} />
          </Fragment>
        );
      })}

      {past ? (
        <G>
          {/* Wooden houses and two passers-by in fezzes */}
          <Circle cx={30} cy={300} r={34} fill={C.tree} />
          <Rect x={-6} y={350} width={54} height={80} fill="#6c6c6c" />
          <Rect x={-10} y={322} width={64} height={40} fill="#777" />
          <Path d="M-16 324L22 296 60 324z" fill="#4f4f4f" />
          <Rect x={6} y={332} width={9} height={13} fill="#3c3c3c" />
          <Rect x={28} y={332} width={9} height={13} fill="#3c3c3c" />
          <Rect x={16} y={390} width={12} height={40} fill="#3c3c3c" />
          <Rect x={246} y={372} width={44} height={58} fill="#6f6f6f" />
          <Path d="M240 374L268 352 296 374z" fill="#505050" />
          <Rect x={256} y={384} width={8} height={11} fill="#3c3c3c" />
          <G fill="#3a3a3a">
            <Circle cx={118} cy={452} r={4} />
            <Rect x={114} y={456} width={8} height={20} rx={3} />
            <Rect x={115} y={446} width={6} height={4} fill="#5a2a2a" />
            <Circle cx={134} cy={455} r={3.6} />
            <Rect x={130.5} y={459} width={7} height={18} rx={3} />
          </G>
          <Rect width={280} height={600} fill={`url(#vignette${id})`} />
        </G>
      ) : (
        <G>
          {/* Tree, street lamp, scaffolding on the west front and a parked car */}
          <Circle cx={26} cy={330} r={30} fill={C.tree} />
          <Circle cx={46} cy={352} r={24} fill="#5E8A57" />
          <Rect x={30} y={360} width={6} height={70} fill="#5b4a3a" />
          <Rect x={50} y={360} width={2.5} height={100} fill="#3c4148" />
          <Path d="M51 360h12" stroke="#3c4148" strokeWidth={2.5} />
          <Rect x={60} y={362} width={8} height={4} fill="#f3e2a4" />
          <Path
            d="M62 290v140M76 290v140M90 290v140M62 300h28M62 322h28M62 344h28M62 366h28M62 388h28M62 410h28M62 300l28 22M90 344l-28 22M62 388l28 22"
            stroke="#7b6b55"
            strokeWidth={2}
          />
          <Rect x={62} y={292} width={28} height={80} fill="#3f6b55" opacity={0.35} />
          <Path d="M168 470h74l-6-14-14-8h-30l-14 9z" fill="#2E4E7A" />
          <Rect x={168} y={466} width={76} height={10} rx={4} fill="#26426A" />
          <Circle cx={184} cy={477} r={7} fill="#1d1d1d" />
          <Circle cx={228} cy={477} r={7} fill="#1d1d1d" />
          <Path d="M186 457h12l3-8h-11z M205 457h14l-4-8h-12z" fill="#9fc1e0" />
        </G>
      )}
    </Svg>
  );
}
