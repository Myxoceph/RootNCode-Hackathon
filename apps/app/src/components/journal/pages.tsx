import Ionicons from "@expo/vector-icons/Ionicons";
import type { JournalEntry, JournalLayout, JournalPhoto } from "@vagabonds/contracts";
import { radius, spacing, Text, touchTarget } from "@vagabonds/ui";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { localeTag, useLang, useMessages } from "@/i18n";
import { announce } from "@/lib/announce";
import { formatDate } from "@/lib/format-date";
import { dailyPrompt, removeJournalEntry, type PendingPhoto } from "@/lib/journal";

import { strokesBottom } from "@/lib/journal-drawing";
import { PRINT_BORDER, printHeight, placementsFor, stickersBottom, textTop, textWidth } from "@/lib/journal-layout";
import { stickerArt, type StickerId } from "@/lib/journal-stickers";

import { Strokes } from "./drawing";
import { book, linesArea, MARGIN_LEFT, PAGE_FOOT, PAGE_HEAD, RuledLines, usePageStyle } from "./paper";
import { PendingPrint, PhotoPrint, printLayout, PRINT_SIDE_ROOM } from "./print";
import { StickerArt } from "./sticker";

type PageStyle = ReturnType<typeof usePageStyle>;

const FOOT = PAGE_FOOT;
const HEAD = PAGE_HEAD;
/** How far a written line may be from the end of the scroll and still count as the last. */
const END_SLOP = 4;
const NARROW_COLUMN = 220;
/** The fewest lines a page shared as a picture has, however little is written. */
const STILL_LINES = 4;
const ICON = 20;

