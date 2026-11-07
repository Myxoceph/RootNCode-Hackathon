import Ionicons from "@expo/vector-icons/Ionicons";
import { Marcellus_400Regular } from "@expo-google-fonts/marcellus/400Regular";
import type { JournalEntry } from "@vagabonds/contracts";
import { radius, spacing, Text, touchTarget } from "@vagabonds/ui";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
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
const PAGE_TILT = -1.2;
const TILE = 44;
const STAR = "M22 22 H78 V78 H22 Z";

/**
 * A page of the book as a story to send: the page as it is in the book, lying on the cover's green, with
 * the book's name above and the app's below. Shown first, so what goes out is what was seen; the
 * system's share sheet chooses where (WhatsApp, an Instagram story, …).
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
  const card = useRef<ComponentRef<typeof View>>(null);
  const [room, setRoom] = useState({ width: 0, height: 0 });
  /** The page's own height when only as long as what is on it, before it is scaled. */
  const [measured, setMeasured] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const date = formatDate(entry.createdAt, lang);
  const waiting = pending.length > 0;

  // The largest story that fits, a little in from the edges.
  const fitWidth = Math.max(0, Math.min(room.width - spacing.xl * 2, (room.height - spacing.md * 2) * STORY_ASPECT));
  const cardWidth = Math.floor(fitWidth);
  const cardHeight = Math.floor(cardWidth / STORY_ASPECT);
  const k = cardWidth / BASE;
  const shownHeight = Math.min(measured || pageHeight, pageHeight * 2);
  const scale = pageWidth > 0 && shownHeight > 0 ? Math.min((cardWidth * PAGE_SHARE.width) / pageWidth, (cardHeight * PAGE_SHARE.height) / shownHeight) : 0;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await shareViewAsImage(card, s.title);
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
          {cardWidth > 0 && scale > 0 && (
            // What is captured: everything inside this view, at the story's size.
            <View
              ref={card}
              collapsable={false}
              accessible
              accessibilityRole="image"
              accessibilityLabel={s.imageLabel(date)}
              style={[styles.card, { width: cardWidth, height: cardHeight, borderRadius: 14 * k }]}
            >
              <Backdrop width={cardWidth} height={cardHeight} />
              <View style={[styles.cardHead, { paddingTop: cardHeight * 0.065 }]}>
                <Text colorValue={book.gold} style={[styles.storyTitle, titleLoaded ? styles.titleFont : null, { fontSize: 42 * k, lineHeight: 50 * k }]}>
                  {w.title}
                </Text>
                <View style={[styles.ornament, { gap: 8 * k, marginVertical: 10 * k }]}>
                  <View style={[styles.rule, { width: 40 * k }]} />
                  <View style={[styles.diamond, { width: 6 * k, height: 6 * k }]} />
                  <View style={[styles.rule, { width: 40 * k }]} />
                </View>
                <Text colorValue={desk.ink} style={{ fontSize: 16 * k, lineHeight: 22 * k, letterSpacing: 0.4 * k }}>
                  {date}
                </Text>
              </View>

              <View style={styles.pageRoom}>
                <View style={{ width: pageWidth * scale, height: shownHeight * scale, opacity: measured ? 1 : 0, transform: [{ rotate: `${PAGE_TILT}deg` }] }}>
                  <View style={[styles.pageShadow, { borderRadius: 4 * k }]} />
                  <View style={[styles.pageClip, { borderRadius: 4 * k }]}>
                    <View
                      onLayout={({ nativeEvent: { layout } }) => setMeasured(Math.ceil(layout.height))}
                      style={{ width: pageWidth, transform: [{ scale }], transformOrigin: "top left" }}
                    >
                      <EntryPage entry={entry} number={number} total={total} pending={pending} width={pageWidth} height={pageHeight} active={false} still onEdit={() => {}} onOpenPhoto={() => {}} />
                    </View>
                  </View>
                  {/* The book's ribbon, falling over the page's top. */}
                  <Svg aria-hidden width={12 * k} height={34 * k} style={[styles.ribbon, { right: 26 * k, top: -6 * k }]}>
                    <Path d={`M0 0 H${12 * k} V${34 * k} L${6 * k} ${28 * k} L0 ${34 * k} Z`} fill={book.ribbon} />
                  </Svg>
                </View>
              </View>

              <View style={[styles.cardFoot, { paddingBottom: cardHeight * 0.05, gap: 8 * k }]}>
                <View style={[styles.rule, { width: 28 * k }]} />
                <Text colorValue={book.gold} style={{ fontSize: 13 * k, lineHeight: 18 * k, letterSpacing: 3 * k, fontWeight: "600" }}>
                  {s.brand}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.actions}>
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

/** The cover's green, lit from above, with the stars of a Seljuk gate in gilt, barely there. */
function Backdrop({ width, height }: { width: number; height: number }) {
  return (
    <Svg key={`${width}x${height}`} aria-hidden pointerEvents="none" width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="story-hide" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={book.hideLight} />
          <Stop offset="1" stopColor={book.hideDark} />
        </LinearGradient>
        <RadialGradient id="story-glow" cx="50%" cy="52%" r="58%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.14} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
        <Pattern id="story-tiles" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
          <G transform={`scale(${TILE / 100})`} fill="none" stroke={book.gold} strokeOpacity={0.09} strokeWidth={1.8}>
            <Path d={STAR} />
            <Path d={STAR} transform="rotate(45 50 50)" />
          </G>
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill="url(#story-hide)" />
      <Rect width={width} height={height} fill="url(#story-tiles)" />
      <Rect width={width} height={height} fill="url(#story-glow)" />
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
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    overflow: "hidden",
    backgroundColor: book.hide,
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
    backgroundColor: book.gilt,
    opacity: 0.8,
  },
  diamond: {
    backgroundColor: book.gold,
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
