import Ionicons from "@expo/vector-icons/Ionicons";
import type { JournalEntry, JournalPhoto } from "@vagabonds/contracts";
import { fontFamily, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import Head from "expo-router/head";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, G, Line, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";

import { JournalComposer } from "@/components/journal/composer";
import { JournalCover } from "@/components/journal/cover";
import { Leaf, LeafFace } from "@/components/journal/leaf";
import { EntryPage, MorePage, NewPage } from "@/components/journal/pages";
import { book } from "@/components/journal/paper";
import { PhotoViewer } from "@/components/journal/photo-viewer";
import { useCommunity } from "@/data";
import { useMessages } from "@/i18n";
import { announce } from "@/lib/announce";
import { bookPages, bookSize, loadMoreJournal, openJournal, useJournal, type BookPage } from "@/lib/journal";
import { usePageTurn } from "@/lib/use-page-turn";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useA11ySettings } from "@/settings/a11y-settings";

/** What is seen of the cover beside open pages, and the shade of the pages curving into the binding. */
const SPINE = 10;
const GUTTER = 26;
/** How thick the book is: the pages and back board seen at its fore-edge and foot. */
const DEPTH = 12;
const RIBBON_TAIL = 16;
/** A plain navigation bar's height, for telling whether this page starts under it. */
const NAV_BAR = Platform.OS === "ios" ? 44 : 56;
/** Room kept round the book, so it lies on the screen as an object and nothing touches an edge. */
const STAGE_SIDE = spacing.lg;
const STAGE_TOP = spacing.md;
/** The page just added is in the book by then, so it can be turned to. */
const NEW_PAGE_DRAWN_MS = 80;
/** Leaves drawn at a time: the one before the open one, it, and the two after. */
const LEAVES_DRAWN = 4;
/** Ask for more when this few pages are left to read. */
const LOAD_AHEAD = 3;
const COVER_ABOVE = 10;
const WIDE_BINDING_ABOVE = 5000;
/** The room the book lies in: light as a study in the day, deep as one at night. */
const ROOM_LIGHT = { top: "#F6F9F4", foot: "#D9E6DC", glow: "#FFFFFF", tile: "#1F4A3A" };
const ROOM_DARK = { top: "#14221C", foot: "#09110D", glow: "#2C4A3D", tile: "#E9CC85" };
const ROOM_TILE = 64;
const ROOM_FADE = 90;
const ROOM_STAR = "M22 22 H78 V78 H22 Z";
/** The floating controls: dark in both themes, as a thing lying over the room. */
const CAPSULE = "#12241C";
const CAPSULE_INK = "#FFFFFF";
const CAPSULE_SOFT = "#A9BDB2";
/** Wide enough for "Yeni sayfa" and for "12 / 120": the arrows stay put as the page changes. */
const COUNTER_WIDTH = 96;

const pageKey = (page: BookPage) => (page.kind === "entry" ? page.entry.id : page.kind);

/**
 * Profil · Anı Defteri: the visitor's private book of text and photos, a page at a time, newest
 * first. A phone shows one page and starts on the cover; where the room is wide, two lie side by side.
 * The book keeps a book's shape in whatever room there is (`bookSize`). The pages are leaves that turn on the spine (`Leaf`). Only those next to the open one are drawn, so
 * no more than four hold images in memory, however long the book is (ADR 0004).
 */
