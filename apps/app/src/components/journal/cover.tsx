import { Caveat_700Bold } from "@expo-google-fonts/caveat/700Bold";
import { Marcellus_400Regular } from "@expo-google-fonts/marcellus/400Regular";
import Ionicons from "@expo/vector-icons/Ionicons";
import { spacing, Text, touchTarget } from "@vagabonds/ui";
import { useFonts } from "expo-font";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Defs, G, Line, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";

import { useMessages } from "@/i18n";
import type { StickerId } from "@/lib/journal-stickers";

import { book } from "./paper";
import { StickerArt } from "./sticker";

/** Where the cover folds at the spine. */
const HINGE = 16;
const SIDE = 22;
/** The elastic that keeps the book shut, and how far it lies from the fore-edge. */
const BAND = 13;
const BAND_FROM_EDGE = 20;
const BAND_LIGHT = "#F07F5E";
const BAND_MID = "#E0623F";
const BAND_DARK = "#B4442A";
const TILE = 54;
/** How far the invitation stands off the cover's foot. */
const FOOT_FROM_EDGE = 34;
const STAR_SQUARE = "M22 22 H78 V78 H22 Z";
/** Room for the words at the foot; a small book keeps the invitation alone. */
const ROOMY_HEIGHT = 440;
/** Below this there is no room for the stickers to be more than specks. */
const STICKERS_FROM = 84;
const NARROW_COLUMN = 170;
const TITLE_FONT = "Marcellus_400Regular";
const HAND_FONT = "Caveat_700Bold";

/** The stickers stuck on the cover, in shares of the height of the room they have. */
const COLLAGE: ReadonlyArray<{ sticker: StickerId; size: number; left: number; bottom: number; turn: number }> = [
  { sticker: "tea", size: 0.46, left: 1.22, bottom: 0.3, turn: -9 },
  { sticker: "tulip", size: 0.56, left: 0.56, bottom: 0.44, turn: 13 },
  { sticker: "pin", size: 0.38, left: 0.1, bottom: 0.6, turn: -14 },
  { sticker: "mosque", size: 0.76, left: 0, bottom: 0, turn: -6 },
  { sticker: "cat", size: 0.64, left: 0.74, bottom: 0, turn: 6 },
];
const COLLAGE_WIDTH = 1.68;

/**
 * The closed book: soft green cloth with stars pressed into it, a big title, the owner's name by hand on a label, stickers stuck on as a traveller would, and a coral elastic
 * holding it shut. Drawn at the page's measured size, flowing from the top and the foot so nothing can land
 * on anything else; the words are real text, so they scale and are read out.
 */
