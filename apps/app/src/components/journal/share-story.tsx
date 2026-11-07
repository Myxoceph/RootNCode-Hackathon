import Ionicons from "@expo/vector-icons/Ionicons";
import { Marcellus_400Regular } from "@expo-google-fonts/marcellus/400Regular";
import type { JournalEntry } from "@vagabonds/contracts";
import { radius, spacing, Text, touchTarget } from "@vagabonds/ui";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, G, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";

import { useLang, useMessages } from "@/i18n";
import { announce } from "@/lib/announce";
import { formatDate } from "@/lib/format-date";
import type { PendingPhoto } from "@/lib/journal";
import { shareViewAsImage, STORY_SIZE } from "@/lib/share-image";

import { EntryPage } from "./pages";
import { book, desk } from "./paper";

const TITLE_FONT = "Marcellus_400Regular";
const STORY_ASPECT = STORY_SIZE.width / STORY_SIZE.height;
/** The card is drawn for this width and scaled with it, so the picture is the same on every phone. */
const BASE = 360;
/** How much of the card the page may take: room above for the title, below for the name. */
const PAGE_SHARE = { width: 0.88, height: 0.7 };
/** The page alone: as wide as a story, as tall as what is on it. */
const PAGE_ONLY_WIDTH = STORY_SIZE.width;
const PAGE_TILT = -1.2;
const TILE = 44;
const STAR = "M22 22 H78 V78 H22 Z";

type TemplateId = "story" | "light" | "page";
const TEMPLATES: readonly TemplateId[] = ["story", "light", "page"];

/** The two story cards: the cover's green, and a light one like the room the book lies in by day. */
const THEMES = {
  story: { id: "story", top: book.hideLight, foot: book.hideDark, glow: "#FFFFFF", glowOpacity: 0.14, tile: book.gold, tileOpacity: 0.09, title: book.gold, date: desk.ink, brand: book.gold, rule: book.gilt },
  light: { id: "light", top: "#F7F1E4", foot: "#E4D7BE", glow: "#FFFFFF", glowOpacity: 0.7, tile: book.leather, tileOpacity: 0.07, title: book.leather, date: book.inkSoft, brand: book.leather, rule: book.gilt },
} as const;
type Theme = (typeof THEMES)[keyof typeof THEMES];

type CardRef = (view: ComponentRef<typeof View> | null) => void;

interface PageProps {
  entry: JournalEntry;
  number: number;
  total: number;
  pending: PendingPhoto[];
  pageWidth: number;
  pageHeight: number;
  onMeasured: (height: number) => void;
}

/**
 * A page of the book as a picture to send, in a few templates side by side: swiped between, or chosen
 * by name below. Shown first, so what goes out is what was seen; the system's share sheet chooses
 * where (WhatsApp, an Instagram story, …).
 */