/** The next empty page: the day, a question, and a place waiting for a photo and for words. */
export function NewPage({ width, height, isFirst, onWrite, onAddPhoto }: { width: number; height: number; isFirst: boolean; onWrite: () => void; onAddPhoto: () => void }) {
  const w = useMessages().journal;
  const lang = useLang();
  const page = usePageStyle();
  const today = new Date();
  const moment = today.toISOString();
  const column = width - MARGIN_LEFT - spacing.xl;
  // Whole lines, as much as a fair share of the page gives: what is written below stays on them.
  const printLines = Math.max(3, Math.min(6, Math.floor((height * 0.34) / page.line)));
  // A narrow page keeps the date alone, and smaller words in the empty print.
  const narrow = column < NARROW_COLUMN;
  const prompt = isFirst ? w.firstPrompt : dailyPrompt(w.prompts, today);
  return (
    <View style={[styles.page, { width, height, paddingTop: HEAD }]}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.newContent} showsVerticalScrollIndicator={false}>
        <RuledLines height={height} line={page.line} plain={page.plain} />
        <View style={[styles.dateRow, styles.written, { height: page.line }]}>
          <Text numberOfLines={1} style={[page.date, { color: page.inkSoft }]}>{formatDate(moment, lang)}</Text>
          {!narrow && <Text style={[page.body, { color: page.inkSoft }]}>{today.toLocaleDateString(localeTag(lang), { weekday: "long", timeZone: "Europe/Istanbul" })}</Text>}
        </View>
        <Text headingLevel={2} style={[page.body, styles.written, { color: page.ink, marginTop: page.line }]}>
          {prompt}
        </Text>
        <View style={[styles.emptyPrintRow, { height: page.line * (printLines + 1) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={w.pastePhoto}
            accessibilityHint={w.pastePhotoHint}
            onPress={onAddPhoto}
            style={[styles.emptyPrint, { width: Math.min(column, 330), height: page.line * printLines }]}
          >
            <View aria-hidden style={styles.emptyTape} />
            <View style={styles.emptyWell}>
              <Ionicons name="image-outline" size={narrow ? 22 : 30} color={book.leather} />
              {narrow ? (
                <Text variant="caption" colorValue={book.leather} numberOfLines={1}>
                  {w.pastePhoto}
                </Text>
              ) : (
                <Text numberOfLines={1} style={[page.date, { color: book.leather }]}>
                  {w.pastePhoto}
                </Text>
              )}
            </View>
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" onPress={onWrite} style={[styles.writeButton, { width: Math.min(column, 330) }]}>
          <Ionicons name="pencil" size={20} color="#FFFFFF" />
          <Text variant={narrow ? "caption" : "label"} colorValue="#FFFFFF" numberOfLines={1}>
            {w.write}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/** A page holding one entry. A long one scrolls within its lines; its foot stays where it is. */
export function EntryPage({
  entry,
  number,
  total,
  pending,
  width,
  height,
  active,
  still = false,
  onEdit,
  onShare,
  onOpenPhoto,
}: {
  entry: JournalEntry;
  number: number;
  total: number;
  pending: PendingPhoto[];
  width: number;
  height: number;
  /** Whether this page lies open: one being turned does not scroll under the finger. */
  active: boolean;
  /** The page as a picture, for sharing: as long as what is on it, its number at the foot and nothing to press. */
  still?: boolean;
  onEdit: () => void;
  /** Left out where sharing is not offered (the web). */
  onShare?: () => void;
  onOpenPhoto: (photo: JournalPhoto, label: string) => void;
}) {
  const w = useMessages().journal;
  const lang = useLang();
  const page = usePageStyle();
  const area = linesArea(height, page.line);
  const [contentHeight, setContentHeight] = useState(0);
  const [atBottom, setAtBottom] = useState(false);
  const date = formatDate(entry.createdAt, lang);
  const continues = contentHeight > area + END_SLOP && !atBottom;

  // A page shared as a picture is only as long as what is on it: no empty lines below.
  const least = still ? page.line * STILL_LINES : area;
  const content = (
    <View style={{ minHeight: least }} onLayout={(event) => setContentHeight(event.nativeEvent.layout.height)}>
      <RuledLines height={Math.max(contentHeight, least)} line={page.line} plain={page.plain} />
      <Text headingLevel={2} accessibilityLabel={w.pageLabel(number, total, date)} style={[page.date, styles.written, { color: page.inkSoft }]}>
        {date}
      </Text>
      {entry.layout ? (
        <ArrangedPage entry={entry} layout={entry.layout} pending={pending} page={page} width={width} minHeight={least - page.line} date={date} onOpenPhoto={onOpenPhoto} />
      ) : (
        <>
          <Prints entry={entry} pending={pending} page={page} width={width} pageHeight={area} date={date} onOpenPhoto={onOpenPhoto} />
          {entry.text !== null && <Text style={[page.body, styles.written, { color: page.ink }]}>{entry.text}</Text>}
        </>
      )}
    </View>
  );

  return (
    <View style={[styles.page, { width, paddingTop: HEAD }, still ? null : { height }]}>
      {still ? (
        content
      ) : (
        // By its key: a recycled page starts at its own top.
        <ScrollView
          key={entry.id}
          nestedScrollEnabled
          scrollEnabled={active}
          style={{ height: area, flexGrow: 0 }}
          showsVerticalScrollIndicator={contentHeight > area}
          scrollEventThrottle={64}
          onScroll={({ nativeEvent }) => {
            const end = nativeEvent.contentOffset.y + nativeEvent.layoutMeasurement.height >= nativeEvent.contentSize.height - END_SLOP;
            if (end !== atBottom) setAtBottom(end);
          }}
        >
          {content}
        </ScrollView>
      )}
      {still ? (
        <View style={styles.foot}>
          <Text aria-hidden style={[page.date, styles.number, { color: page.inkSoft }]}>
            {number}
          </Text>
        </View>
      ) : (
        <EntryFoot entry={entry} number={number} page={page} continues={continues} onEdit={onEdit} {...(onShare ? { onShare } : {})} />
      )}
    </View>
  );
}

/** A page as the visitor arranged it: everything where they put it, in shares of the page's width. */
function ArrangedPage({ entry, layout, pending, page, width, minHeight, date, onOpenPhoto }: {
  entry: JournalEntry;
  layout: JournalLayout;
  pending: PendingPhoto[];
  page: PageStyle;
  width: number;
  minHeight: number;
  date: string;
  onOpenPhoto: (photo: JournalPhoto, label: string) => void;
}) {
  const w = useMessages().journal;
  const [textHeight, setTextHeight] = useState(0);
  const photos = [...entry.photos, ...pending];
  const shapes = photos.map((photo) => ({ id: photo.id, aspect: photo.width / photo.height }));
  const room = { left: MARGIN_LEFT / width, right: 1 - spacing.xl / width, width };
  const placements = placementsFor(layout, shapes, room);
  const textAt = textTop(layout.text.y, width, page.line);
  const lowest = placements.reduce((low, placement) => {
    const shape = shapes.find((one) => one.id === placement.id)!;
    return Math.max(low, (placement.y + printHeight(placement.width, shape.aspect, width)) * width);
  }, Math.max(entry.text === null ? 0 : textAt + textHeight, strokesBottom(layout.strokes, width), stickersBottom(layout.stickers, width)));
  const blockHeight = Math.max(minHeight, lowest + page.line);
  return (
    <View style={{ height: blockHeight }}>
      {placements.map((placement, at) => {
        const box = { left: placement.x * width, top: placement.y * width, width: placement.width * width, zIndex: placement.z, transform: [{ rotate: `${placement.rotation}deg` }] };
        const itemWidth = placement.width * width;
        const placedPhoto = entry.photos.find((one) => one.id === placement.id);
        if (placedPhoto) {
          const label = w.photoLabel(at + 1, photos.length, date);
          return (
            <View key={placement.id} style={[styles.placed, box]}>
              <PhotoPrint photo={placedPhoto} width={itemWidth} imageHeight={(itemWidth - PRINT_BORDER * 2) / (placedPhoto.width / placedPhoto.height)} label={label} tilt={0} onOpen={() => onOpenPhoto(placedPhoto, label)} />
            </View>
          );
        }
        const coming = pending.find((one) => one.id === placement.id)!;
        return (
          <View key={placement.id} style={[styles.placed, box]}>
            <PendingPrint photo={coming} width={itemWidth} imageHeight={(itemWidth - PRINT_BORDER * 2) / (coming.width / coming.height)} tilt={0} />
          </View>
        );
      })}
      {entry.text !== null && (
        <View
          onLayout={(event) => setTextHeight(event.nativeEvent.layout.height)}
          style={[styles.placed, { left: layout.text.x * width, top: textAt, width: textWidth(layout.text) * width, zIndex: layout.text.z }]}
        >
          <Text style={[page.body, { color: page.ink }]}>{entry.text}</Text>
        </View>
      )}
      {layout.stickers.filter((placement) => stickerArt(placement.sticker)).map((placement) => (
        // Nothing here takes a touch: a photo under it still opens, and the page still turns.
        <View
          key={placement.id}
          pointerEvents="none"
          accessible
          accessibilityRole="image"
          accessibilityLabel={w.arrange.stickerNames[placement.sticker as StickerId]}
          style={[styles.placed, { left: placement.x * width, top: placement.y * width, zIndex: placement.z, transform: [{ rotate: `${placement.rotation}deg` }] }]}
        >
          <StickerArt sticker={placement.sticker} size={placement.width * width} />
        </View>
      ))}
      {layout.strokes.length > 0 && (
        // Over the photos, as it was drawn. Nothing here takes a touch; a screen reader is told it is there.
        <View pointerEvents="none" accessible accessibilityRole="image" accessibilityLabel={w.arrange.hasDrawing} style={[StyleSheet.absoluteFill, styles.strokesLayer]}>
          <Strokes strokes={layout.strokes} width={width} height={blockHeight} />
        </View>
      )}
    </View>
  );
}

function Prints({ entry, pending, page, width, pageHeight, date, onOpenPhoto }: {
  entry: JournalEntry;
  pending: PendingPhoto[];
  page: PageStyle;
  width: number;
  pageHeight: number;
  date: string;
  onOpenPhoto: (photo: JournalPhoto, label: string) => void;
}) {
  const w = useMessages().journal;
  const count = entry.photos.length + pending.length;
  const first = entry.photos[0] ?? pending[0];
  const layout = printLayout(count, first ? first.width / first.height : 1, width - MARGIN_LEFT - PRINT_SIDE_ROOM, pageHeight, page.line);
  if (count === 0) return null;
  return (
    <View style={[styles.prints, { height: layout.height }]}>
      {entry.photos.map((photo, index) => {
        const label = w.photoLabel(index + 1, count, date);
        return <PhotoPrint key={photo.id} photo={photo} width={layout.itemWidth} imageHeight={layout.imageHeight} label={label} onOpen={() => onOpenPhoto(photo, label)} />;
      })}
      {pending.map((photo) => (
        <PendingPrint key={photo.id} photo={photo} width={layout.itemWidth} imageHeight={layout.imageHeight} />
      ))}
    </View>
  );
}

/**
 * The page's number, a sign when there is more to read, and change and delete. Deleting asks here on
 * the page: the same on the web, where the system's alert does not exist.
 */
function EntryFoot({ entry, number, page, continues, onEdit, onShare }: { entry: JournalEntry; number: number; page: PageStyle; continues: boolean; onEdit: () => void; onShare?: () => void }) {
  const w = useMessages().journal;
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await removeJournalEntry(entry.id);
      announce(w.deleted);
    } catch {
      setError(w.errors.deleteFailed);
      setBusy(false);
    }
  };

  if (asking) {
    return (
      <View accessibilityRole="alert" style={[styles.foot, styles.askFoot]}>
        <Text variant="caption" colorValue={error ? book.danger : page.ink} style={styles.flex}>
          {error ?? w.deleteAsk}
        </Text>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void remove()} style={styles.action}>
          <Text variant="label" colorValue={book.danger}>
            {w.deleteYes}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => setAsking(false)} style={styles.action}>
          <Text variant="label" colorValue={page.ink}>
            {w.deleteNo}
          </Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.foot}>
      <Text aria-hidden accessibilityElementsHidden importantForAccessibility="no" style={[page.date, styles.number, { color: page.inkSoft }]}>
        {number}
      </Text>
      <View style={styles.flex}>
        {continues && (
          <View style={styles.continues}>
            <Text variant="caption" colorValue={page.inkSoft} numberOfLines={1}>
              {w.continues}
            </Text>
            <Ionicons name="chevron-down" size={14} color={page.inkSoft} />
          </View>
        )}
      </View>
      {onShare && (
        <Pressable accessibilityRole="button" accessibilityLabel={w.shareLabel} onPress={onShare} style={styles.action}>
          <Ionicons name={Platform.OS === "ios" ? "share-outline" : "share-social-outline"} size={ICON} color={page.inkSoft} />
        </Pressable>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel={w.editLabel} onPress={onEdit} style={styles.action}>
        <Ionicons name="pencil-outline" size={ICON} color={page.inkSoft} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={w.deleteLabel} onPress={() => setAsking(true)} style={styles.action}>
        <Ionicons name="trash-outline" size={ICON} color={page.inkSoft} />
      </Pressable>
    </View>
  );
}

/** The last page of what has arrived: more are on the way, or a way to ask for them again. */
export function MorePage({ width, height, error, onRetry }: { width: number; height: number; error: string | null; onRetry: () => void }) {
  const w = useMessages().journal;
  const page = usePageStyle();
  return (
    <View style={[styles.page, styles.morePage, { width, height }]}>
      <RuledLines height={height} line={page.line} plain={page.plain} />
      {error ? (
        <>
          <Text accessibilityRole="alert" colorValue={page.ink} style={styles.moreText}>
            {error}
          </Text>
          <Pressable accessibilityRole="button" onPress={onRetry} style={styles.writeButton}>
            <Text variant="label" colorValue="#FFFFFF">
              {w.retry}
            </Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator color={book.leather} accessibilityLabel={w.loading} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  page: {
    overflow: "hidden",
    backgroundColor: book.paper,
  },
  newContent: {
    flexGrow: 1,
    paddingBottom: spacing.md,
  },
  placed: {
    position: "absolute",
  },
  strokesLayer: {
    zIndex: 7000,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  emptyPrintRow: {
    justifyContent: "center",
    paddingLeft: MARGIN_LEFT,
  },
  emptyPrint: {
    padding: 6,
    backgroundColor: book.print,
    boxShadow: "0px 2px 6px rgba(52, 23, 32, 0.28)",
    transform: [{ rotate: "-1.4deg" }],
  },
  emptyTape: {
    position: "absolute",
    zIndex: 1,
    top: -9,
    alignSelf: "center",
    width: 58,
    height: 20,
    backgroundColor: book.tape,
    transform: [{ rotate: "-3deg" }],
  },
  emptyWell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: book.labelEdge,
    backgroundColor: book.paper,
  },
  written: {
    paddingLeft: MARGIN_LEFT,
    paddingRight: spacing.xl,
  },
  prints: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignContent: "flex-start",
    justifyContent: "center",
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingLeft: MARGIN_LEFT,
    paddingRight: PRINT_SIDE_ROOM,
  },
  foot: {
    height: FOOT,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingLeft: MARGIN_LEFT,
    // An action's icon is centred in its target: this ends the icon on the written column's edge.
    paddingRight: spacing.xl - (touchTarget.min - ICON) / 2,
  },
  askFoot: {
    paddingRight: spacing.sm,
  },
  number: {
    minWidth: spacing.xl,
  },
  continues: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
  },
  action: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
  },
  writeButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: touchTarget.min,
    marginTop: spacing.xs,
    marginLeft: MARGIN_LEFT,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: book.leather,
  },
  morePage: {
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: {
    paddingLeft: MARGIN_LEFT,
    paddingRight: spacing.xl,
  },
});
