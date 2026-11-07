import Ionicons from "@expo/vector-icons/Ionicons";
import type { JournalEntry } from "@vagabonds/contracts";
import { fontFamily, spacing, Text } from "@vagabonds/ui";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useRef } from "react";
import { Animated, Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { journalImageUri } from "@/data/journal";
import { useLang, useMessages } from "@/i18n";
import { formatDate } from "@/lib/format-date";
import { dailyPrompt, useJournal } from "@/lib/journal";
import { useReducedMotion } from "@/lib/use-reduced-motion";

import { book, usePageStyle } from "./paper";
import { StickerArt } from "./sticker";

const CARD_W = 156;
const CARD_H = 196;
/** On a short phone the sheets are smaller, so the page still fits its screen. */
const SHORT_SCREEN = 740;
const SMALL = 0.84;
const GAP = spacing.md;
/** The ruled lines, from under the date. */
const FIRST_RULE = 46;
/** What a sheet holds besides its photo: its margins, the date, the print's frame and a line under it. */
const PRINT_ROOM = 108;
const CAPTION = 22;
/** How much of a page a screen reader says on the strip; the book has the rest. */
const SAID = 120;
const RULE_GAP = 22;
/** The newest pages: the book itself holds the rest. */
const SHOWN = 8;
/** Each page lies a little crooked, as pages pinned to a board do; the one in the middle straightens. */
const TILTS = [-3, 2.5, -1.5, 3, -2.5, 1.5, -3.5, 2];
type Size = { width: number; height: number };
const TAPES = ["rgba(226, 203, 140, 0.8)", "rgba(196, 222, 214, 0.85)", "rgba(240, 190, 190, 0.8)", "rgba(206, 196, 234, 0.85)"];

/**
 * The welcome page's look into the Anı Defteri: the newest pages as small sheets on a strip, one
 * beside the other, a strip of tape at each one's top, the photo as a print or the first lines in
 * handwriting, a sticker from the page in its corner. The one in the middle straightens and comes
 * forward as the strip is swiped. The last sheet starts a new page; with no pages yet it is the
 * only one, with today's question. Any of them opens the book.
 */
export function RecentPages({ edge, gold }: { edge: number; /** The page's gold for its words, readable on it. */ gold: string }) {
  const m = useMessages();
  const w = m.journal;
  const router = useRouter();
  const journal = useJournal();
  const reduced = useReducedMotion();
  const scroll = useRef(new Animated.Value(0)).current;
  const scale = useWindowDimensions().height < SHORT_SCREEN ? SMALL : 1;
  const size = { width: Math.round(CARD_W * scale), height: Math.round(CARD_H * scale) };
  const step = size.width + GAP;

  if (journal.status !== "ready") return null;
  const entries = journal.entries.filter((entry) => entry.text?.trim() || entry.photos.length > 0).slice(0, SHOWN);
  const open = () => router.push("/profile/journal");

  // Straight and a little larger in the middle of the strip, crooked and smaller to the sides.
  const motion = (at: number) => {
    const tilt = TILTS[at % TILTS.length] ?? 0;
    if (reduced) return { transform: [{ rotate: `${tilt}deg` }] };
    const range = [(at - 1) * step, at * step, (at + 1) * step];
    return {
      transform: [
        { scale: scroll.interpolate({ inputRange: range, outputRange: [0.92, 1, 0.92], extrapolate: "clamp" }) },
        { rotate: scroll.interpolate({ inputRange: range, outputRange: [`${tilt}deg`, "0deg", `${tilt}deg`], extrapolate: "clamp" }) },
      ],
    };
  };

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text headingLevel={2} colorValue={gold} style={styles.overline}>
          {m.welcome.journalHead}
        </Text>
        {entries.length > 0 && (
          <Pressable accessibilityRole="link" onPress={open} hitSlop={10} style={({ pressed }) => [styles.all, pressed && styles.pressed]}>
            <Text variant="label" colorValue={gold} style={styles.allText}>
              {m.welcome.journalAll(journal.total)}
            </Text>
            <Ionicons name="arrow-forward" size={15} color={gold} aria-hidden />
          </Pressable>
        )}
      </View>

      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        disableIntervalMomentum
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scroll } } }], { useNativeDriver: Platform.OS !== "web" })}
        style={{ marginHorizontal: -edge }}
        contentContainerStyle={[styles.strip, { paddingHorizontal: edge }]}
      >
        {entries.map((entry, at) => (
          <Animated.View key={entry.id} style={motion(at)}>
            <Sheet entry={entry} size={size} tape={TAPES[at % TAPES.length]!} onOpen={open} />
          </Animated.View>
        ))}
        <Animated.View style={motion(entries.length)}>
          <NewSheet size={size} first={entries.length === 0} prompt={entries.length === 0 ? w.firstPrompt : dailyPrompt(w.prompts, new Date())} onOpen={open} />
        </Animated.View>
      </Animated.ScrollView>
    </View>
  );
}