export default function JournalScreen() {
  const m = useMessages();
  const w = m.journal;
  const { colors: c, scheme } = useTheme();
  const { settings } = useA11ySettings();
  const [screenSize, setScreenSize] = useState({ width: 0, height: 0 });
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { user } = useCommunity();
  const journal = useJournal();
  const [room, setRoom] = useState({ width: 0, height: 0 });
  const screen = useRef<ComponentRef<typeof View>>(null);
  /** On iOS 26 the header floats over the page, which starts at the top of the screen: this much is under it. */
  const [underHeader, setUnderHeader] = useState(0);
  /** The page being written: `null` a new one. */
  const [composing, setComposing] = useState<{ entry: JournalEntry | null; pickFirst?: boolean; writeFirst?: boolean } | null>(null);
  const [viewing, setViewing] = useState<{ photo: JournalPhoto; label: string } | null>(null);

  const size = bookSize(room.width - DEPTH, room.height - DEPTH - RIBBON_TAIL);
  const wide = size.spread;
  const pageWidth = Math.floor(size.width / (wide ? 2 : 1));
  const pages = bookPages(journal.entries, journal.total, journal.nextCursor !== null, !wide);
  // One leaf a page on a phone. Two pages open: the left lies still, and each leaf is a right page with a left on its back.
  const last = wide ? Math.max(0, Math.floor((pages.length - 1) / 2)) : Math.max(0, pages.length - 1);
  const { position, index, settled, turnTo: turnLeaf, jumpTo, panHandlers } = usePageTurn({ last, span: pageWidth, reduced, onePage: !wide });
  const shown = wide ? (pages[index * 2 + 1] ?? pages[index * 2]) : pages[index];
  const coming = (entryId: string) => journal.pending.filter((photo) => photo.entryId === entryId);

  const turnTo = (target: number) => {
    const next = Math.max(0, Math.min(target, last));
    turnLeaf(next);
    const page = wide ? (pages[next * 2 + 1] ?? pages[next * 2]) : pages[next];
    if (page?.kind === "entry") announce(w.pageNumber(page.number, journal.total));
    else if (page?.kind === "new") announce(w.newPage);
  };

  // The page held may be gone (deleted), or the book may have changed from one page open to two.
  useEffect(() => {
    if (index > last) jumpTo(last);
  }, [index, last, jumpTo]);
  const wasWide = useRef(wide);
  useEffect(() => {
    if (wasWide.current === wide) return;
    wasWide.current = wide;
    // The same page stays open: a phone's leaves are pages after the cover, a spread is two of them.
    jumpTo(wide ? Math.max(0, Math.floor((index - 1) / 2)) : Math.min(index * 2 + 1, Math.max(0, pages.length - 1)));
  }, [wide, index, pages.length, jumpTo]);
  // The last pages arrived are in reach: ask for the next ones.
  const pagesLeft = pages.length - 1 - (wide ? index * 2 + 1 : index);
  useEffect(() => {
    if (pagesLeft <= LOAD_AHEAD) void loadMoreJournal();
  }, [pagesLeft]);

  const pageOf = (item: BookPage, active: boolean) => {
    const pageSize = { width: pageWidth, height: size.height };
    if (item.kind === "cover") return <JournalCover {...pageSize} name={user?.fullName ?? user?.nickname ?? m.profile.traveller} onOpen={() => turnTo(1)} />;
    if (item.kind === "new") return <NewPage {...pageSize} isFirst={journal.total === 0} onWrite={() => setComposing({ entry: null, writeFirst: true })} onAddPhoto={() => setComposing({ entry: null, pickFirst: true })} />;
    if (item.kind === "more") return <MorePage {...pageSize} error={journal.moreError} onRetry={() => void loadMoreJournal()} />;
    return (
      <EntryPage
        {...pageSize}
        entry={item.entry}
        number={item.number}
        total={journal.total}
        pending={coming(item.entry.id)}
        active={active}
        onEdit={() => setComposing({ entry: item.entry })}
        onOpenPhoto={(photo, label) => setViewing({ photo, label })}
      />
    );
  };
  // The open leaf, and those next to it; the leaf after next so that a quick turn finds its page drawn.
  // Going forward they change when the turn has come to rest, so it lays out nothing new while moving.
  // Going back or turned on quickly, at once: the leaf that will lie on the left is there as this one leaves it.
  const drawnFrom = index === settled + 1 ? settled : index;
  const near = Array.from({ length: LEAVES_DRAWN }, (_, at) => drawnFrom - 1 + at).filter((leaf) => leaf >= 0 && leaf <= last);

  const place =
    shown?.kind === "entry" ? w.pageNumber(shown.number, journal.total) : shown?.kind === "cover" ? w.cover : shown?.kind === "new" ? w.newPage : w.loading;

  return (
    <View
      ref={screen}
      onLayout={({ nativeEvent: { layout } }) => {
        setScreenSize({ width: layout.width, height: layout.height });
        if (Platform.OS === "web") return;
        screen.current?.measureInWindow((_x, y) => setUnderHeader(Math.max(0, insets.top + NAV_BAR - y)));
      }}
      style={[
        styles.screen,
        {
          backgroundColor: c.background,
          paddingTop: STAGE_TOP + underHeader,
          paddingBottom: insets.bottom + spacing.md,
          // A phone on its side: clear of the notch, the same room on both sides so the book stays centred.
          paddingHorizontal: Math.max(STAGE_SIDE, insets.left, insets.right),
        },
      ]}
    >
      <Head>
        <title>{m.common.title(w.title)}</title>
      </Head>

      {/* High contrast keeps the plain background, with nothing behind the words. */}
      {!settings.highContrast && <Room width={screenSize.width} height={screenSize.height} dark={scheme === "dark"} background={c.background} />}

      <View style={styles.stage} onLayout={({ nativeEvent: { layout } }) => setRoom({ width: layout.width, height: layout.height })}>
        {size.width > 0 && (
          // Centred with its thickness and ribbon, so the whole object sits in the middle and not just its top.
          <View style={{ width: size.width, height: size.height, marginRight: DEPTH, marginBottom: DEPTH + RIBBON_TAIL }}>
            <BookBlock width={size.width} height={size.height} />
            <Svg aria-hidden pointerEvents="none" width={14} height={RIBBON_TAIL + DEPTH} style={[styles.ribbon, { left: size.width / 2 - 7 }]}>
              <Path d={`M0 0 H14 V${RIBBON_TAIL + DEPTH} L7 ${RIBBON_TAIL + DEPTH - 6} L0 ${RIBBON_TAIL + DEPTH} Z`} fill={book.ribbon} />
              <Rect width={14} height={DEPTH - 3} fill="#000000" fillOpacity={0.25} />
            </Svg>
            <View style={styles.binding}>
              {journal.status === "error" && (
                <View style={styles.message}>
                  <Text accessibilityRole="alert" colorValue={book.ink} style={styles.messageText}>
                    {journal.error}
                  </Text>
                  <Pressable accessibilityRole="button" onPress={() => void openJournal()} style={styles.retry}>
                    <Text variant="label" colorValue={book.leather}>
                      {w.retry}
                    </Text>
                  </Pressable>
                </View>
              )}
              {(journal.status === "loading" || journal.status === "idle") && (
                <View style={styles.message}>
                  <ActivityIndicator color={book.leather} accessibilityLabel={w.loading} />
                </View>
              )}
              {journal.status === "ready" && pageWidth > 0 && (
                <View {...panHandlers} style={styles.leaves}>
                  {wide
                    ? pages[0] && index <= 1 && (
                        <View style={[styles.stillPage, { width: pageWidth, height: size.height }]}>
                          <LeafFace active={index === 0}>{pageOf(pages[0], index === 0)}</LeafFace>
                        </View>
                      )
                    : null}
                  {near.map((leaf) => {
                    const front = wide ? pages[leaf * 2 + 1] : pages[leaf];
                    const back = wide && leaf < last ? pages[leaf * 2 + 2] : undefined;
                    const frontKey = front ? pageKey(front) : "blank";
                    return (
                      <Leaf
                        key={wide ? `spread-${leaf}-${frontKey}` : frontKey}
                        position={position}
                        number={leaf}
                        width={pageWidth}
                        height={size.height}
                        left={wide ? pageWidth : 0}
                        // The cover is over everything, the binding included; the rest lie first on top.
                        stack={front?.kind === "cover" ? pages.length + COVER_ABOVE : pages.length - leaf}
                        backColor={front?.kind === "cover" ? book.hide : book.paper}
                        frontActive={leaf === index}
                        backActive={leaf === index - 1}
                        front={front ? pageOf(front, leaf === index) : <View style={styles.blank} />}
                        {...(wide && leaf < last ? { back: back ? pageOf(back, leaf === index - 1) : <View style={styles.blank} /> } : {})}
                      />
                    );
                  })}
                  <View pointerEvents="none" style={[styles.bindingLayer, { zIndex: wide ? WIDE_BINDING_ABOVE : pages.length + 1 }]}>
                    <Binding height={size.height} center={wide ? pageWidth : null} />
                  </View>
                </View>
              )}
            </View>
          </View>
        )}
      </View>

      <View style={styles.controls}>
        {last > 0 && (
          // How far through the book: it moves with the leaf, under the finger too.
          <View aria-hidden style={[styles.progress, { width: size.width, backgroundColor: c.border }]}>
            <Animated.View
              style={[
                styles.progressFill,
                { backgroundColor: c.highlightMark, transform: [{ scaleX: position.interpolate({ inputRange: [0, last], outputRange: [0, 1], extrapolate: "clamp" }) }] },
              ]}
            />
          </View>
        )}
        <View style={styles.capsule}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={w.previous}
            accessibilityState={{ disabled: index === 0 }}
            disabled={index === 0}
            onPress={() => turnTo(index - 1)}
            style={[styles.navButton, index === 0 && styles.navOff]}
          >
            <Ionicons name="chevron-back" size={22} color={CAPSULE_INK} />
          </Pressable>
          <View accessible accessibilityLabel={place} accessibilityLiveRegion="polite" style={styles.counter}>
            {shown?.kind === "entry" ? (
              <>
                <Text colorValue={CAPSULE_INK} style={styles.counterNumber}>
                  {shown.number}
                </Text>
                <Text colorValue={CAPSULE_SOFT} style={styles.counterTotal}>
                  {`/ ${journal.total}`}
                </Text>
              </>
            ) : (
              <Text numberOfLines={1} colorValue={CAPSULE_INK} style={styles.counterWord}>
                {place}
              </Text>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={w.next}
            accessibilityState={{ disabled: index >= last }}
            disabled={index >= last}
            onPress={() => turnTo(index + 1)}
            style={[styles.navButton, index >= last && styles.navOff]}
          >
            <Ionicons name="chevron-forward" size={22} color={CAPSULE_INK} />
          </Pressable>
          {journal.status === "ready" && (
            <Pressable accessibilityRole="button" accessibilityLabel={w.newTitle} onPress={() => setComposing({ entry: null })} style={styles.newButton}>
              <Ionicons name="add" size={26} color={book.hideDark} />
            </Pressable>
          )}
        </View>
      </View>

      {composing && (
        <JournalComposer
          key={composing.entry?.id ?? "new"}
          entry={composing.entry}
          pageWidth={pageWidth}
          pageHeight={size.height}
          pickFirst={composing.pickFirst ?? false}
          writeFirst={composing.writeFirst ?? false}
          onClose={() => setComposing(null)}
          onSaved={() => {
            const isNew = composing.entry === null;
            setComposing(null);
            // The new page is the next leaf after the one for writing; open two, it lies beside that one.
            // By `turnLeaf`, which knows the book as it is by then: this screen's `last` is from before the page.
            if (isNew && !wide) setTimeout(() => turnLeaf(2), NEW_PAGE_DRAWN_MS);
          }}
        />
      )}
      <PhotoViewer photo={viewing?.photo ?? null} label={viewing?.label ?? ""} onClose={() => setViewing(null)} />
    </View>
  );
}

/** What the book lies on: a soft light behind it, and the stars of a Seljuk gate, barely there. */
function Room({ width, height, dark, background }: { width: number; height: number; dark: boolean; background: string }) {
  if (width <= 0 || height <= 0) return null;
  const room = dark ? ROOM_DARK : ROOM_LIGHT;
  return (
    // Keyed by size: on iOS a gradient keeps the size it was first drawn at.
    <Svg key={`${width}x${height}-${dark}`} aria-hidden pointerEvents="none" width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="room-wall" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={room.top} />
          <Stop offset="1" stopColor={room.foot} />
        </LinearGradient>
        <RadialGradient id="room-glow" cx="50%" cy="46%" r="62%">
          <Stop offset="0" stopColor={room.glow} stopOpacity={0.95} />
          <Stop offset="1" stopColor={room.glow} stopOpacity={0} />
        </RadialGradient>
        {/* From the app's own background, so no edge shows where this screen starts. */}
        <LinearGradient id="room-top" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={background} stopOpacity={1} />
          <Stop offset="1" stopColor={background} stopOpacity={0} />
        </LinearGradient>
        <Pattern id="room-tiles" width={ROOM_TILE} height={ROOM_TILE} patternUnits="userSpaceOnUse">
          <G transform={`scale(${ROOM_TILE / 100})`} fill="none" stroke={room.tile} strokeOpacity={0.06} strokeWidth={1.6}>
            <Path d={ROOM_STAR} />
            <Path d={ROOM_STAR} transform="rotate(45 50 50)" />
          </G>
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill="url(#room-wall)" />
      <Rect width={width} height={height} fill="url(#room-tiles)" />
      <Rect width={width} height={height} fill="url(#room-glow)" />
      <Rect width={width} height={ROOM_FADE} fill="url(#room-top)" />
    </Svg>
  );
}

/**
 * What makes it a book and not a card: the back board below, and the block of pages between it and
 * the cover, seen at the fore-edge and foot, each leaf a line of its own in gilt.
 */
function BookBlock({ width, height }: { width: number; height: number }) {
  const full = { width: width + DEPTH, height: height + DEPTH };
  const leaves = [2.5, 4.5, 6.5, 8.5];
  return (
    <View aria-hidden pointerEvents="none" style={[styles.block, full]}>
      {/* On the book's two boards, not its bounding box: that box's empty corners would show the shadow's cut-out. */}
      <View style={[styles.boardShadow, { width, height, top: DEPTH, left: DEPTH }]} />
      <View style={[styles.boardShadow, { width, height, top: 0, left: 0 }]} />
      <Svg key={`${width}x${height}`} width={full.width} height={full.height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="block-side" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#F0E0AE" />
            <Stop offset="1" stopColor={book.gilt} />
          </LinearGradient>
          <LinearGradient id="block-foot" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#A9863A" />
            <Stop offset="1" stopColor="#E6D29C" />
          </LinearGradient>
          <LinearGradient id="block-shade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000000" stopOpacity={0.3} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {/* The back board. */}
        <Rect x={DEPTH} y={DEPTH} width={width} height={height} rx={6} fill={book.hideDark} />
        {/* The pages. */}
        <Rect x={width - 8} y={6} width={8 + DEPTH - 3} height={height + DEPTH - 9} rx={2} fill="url(#block-side)" />
        <Rect x={6} y={height - 8} width={width + DEPTH - 9} height={8 + DEPTH - 3} rx={2} fill="url(#block-foot)" />
        {leaves.map((at) => (
          <Line key={`side-${at}`} x1={width + at} y1={6 + at} x2={width + at} y2={height + at} stroke="#7E6226" strokeOpacity={0.4} strokeWidth={0.6} />
        ))}
        {leaves.map((at) => (
          <Line key={`foot-${at}`} x1={6 + at} y1={height + at} x2={width + at} y2={height + at} stroke="#6E5420" strokeOpacity={0.45} strokeWidth={0.6} />
        ))}
        {/* The shade the cover throws on the pages' foot. */}
        <Rect x={6} y={height} width={width + DEPTH - 9} height={5} fill="url(#block-shade)" />
      </Svg>
    </View>
  );
}

/** Where the pages meet the binding: a shade they curve into, at the left or down the middle. */
function Binding({ height, center }: { height: number; center: number | null }) {
  if (center !== null) {
    return (
      <Svg aria-hidden pointerEvents="none" width={GUTTER * 2} height={height} style={[styles.bindingShade, { left: center - GUTTER }]}>
        <Defs>
          <LinearGradient id="journal-fold" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={book.hideDark} stopOpacity={0} />
            <Stop offset="0.5" stopColor={book.hideDark} stopOpacity={0.16} />
            <Stop offset="1" stopColor={book.hideDark} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={GUTTER * 2} height={height} fill="url(#journal-fold)" />
      </Svg>
    );
  }
  return (
    <Svg aria-hidden pointerEvents="none" width={SPINE + GUTTER} height={height} style={styles.bindingShade}>
      <Defs>
        <LinearGradient id="journal-gutter" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={book.hideDark} stopOpacity={0.2} />
          <Stop offset="1" stopColor={book.hideDark} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect width={SPINE} height={height} fill={book.hide} />
      <Rect x={SPINE} width={GUTTER} height={height} fill="url(#journal-gutter)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: STAGE_TOP,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  block: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  boardShadow: {
    position: "absolute",
    borderRadius: 6,
    // Near the book, tight and dark; further out, soft: it lies on something.
    boxShadow: "1px 2px 3px rgba(12, 18, 14, 0.36), 2px 9px 16px rgba(12, 18, 14, 0.24), 4px 22px 38px rgba(12, 18, 14, 0.2)",
  },
  ribbon: {
    position: "absolute",
    bottom: -RIBBON_TAIL - DEPTH,
  },
  leaves: {
    flex: 1,
    ...(Platform.OS === "web" ? ({ userSelect: "none" } as object) : {}),
  },
  stillPage: {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "hidden",
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    backgroundColor: book.paper,
  },
  blank: {
    flex: 1,
    backgroundColor: book.paper,
  },
  bindingLayer: {
    ...StyleSheet.absoluteFill,
  },
  binding: {
    flex: 1,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: book.paper,
  },
  bindingShade: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  message: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  messageText: {
    textAlign: "center",
  },
  retry: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  controls: {
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  progress: {
    maxWidth: "100%",
    height: 2,
    overflow: "hidden",
    borderRadius: 1,
  },
  progressFill: {
    width: "100%",
    height: "100%",
    transformOrigin: "left center",
  },
  capsule: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.xxs,
    borderRadius: touchTarget.min,
    backgroundColor: CAPSULE,
    boxShadow: "0px 8px 24px rgba(10, 30, 22, 0.3)",
  },
  navButton: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
  },
  navOff: {
    opacity: 0.35,
  },
  counter: {
    width: COUNTER_WIDTH,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: spacing.xxs,
  },
  counterWord: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 15,
    lineHeight: 22,
  },
  counterNumber: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 19,
    lineHeight: 24,
    fontVariant: ["tabular-nums"],
  },
  counterTotal: {
    fontSize: 14,
    lineHeight: 24,
    fontVariant: ["tabular-nums"],
  },
  newButton: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.xs,
    borderRadius: touchTarget.min / 2,
    backgroundColor: book.gold,
  },
});