export function ShareStory({
  entry,
  number,
  total,
  pending,
  pageWidth,
  pageHeight,
  onClose,
}: {
  entry: JournalEntry;
  number: number;
  total: number;
  pending: PendingPhoto[];
  pageWidth: number;
  pageHeight: number;
  onClose: () => void;
}) {
  const messages = useMessages();
  const w = messages.journal;
  const s = w.share;
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const [titleLoaded] = useFonts({ Marcellus_400Regular });
  const cards = useRef<Record<TemplateId, ComponentRef<typeof View> | null>>({ story: null, light: null, page: null });
  const pager = useRef<ComponentRef<typeof ScrollView>>(null);
  const [room, setRoom] = useState({ width: 0, height: 0 });
  const [at, setAt] = useState(0);
  /** The page's own height when only as long as what is on it, before it is scaled. */
  const [measured, setMeasured] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const date = formatDate(entry.createdAt, lang);
  const waiting = pending.length > 0;
  const template = TEMPLATES[at] ?? "story";

  // The largest story that fits, a little in from the edges.
  const cardWidth = Math.floor(Math.max(0, Math.min(room.width - spacing.xl * 2, (room.height - spacing.md * 2) * STORY_ASPECT)));
  const cardHeight = Math.floor(cardWidth / STORY_ASPECT);
  const shownHeight = Math.min(measured || pageHeight, pageHeight * 2);
  const pageProps: PageProps = { entry, number, total, pending, pageWidth, pageHeight, onMeasured: setMeasured };
  const ready = cardWidth > 0 && pageWidth > 0 && shownHeight > 0;

  const choose = (next: number) => {
    const target = Math.max(0, Math.min(next, TEMPLATES.length - 1));
    setAt(target);
    pager.current?.scrollTo({ x: target * room.width, animated: true });
    announce(s.templateLabel(s.templates[TEMPLATES[target] ?? "story"], target + 1, TEMPLATES.length));
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const size = template === "page" ? { width: PAGE_ONLY_WIDTH, height: Math.round((PAGE_ONLY_WIDTH * shownHeight) / pageWidth) } : STORY_SIZE;
      const result = await shareViewAsImage({ current: cards.current[template] }, s.title, size);
      if (result === "unavailable") setError(s.unavailable);
    } catch {
      setError(s.failed);
      announce(s.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar style="light" />
      <View style={[styles.screen, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]} accessibilityViewIsModal>
        <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={messages.common.close} onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={desk.ink} />
          </Pressable>
          <Text headingLevel={1} numberOfLines={1} colorValue={book.gold} style={[styles.title, titleLoaded ? styles.titleFont : null]}>
            {s.title}
          </Text>
          <View style={styles.closeButton} />
        </View>

        <View style={styles.stage} onLayout={({ nativeEvent: { layout } }) => setRoom({ width: layout.width, height: layout.height })}>
          {ready && (
            <ScrollView
              ref={pager}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={({ nativeEvent }) => setAt(Math.round(nativeEvent.contentOffset.x / Math.max(1, room.width)))}
            >
              {TEMPLATES.map((id, index) => (
                <View
                  key={id}
                  accessibilityElementsHidden={index !== at}
                  importantForAccessibility={index === at ? "auto" : "no-hide-descendants"}
                  style={[styles.slide, { width: room.width, height: room.height }]}
                >
                  {id === "page" ? (
                    <PageOnly
                      {...pageProps}
                      cardRef={(view) => {
                        cards.current.page = view;
                      }}
                      boxWidth={cardWidth}
                      boxHeight={room.height - spacing.md * 2}
                      shownHeight={shownHeight}
                      measured={measured > 0}
                      label={s.imageLabel(date)}
                    />
                  ) : (
                    <StoryCard
                      {...pageProps}
                      cardRef={(view) => {
                        cards.current[id] = view;
                      }}
                      theme={THEMES[id]}
                      width={cardWidth}
                      height={cardHeight}
                      shownHeight={shownHeight}
                      measured={measured > 0}
                      date={date}
                      title={w.title}
                      brand={s.brand}
                      titleFont={titleLoaded}
                      label={s.imageLabel(date)}
                    />
                  )}
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.actions}>
          {/* The same choice as the swipe, for those who do not swipe. */}
          <View accessibilityRole="tablist" style={styles.chips}>
            {TEMPLATES.map((id, index) => {
              const on = index === at;
              return (
                <Pressable
                  key={id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={s.templateLabel(s.templates[id], index + 1, TEMPLATES.length)}
                  onPress={() => choose(index)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text variant="caption" numberOfLines={1} colorValue={on ? book.hideDark : desk.ink}>
                    {s.templates[id]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text aria-hidden variant="caption" colorValue={desk.inkSoft} style={styles.hint}>
            {s.swipe}
          </Text>
          {(error || waiting) && (
            <View accessibilityRole={error ? "alert" : undefined} accessibilityLiveRegion="polite" style={styles.notePill}>
              <Ionicons name={error ? "alert-circle" : "cloud-upload-outline"} size={18} color={error ? book.danger : book.leather} />
              <Text variant="caption" colorValue={error ? book.danger : book.ink} style={styles.flex}>
                {error ?? s.waiting}
              </Text>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityHint={s.hint}
            accessibilityState={{ disabled: busy || waiting, busy }}
            disabled={busy || waiting}
            onPress={() => void send()}
            style={[styles.sendButton, (busy || waiting) && styles.sendOff]}
          >
            {busy ? <ActivityIndicator color={book.hideDark} /> : <Ionicons name={Platform.OS === "ios" ? "share-outline" : "share-social"} size={20} color={book.hideDark} />}
            <Text variant="label" numberOfLines={1} colorValue={book.hideDark}>
              {busy ? s.sending : s.send}
            </Text>
          </Pressable>
          <Text variant="caption" colorValue={desk.inkSoft} style={styles.hint}>
            {s.hint}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

/** The page as it is in the book, still, at its own size: scaled from outside, measured from inside. */
function Page({ entry, number, total, pending, pageWidth, pageHeight, onMeasured, scale }: PageProps & { scale: number }) {
  return (
    <View onLayout={({ nativeEvent: { layout } }) => onMeasured(Math.ceil(layout.height))} style={{ width: pageWidth, transform: [{ scale }], transformOrigin: "top left" }}>
      <EntryPage entry={entry} number={number} total={total} pending={pending} width={pageWidth} height={pageHeight} active={false} still onEdit={() => {}} onOpenPhoto={() => {}} />
    </View>
  );
}

/** A story: the page lying on a coloured ground, the book's name above it and the app's below. */
function StoryCard({
  cardRef,
  theme,
  width,
  height,
  shownHeight,
  measured,
  date,
  title,
  brand,
  titleFont,
  label,
  ...page
}: PageProps & {
  cardRef: CardRef;
  theme: Theme;
  width: number;
  height: number;
  shownHeight: number;
  measured: boolean;
  date: string;
  title: string;
  brand: string;
  titleFont: boolean;
  label: string;
}) {
  const k = width / BASE;
  const scale = Math.min((width * PAGE_SHARE.width) / page.pageWidth, (height * PAGE_SHARE.height) / shownHeight);
  return (
    // What is captured: everything inside this view, at the story's size.
    <View ref={cardRef} collapsable={false} accessible accessibilityRole="image" accessibilityLabel={label} style={[styles.card, { width, height, borderRadius: 14 * k, backgroundColor: theme.foot }]}>
      <Backdrop width={width} height={height} theme={theme} />
      <View style={[styles.cardHead, { paddingTop: height * 0.065 }]}>
        <Text colorValue={theme.title} style={[styles.storyTitle, titleFont ? styles.titleFont : null, { fontSize: 42 * k, lineHeight: 50 * k }]}>
          {title}
        </Text>
        <View style={[styles.ornament, { gap: 8 * k, marginVertical: 10 * k }]}>
          <View style={[styles.rule, { width: 40 * k, backgroundColor: theme.rule }]} />
          <View style={[styles.diamond, { width: 6 * k, height: 6 * k, backgroundColor: theme.rule }]} />
          <View style={[styles.rule, { width: 40 * k, backgroundColor: theme.rule }]} />
        </View>
        <Text colorValue={theme.date} style={{ fontSize: 16 * k, lineHeight: 22 * k, letterSpacing: 0.4 * k }}>
          {date}
        </Text>
      </View>

      <View style={styles.pageRoom}>
        <View style={{ width: page.pageWidth * scale, height: shownHeight * scale, opacity: measured ? 1 : 0, transform: [{ rotate: `${PAGE_TILT}deg` }] }}>
          <View style={[styles.pageShadow, { borderRadius: 4 * k }]} />
          <View style={[styles.pageClip, { borderRadius: 4 * k }]}>
            <Page {...page} scale={scale} />
          </View>
          {/* The book's ribbon, falling over the page's top. */}
          <Svg aria-hidden width={12 * k} height={34 * k} style={[styles.ribbon, { right: 26 * k, top: -6 * k }]}>
            <Path d={`M0 0 H${12 * k} V${34 * k} L${6 * k} ${28 * k} L0 ${34 * k} Z`} fill={book.ribbon} />
          </Svg>
        </View>
      </View>

      <View style={[styles.cardFoot, { paddingBottom: height * 0.05, gap: 8 * k }]}>
        <View style={[styles.rule, { width: 28 * k, backgroundColor: theme.rule }]} />
        <Text colorValue={theme.brand} style={{ fontSize: 13 * k, lineHeight: 18 * k, letterSpacing: 3 * k, fontWeight: "600" }}>
          {brand}
        </Text>
      </View>
    </View>
  );
}

/** Only the white page, straight, nothing round it: what is captured is the page itself. */
function PageOnly({
  cardRef,
  boxWidth,
  boxHeight,
  shownHeight,
  measured,
  label,
  ...page
}: PageProps & { cardRef: CardRef; boxWidth: number; boxHeight: number; shownHeight: number; measured: boolean; label: string }) {
  const scale = Math.min(boxWidth / page.pageWidth, boxHeight / shownHeight);
  return (
    // The shadow is the preview's: it lies outside the captured view, so the picture is the page alone.
    <View style={[styles.pageOnlyShadow, { opacity: measured ? 1 : 0 }]}>
      <View
        ref={cardRef}
        collapsable={false}
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        style={[styles.pageOnly, { width: page.pageWidth * scale, height: shownHeight * scale }]}
      >
        <Page {...page} scale={scale} />
      </View>
    </View>
  );
}

/** The card's ground, lit from above, with the stars of a Seljuk gate, barely there. */
function Backdrop({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  const id = theme.id;
  return (
    <Svg key={`${id}-${width}x${height}`} aria-hidden pointerEvents="none" width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={`${id}-ground`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={theme.top} />
          <Stop offset="1" stopColor={theme.foot} />
        </LinearGradient>
        <RadialGradient id={`${id}-glow`} cx="50%" cy="52%" r="58%">
          <Stop offset="0" stopColor={theme.glow} stopOpacity={theme.glowOpacity} />
          <Stop offset="1" stopColor={theme.glow} stopOpacity={0} />
        </RadialGradient>
        <Pattern id={`${id}-tiles`} width={TILE} height={TILE} patternUnits="userSpaceOnUse">
          <G transform={`scale(${TILE / 100})`} fill="none" stroke={theme.tile} strokeOpacity={theme.tileOpacity} strokeWidth={1.8}>
            <Path d={STAR} />
            <Path d={STAR} transform="rotate(45 50 50)" />
          </G>
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill={`url(#${id}-ground)`} />
      <Rect width={width} height={height} fill={`url(#${id}-tiles)`} />
      <Rect width={width} height={height} fill={`url(#${id}-glow)`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: desk.back,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  closeButton: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: touchTarget.min / 2,
    backgroundColor: desk.raised,
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 20,
  },
  titleFont: {
    fontFamily: TITLE_FONT,
    fontWeight: "normal",
  },
  stage: {
    flex: 1,
  },
  slide: {
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    overflow: "hidden",
    boxShadow: "0px 14px 36px rgba(0, 0, 0, 0.45)",
  },
  cardHead: {
    alignItems: "center",
  },
  storyTitle: {
    textAlign: "center",
  },
  ornament: {
    flexDirection: "row",
    alignItems: "center",
  },
  rule: {
    height: 1,
    opacity: 0.8,
  },
  diamond: {
    transform: [{ rotate: "45deg" }],
  },
  pageRoom: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pageShadow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: book.paper,
    boxShadow: "0px 3px 6px rgba(0, 0, 0, 0.3), 0px 16px 30px rgba(0, 0, 0, 0.35)",
  },
  pageClip: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
    backgroundColor: book.paper,
  },
  pageOnlyShadow: {
    borderRadius: 4,
    backgroundColor: book.paper,
    boxShadow: "0px 3px 6px rgba(0, 0, 0, 0.3), 0px 16px 30px rgba(0, 0, 0, 0.35)",
  },
  pageOnly: {
    overflow: "hidden",
    backgroundColor: book.paper,
  },
  ribbon: {
    position: "absolute",
  },
  cardFoot: {
    alignItems: "center",
  },
  actions: {
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  chips: {
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.xxs,
    borderRadius: touchTarget.min,
    backgroundColor: desk.raised,
  },
  chip: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: touchTarget.min / 2,
  },
  chipOn: {
    backgroundColor: book.gold,
  },
  notePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    width: "100%",
    maxWidth: 420,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: book.paper,
  },
  sendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    width: "100%",
    maxWidth: 420,
    minHeight: touchTarget.min + spacing.xs,
    borderRadius: touchTarget.min,
    backgroundColor: book.gold,
  },
  sendOff: {
    opacity: 0.55,
  },
  hint: {
    textAlign: "center",
    maxWidth: 420,
  },
});