function Sheet({ entry, size, tape, onOpen }: { entry: JournalEntry; size: Size; tape: string; onOpen: () => void }) {
  const m = useMessages();
  const lang = useLang();
  const page = usePageStyle();
  const date = formatDate(entry.createdAt, lang);
  const photo = entry.photos[0];
  const text = entry.text?.trim() ?? "";
  const sticker = entry.layout?.stickers[0]?.sticker;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={m.welcome.journalPage(date, text.slice(0, SAID))}
      onPress={onOpen}
      style={({ pressed }) => [styles.sheet, size, pressed && styles.pressed]}
    >
      <Lines height={size.height} />
      <View style={[styles.tape, { backgroundColor: tape, left: size.width / 2 - 34 }]} />
      <Text numberOfLines={1} style={[page.date, styles.date, { color: book.leather }]}>
        {date}
      </Text>
      {photo ? (
        <View style={styles.print}>
          <Image
            source={{ uri: journalImageUri(photo.thumbUrl), cacheKey: `journal-${photo.id}-thumb` }}
            placeholder={{ uri: photo.lqip }}
            cachePolicy="memory-disk"
            contentFit="cover"
            draggable={false}
            transition={120}
            style={[styles.printImage, { height: size.height - (text === "" ? PRINT_ROOM - CAPTION : PRINT_ROOM), backgroundColor: photo.dominantColor }]}
          />
          {text !== "" && (
            <Text numberOfLines={1} style={[page.body, styles.caption, { color: page.ink }]}>
              {text}
            </Text>
          )}
        </View>
      ) : (
        <Text numberOfLines={size.height < CARD_H ? 4 : 5} style={[page.body, styles.words, { color: page.ink }]}>
          {text}
        </Text>
      )}
      {entry.photos.length > 1 && (
        <View style={styles.more} aria-hidden>
          <Ionicons name="images" size={11} color={book.print} />
          <Text style={styles.moreText}>{entry.photos.length}</Text>
        </View>
      )}
      {sticker && (
        <View style={styles.sticker} pointerEvents="none">
          <StickerArt sticker={sticker} size={54} />
        </View>
      )}
    </Pressable>
  );
}

function NewSheet({ size, first, prompt, onOpen }: { size: Size; first: boolean; prompt: string; onOpen: () => void }) {
  const m = useMessages();
  const page = usePageStyle();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${first ? m.journal.write : m.journal.newPage}. ${prompt}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.sheet, styles.newSheet, size, pressed && styles.pressed]}
    >
      <View style={styles.plus}>
        <Ionicons name="add" size={26} color={book.gold} />
      </View>
      <Text numberOfLines={4} style={[page.body, styles.prompt]}>
        {prompt}
      </Text>
      <Text variant="label" colorValue={book.gold} style={styles.newWords}>
        {first ? m.journal.write : m.journal.newPage}
      </Text>
    </Pressable>
  );
}

/** The sheet's ruled lines and its red margin, faint: only as many lines as fit on it. */
function Lines({ height }: { height: number }) {
  const count = Math.floor((height - FIRST_RULE - spacing.sm) / RULE_GAP) + 1;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: count }, (_, at) => (
        <View key={at} style={[styles.rule, { top: FIRST_RULE + at * RULE_GAP }]} />
      ))}
      <View style={styles.margin} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.xs,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  overline: {
    fontFamily: fontFamily.sansBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 2.2,
  },
  all: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  allText: {
    fontSize: 14,
  },
  strip: {
    gap: GAP,
    paddingTop: spacing.md,
    // Room for the sheets' shadows and the stickers past their corners: the strip clips below.
    paddingBottom: spacing.xl,
  },
  sheet: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderRadius: 6,
    backgroundColor: book.paper,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: book.paperEdge,
    shadowColor: "#1B1307",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  pressed: {
    opacity: 0.85,
  },
  tape: {
    position: "absolute",
    top: -9,
    width: 68,
    height: 20,
    borderRadius: 2,
    transform: [{ rotate: "-4deg" }],
  },
  rule: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: book.rule,
  },
  margin: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 14,
    width: 1,
    backgroundColor: "rgba(196, 84, 70, 0.22)",
  },
  date: {
    fontSize: 21,
    lineHeight: 24,
  },
  print: {
    marginTop: spacing.sm + 4,
    padding: 6,
    paddingBottom: 4,
    backgroundColor: book.print,
    borderRadius: 2,
    transform: [{ rotate: "2deg" }],
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  printImage: {
    width: "100%",
  },
  caption: {
    fontSize: 17,
    lineHeight: 22,
    marginTop: 2,
  },
  words: {
    marginTop: spacing.xs,
    fontSize: 19,
    lineHeight: 22,
  },
  more: {
    position: "absolute",
    top: spacing.md,
    right: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: "rgba(31, 74, 58, 0.85)",
  },
  moreText: {
    fontFamily: fontFamily.sansBold,
    fontSize: 11,
    lineHeight: 14,
    color: book.print,
  },
  sticker: {
    position: "absolute",
    right: -10,
    bottom: -10,
    transform: [{ rotate: "12deg" }],
  },
  newSheet: {
    justifyContent: "space-between",
    alignItems: "flex-start",
    backgroundColor: book.hide,
    borderColor: book.hideDark,
  },
  plus: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: book.gold,
    borderStyle: "dashed",
  },
  prompt: {
    color: book.print,
    fontSize: 21,
    lineHeight: 25,
  },
  newWords: {
    fontSize: 14,
  },
});
