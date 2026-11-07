import Ionicons from "@expo/vector-icons/Ionicons";
import { Text } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Defs, G, Line, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { useMessages } from "@/i18n";
import { dailyPrompt } from "@/lib/journal";

import { book, usePageStyle } from "./paper";
import { StickerArt } from "./sticker";

/** The book's height for its width: flatter than two real pages, so the passport stays in view below it. */
const SHAPE = 0.6;
/** Before the width is known: the list below it does not jump. */
const WAITING_HEIGHT = 200;
/** How much of the cover shows round the pages. */
const BOARD = 8;
/** How many leaves' edges show at the sides and foot, and how far apart. */
const STACK = [4.5, 3, 1.5];
/** How far the paper rises from the spine and falls to its edge. */
const SWELL = 7;
const GUTTER = 30;
const LINE = 23;
const INNER = 16;
const RIBBON_WIDTH = 9;
/** From the spine: the writing on the left page stops before it. */
const RIBBON_FROM_SPINE = 19;
const RIBBON_TAIL = 12;
const CORNER = 20;

/**
 * Profil's way into the Anı Defteri, at the head of the page: the book lying open from above, two pages
 * either side of the spine, today's question on the left and what could be stuck in on the right. Nothing
 * here is fetched: the visitor's pages load only when the book is opened (ADR 0004).
 */