export function JournalCover({ width, height, name, onOpen }: { width: number; height: number; name: string; onOpen: () => void }) {
  const w = useMessages().journal;
  const [loaded] = useFonts({ Marcellus_400Regular, Caveat_700Bold });

  const left = HINGE + SIDE;
  const column = width - left - BAND_FROM_EDGE - BAND - spacing.md;
  const titleSize = Math.min(72, column / 3.5, height / 7.6);
  const titleLine = titleSize * 1.04;
  const roomy = height >= ROOMY_HEIGHT;
  // Beside the elastic there is room for the words alone, a size down.
  const narrow = column < NARROW_COLUMN;
  const nameSize = Math.min(26, titleSize * 0.42);
  const labelHeight = nameSize * 1.25 + spacing.sm;
  const top = height * 0.075;
  const footHeight = touchTarget.min + (roomy ? spacing.xl : 0);
  const written = top + titleLine * 2 + spacing.md + labelHeight + spacing.sm;
  const free = height - written - footHeight - FOOT_FROM_EDGE - spacing.md;
  const collage = Math.min(free, column / COLLAGE_WIDTH);

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={w.openLabel(name)} onPress={onOpen} style={{ width, height }}>
      {/* Keyed by size: on iOS a gradient keeps the size it was first drawn at. */}
      <Svg key={`${width}x${height}`} aria-hidden width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="cover-cloth" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#2A6B52" />
            <Stop offset="0.55" stopColor={book.hide} />
            <Stop offset="1" stopColor={book.hideDark} />
          </LinearGradient>
          <RadialGradient id="cover-light" cx="82%" cy="6%" r="75%">
            <Stop offset="0" stopColor="#CFF5E0" stopOpacity={0.22} />
            <Stop offset="1" stopColor="#CFF5E0" stopOpacity={0} />
          </RadialGradient>
          {/* Woven: two fine sets of threads, felt more than seen. */}
          <Pattern id="cover-weave" width={3} height={3} patternUnits="userSpaceOnUse">
            <Line x1={0} y1={0.5} x2={3} y2={0.5} stroke="#FFFFFF" strokeOpacity={0.035} strokeWidth={1} />
            <Line x1={0.5} y1={0} x2={0.5} y2={3} stroke="#000000" strokeOpacity={0.07} strokeWidth={1} />
          </Pattern>
          {/* The stars of a Seljuk gate, pressed into the cloth without any colour. */}
          <Pattern id="cover-tiles" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
            <G transform={`scale(${TILE / 100})`} fill="none" stroke="#FFFFFF" strokeOpacity={0.05} strokeWidth={2.4}>
              <Path d={STAR_SQUARE} />
              <Path d={STAR_SQUARE} transform="rotate(45 50 50)" />
            </G>
          </Pattern>
          <LinearGradient id="cover-fold" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#000000" stopOpacity={0.3} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0} />
          </LinearGradient>
          {/* The spine is round: dark where it turns away, lit along its crown. */}
          <LinearGradient id="cover-spine" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#000000" stopOpacity={0.5} />
            <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0.14} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.3} />
          </LinearGradient>
          {/* The board's edge: light from above, falling away at the foot and fore-edge. */}
          <LinearGradient id="cover-bevel" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.3} />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.45} />
          </LinearGradient>
        </Defs>

        <Rect width={width} height={height} fill="url(#cover-cloth)" />
        <Rect width={width} height={height} fill="url(#cover-tiles)" />
        <Rect width={width} height={height} fill="url(#cover-light)" />
        <Rect width={width} height={height} fill="url(#cover-weave)" />

        {/* The round spine, and the groove where the board hinges on it. */}
        <Rect width={HINGE} height={height} fill="url(#cover-spine)" />
        <Line x1={HINGE} y1={0} x2={HINGE} y2={height} stroke="#000000" strokeOpacity={0.55} strokeWidth={2} />
        <Line x1={HINGE + 2} y1={0} x2={HINGE + 2} y2={height} stroke="#D8F2E2" strokeOpacity={0.16} strokeWidth={1} />
        <Rect x={HINGE + 2} width={12} height={height} fill="url(#cover-fold)" />
        {/* The board's edge, catching the light. */}
        <Rect x={HINGE + 0.75} y={0.75} width={width - HINGE - 1.5} height={height - 1.5} rx={5} fill="none" stroke="url(#cover-bevel)" strokeWidth={1.5} />
      </Svg>

      <View style={[styles.written, { top, left }]}>
        <Text headingLevel={1} colorValue={book.gold} style={[styles.title, loaded ? styles.titleFont : null, { fontSize: titleSize, lineHeight: titleLine }]}>
          {w.coverTitle}
        </Text>
        <View style={[styles.label, { maxWidth: column, minHeight: labelHeight }]}>
          <View aria-hidden style={styles.labelTape} />
          <Text colorValue={book.ink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[loaded ? styles.handFont : null, { fontSize: nameSize, lineHeight: nameSize * 1.25 }]}>
            {name}
          </Text>
        </View>
      </View>

      {free >= STICKERS_FROM && (
        <View aria-hidden pointerEvents="none" style={[styles.collage, { left: left - spacing.xxs, bottom: footHeight + FOOT_FROM_EDGE + spacing.sm, height: collage, width: collage * COLLAGE_WIDTH }]}>
          {COLLAGE.map(({ sticker, size, left: at, bottom, turn }) => (
            <View key={sticker} style={[styles.stuck, { left: at * collage, bottom: bottom * collage, transform: [{ rotate: `${turn}deg` }] }]}>
              <StickerArt sticker={sticker} size={size * collage} />
            </View>
          ))}
        </View>
      )}

      <View style={[styles.foot, { left, bottom: FOOT_FROM_EDGE, maxWidth: column }]}>
        {roomy && (
          <View style={styles.privateLine}>
            <Ionicons name="lock-closed" size={12} color={book.gold} />
            <Text variant="caption" colorValue={book.gold} numberOfLines={1}>
              {w.private}
            </Text>
          </View>
        )}
        <View style={[styles.invite, narrow && styles.inviteNarrow]}>
          <Text variant={narrow ? "caption" : "label"} colorValue={book.hideDark} numberOfLines={1} style={styles.inviteWords}>
            {w.openHint}
          </Text>
          {!narrow && <Ionicons name="arrow-forward" size={16} color={book.hideDark} />}
        </View>
      </View>

      {/* Over all else, as an elastic lies; its shadow falls on what is under it. */}
      <View aria-hidden pointerEvents="none" style={[styles.bandShadow, { right: BAND_FROM_EDGE - 2 }]} />
      <Svg aria-hidden pointerEvents="none" width={BAND} height={height} style={[styles.band, { right: BAND_FROM_EDGE }]}>
        <Defs>
          <LinearGradient id="cover-band-own" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={BAND_DARK} />
            <Stop offset="0.3" stopColor={BAND_LIGHT} />
            <Stop offset="0.7" stopColor={BAND_MID} />
            <Stop offset="1" stopColor={BAND_DARK} />
          </LinearGradient>
          <Pattern id="cover-band-ribs" width={BAND} height={3} patternUnits="userSpaceOnUse">
            <Line x1={0} y1={1} x2={BAND} y2={1} stroke="#000000" strokeOpacity={0.14} strokeWidth={1} />
          </Pattern>
        </Defs>
        <Rect width={BAND} height={height} fill="url(#cover-band-own)" />
        <Rect width={BAND} height={height} fill="url(#cover-band-ribs)" />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  written: {
    position: "absolute",
    alignItems: "flex-start",
  },
  title: {
    letterSpacing: -0.5,
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  titleFont: {
    fontFamily: TITLE_FONT,
    fontWeight: "normal",
  },
  handFont: {
    fontFamily: HAND_FONT,
    fontWeight: "normal",
  },
  label: {
    justifyContent: "center",
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
    backgroundColor: book.print,
    boxShadow: "0px 2px 5px rgba(0, 0, 0, 0.4)",
    transform: [{ rotate: "-2.5deg" }],
  },
  labelTape: {
    position: "absolute",
    top: -7,
    alignSelf: "center",
    width: 42,
    height: 14,
    backgroundColor: book.tape,
    transform: [{ rotate: "3deg" }],
  },
  collage: {
    position: "absolute",
  },
  stuck: {
    position: "absolute",
  },
  foot: {
    position: "absolute",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  privateLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  invite: {
    minHeight: touchTarget.min - spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    maxWidth: "100%",
    paddingHorizontal: spacing.md,
    borderRadius: touchTarget.min,
    backgroundColor: book.gold,
  },
  inviteNarrow: {
    paddingHorizontal: spacing.sm,
  },
  inviteWords: {
    flexShrink: 1,
  },
  band: {
    position: "absolute",
    top: 0,
  },
  bandShadow: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: BAND + 3,
    backgroundColor: "rgba(0, 0, 0, 0.22)",
  },
});