export function OpenBookLink() {
  const m = useMessages();
  const w = m.journal;
  const router = useRouter();
  const page = usePageStyle();
  const [width, setWidth] = useState(0);
  const height = width > 0 ? Math.round(width * SHAPE) : WAITING_HEIGHT;
  // Set to the book, so the words stay on a narrow page's left of the ribbon.
  const titleSize = Math.min(30, width / 12.5);
  const promptSize = Math.min(20, width / 17);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${m.profile.journal}, ${m.profile.journalNote}`}
      onPress={() => router.push("/profile/journal")}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={({ pressed }) => [styles.link, { height: height + RIBBON_TAIL }, pressed && styles.pressed]}
    >
      <View style={[styles.boardShadow, { height }]} />
      {width > 0 && (
        <>
          <Spread width={width} height={height} />
          <View aria-hidden style={[styles.pages, { height: height - BOARD * 2 }]}>
            <View style={styles.leftPage}>
              <Text numberOfLines={1} style={[page.date, { color: book.leather, fontSize: titleSize, lineHeight: titleSize + 3 }]}>
                {m.profile.journal}
              </Text>
              <Text numberOfLines={4} style={[page.body, styles.prompt, { color: page.ink, fontSize: promptSize }]}>
                {dailyPrompt(w.prompts, new Date())}
              </Text>
            </View>
            <View style={styles.rightPage}>
              <Pasted size={Math.min(width * 0.28, height * 0.5)} />
              <View style={styles.open}>
                <Text numberOfLines={1} style={[page.date, styles.openWords, { color: book.leather }]}>
                  {w.openShort}
                </Text>
                <Ionicons name="arrow-forward" size={17} color={book.leather} />
              </View>
            </View>
          </View>
        </>
      )}
    </Pressable>
  );
}

/** A print taped in with a mosque on it, and stickers stuck over its corners, as a traveller's page has. */
function Pasted({ size }: { size: number }) {
  return (
    <View style={[styles.pasted, { width: size * 1.5, height: size }]}>
      <View style={[styles.print, { width: size, height: size }]}>
        <View style={styles.tape} />
        <View style={styles.printWell}>
          <StickerArt sticker="mosque" size={size * 0.72} />
        </View>
      </View>
      <View style={[styles.stuck, { right: 0, top: -size * 0.04, transform: [{ rotate: "12deg" }] }]}>
        <StickerArt sticker="tulip" size={size * 0.56} />
      </View>
      <View style={[styles.stuck, { right: size * 0.06, bottom: -size * 0.08, transform: [{ rotate: "-7deg" }] }]}>
        <StickerArt sticker="cat" size={size * 0.56} />
      </View>
    </View>
  );
}

/** The board, the edges of the leaves, and the two curved pages falling into the spine. */
function Spread({ width, height }: { width: number; height: number }) {
  const spine = width / 2;
  const top = BOARD + SWELL;
  const foot = height - BOARD - 6;
  const left = BOARD + 5;
  const right = width - BOARD - 5;
  const reach = spine - left;
  // Each page rises from its outer edge and falls again into the spine; its foot does the same.
  const leftPage = `M${left} ${top}C${left + reach * 0.3} ${top - SWELL * 1.4} ${left + reach * 0.72} ${top - SWELL * 1.4} ${spine} ${top}L${spine} ${foot}C${left + reach * 0.72} ${foot - SWELL * 1.1} ${left + reach * 0.3} ${foot - SWELL * 1.1} ${left} ${foot}Z`;
  const rightPage = `M${right} ${top}C${right - reach * 0.3} ${top - SWELL * 1.4} ${right - reach * 0.72} ${top - SWELL * 1.4} ${spine} ${top}L${spine} ${foot}C${right - reach * 0.72} ${foot - SWELL * 1.1} ${right - reach * 0.3} ${foot - SWELL * 1.1} ${right} ${foot}Z`;
  const lines = Array.from({ length: Math.floor((foot - top - LINE) / LINE) }, (_, at) => top + LINE * (at + 1) + 4);
  const cornerY = foot - SWELL * 0.2;

  return (
    // Keyed by size: on iOS a gradient keeps the size it was first drawn at.
    <Svg key={`${width}x${height}`} aria-hidden pointerEvents="none" width={width} height={height + RIBBON_TAIL} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="spread-board" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#2A6B52" />
          <Stop offset="0.55" stopColor={book.hide} />
          <Stop offset="1" stopColor={book.hideDark} />
        </LinearGradient>
        <LinearGradient id="spread-fold-left" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={book.hideDark} stopOpacity={0} />
          <Stop offset="1" stopColor={book.hideDark} stopOpacity={0.3} />
        </LinearGradient>
        <LinearGradient id="spread-fold-right" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={book.hideDark} stopOpacity={0.3} />
          <Stop offset="1" stopColor={book.hideDark} stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id="spread-curl" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor={book.labelEdge} />
        </LinearGradient>
      </Defs>

      <Rect width={width} height={height} rx={10} fill="url(#spread-board)" />

      {/* The leaves under the open ones, showing at the sides and foot in gilt. */}
      {STACK.map((by, at) => (
        <G key={by} fill={at % 2 === 0 ? book.gilt : "#EEDFAE"}>
          <Path d={leftPage} transform={`translate(${-by} ${by})`} />
          <Path d={rightPage} transform={`translate(${by} ${by})`} />
        </G>
      ))}

      <Path d={leftPage} fill={book.paper} />
      <Path d={rightPage} fill={book.paper} />

      {/* Ruled lines stop short of the curving edges, and of the print on the right. */}
      {lines.map((y) => (
        <G key={y} stroke={book.rule} strokeWidth={1}>
          <Line x1={left + 5} y1={y} x2={spine - 8} y2={y} />
          <Line x1={spine + 8} y1={y} x2={right - 5} y2={y} />
        </G>
      ))}

      {/* The pages curving down into the spine. */}
      <Rect x={spine - GUTTER} y={BOARD} width={GUTTER} height={foot - BOARD} fill="url(#spread-fold-left)" />
      <Rect x={spine} y={BOARD} width={GUTTER} height={foot - BOARD} fill="url(#spread-fold-right)" />
      <Line x1={spine} y1={top} x2={spine} y2={foot} stroke={book.hideDark} strokeOpacity={0.4} strokeWidth={1} />

      {/* The corner lifting, as a page ready to be turned. */}
      <Path d={`M${right} ${cornerY - CORNER}L${right} ${cornerY}L${right - CORNER} ${cornerY}Z`} fill={book.hide} />
      <Path d={`M${right} ${cornerY - CORNER}L${right - CORNER} ${cornerY}L${right - CORNER * 0.95} ${cornerY - CORNER * 0.95}Z`} fill="url(#spread-curl)" />

      {/* The ribbon, lying over the left page and out at its foot. */}
      <Path
        d={`M${spine - RIBBON_FROM_SPINE} ${top - 6}H${spine - RIBBON_FROM_SPINE + RIBBON_WIDTH}V${height + RIBBON_TAIL}L${spine - RIBBON_FROM_SPINE + RIBBON_WIDTH / 2} ${height + RIBBON_TAIL - 5}L${spine - RIBBON_FROM_SPINE} ${height + RIBBON_TAIL}Z`}
        fill={book.ribbon}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  link: {
    width: "100%",
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  boardShadow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderRadius: 10,
    boxShadow: "0px 3px 5px rgba(12, 18, 14, 0.28), 0px 14px 28px rgba(12, 18, 14, 0.24)",
  },
  pages: {
    position: "absolute",
    top: BOARD,
    left: BOARD,
    right: BOARD,
    flexDirection: "row",
  },
  leftPage: {
    flex: 1,
    paddingTop: SWELL + 4,
    paddingLeft: INNER - 2,
    paddingRight: RIBBON_FROM_SPINE + 4,
  },
  prompt: {
    lineHeight: LINE,
    marginTop: 4,
  },
  rightPage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: SWELL + 12,
    paddingBottom: SWELL + 10,
    paddingLeft: INNER - 4,
    paddingRight: INNER,
  },
  pasted: {
    alignSelf: "center",
  },
  print: {
    padding: 4,
    backgroundColor: book.print,
    boxShadow: "0px 2px 5px rgba(52, 23, 32, 0.3)",
    transform: [{ rotate: "-4deg" }],
  },
  printWell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DCEBE3",
  },
  tape: {
    position: "absolute",
    zIndex: 1,
    top: -7,
    alignSelf: "center",
    width: 36,
    height: 13,
    backgroundColor: book.tape,
    transform: [{ rotate: "3deg" }],
  },
  stuck: {
    position: "absolute",
  },
  open: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
  },
  openWords: {
    fontSize: 22,
    lineHeight: 26,
  },
});
