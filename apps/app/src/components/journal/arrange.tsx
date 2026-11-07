import Ionicons from "@expo/vector-icons/Ionicons";
import { JOURNAL_STICKERS_PER_ENTRY, JOURNAL_STROKE_COLORS, JOURNAL_TEXT_MAX, type JournalLayout, type JournalPhotoPlacement, type JournalStickerPlacement } from "@vagabonds/contracts";
import { spacing, Text, touchTarget } from "@vagabonds/ui";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { Keyboard, PanResponder, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { useMessages } from "@/i18n";
import { announce } from "@/lib/announce";
import { newPhotoId } from "@/lib/journal";
import { STROKE_COLORS, strokesBottom } from "@/lib/journal-drawing";
import { duplicateSticker, moveItem, moveText, placeSticker, PRINT_BORDER, printHeight, resizePhoto, resizeSticker, resizeText, snapToCentre, stickersBottom, textTop, textWidth, topZ, turnItem } from "@/lib/journal-layout";
import { stickerArt, type StickerId } from "@/lib/journal-stickers";

import { DrawingPad, Strokes, type Pen } from "./drawing";
import { book, desk, MARGIN_LEFT, PAGE_HEAD, RuledLines, usePageStyle } from "./paper";
import { PrintFrame } from "./print";
import { StickerArt, StickerDrawer } from "./sticker";

const HANDLE = 30;
/** A touch that has moved this far is a drag and not a tap. */
const DRAG_FROM = 6;
const STEP = 0.03;
const SIZE_STEP = 1.1;
const TURN_STEP = 5;
const degrees = (radians: number) => (radians * 180) / Math.PI;

export interface CanvasPhoto {
  id: string;
  aspect: number;
  source: { uri: string; cacheKey?: string };
}

type Selected = { kind: "photo"; id: string } | { kind: "sticker"; id: string } | { kind: "text" } | null;

/**
 * Sizing without a finger on a handle: a screen reader's swipe up and down (`increment`, `decrement`).
 * The screen has no buttons for it, so this is the way for those who cannot drag.
 */
function sizeActions(words: { larger: string; smaller: string }, onSize: (factor: number) => void) {
  return {
    accessibilityActions: [
      { name: "increment", label: words.larger },
      { name: "decrement", label: words.smaller },
    ],
    onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => {
      if (event.nativeEvent.actionName === "increment") onSize(SIZE_STEP);
      if (event.nativeEvent.actionName === "decrement") onSize(1 / SIZE_STEP);
    },
  };
}

/** On the web, for a keyboard: Enter chooses it, the arrows move it once chosen, + and - size it. */
function keyboardProps(onChoose: () => void, onMove: (dx: number, dy: number) => void, onSize: (factor: number) => void): object {
  if (Platform.OS !== "web") return {};
  const moves: Record<string, [number, number]> = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] };
  return {
    focusable: true,
    onKeyDown: (event: { key: string; preventDefault: () => void }) => {
      const move = moves[event.key];
      if (event.key === "Enter" || event.key === " ") onChoose();
      else if (event.key === "+" || event.key === "=") onSize(SIZE_STEP);
      else if (event.key === "-") onSize(1 / SIZE_STEP);
      else if (move) onMove(move[0], move[1]);
      else return;
      event.preventDefault();
    },
  };
}

/** The latest props for handlers made once. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * The page being arranged, the very size it has in the book: what is seen here is what the book shows.
 * A photo drags with a finger, and two fingers or its corner handle size and turn it; the text drags
 * too and stays on the lines. Every one of those also has a button (`Tools`), for those who cannot drag.
 */
export function ArrangeCanvas({
  width,
  pageEnd,
  minHeight,
  date,
  photos,
  layout,
  text,
  onText,
  onLayout,
  onGesture,
  onRemovePhoto,
  editing,
  onEditing,
  drawing,
  picking,
  onPicked,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  width: number;
  /** How far the page shows without scrolling, below the date: the line drawn here says so. */
  pageEnd: number;
  minHeight: number;
  /** The page's date, at its head as in the book. */
  date: string;
  photos: readonly CanvasPhoto[];
  layout: JournalLayout;
  text: string;
  onText: (text: string) => void;
  /** With the page as the visitor just left it. */
  onLayout: (change: (layout: JournalLayout) => JournalLayout) => void;
  /** A finger came down on something, or left it: what it did in between is one step to go back. */
  onGesture: (active: boolean) => void;
  onRemovePhoto: (id: string) => void;
  editing: boolean;
  onEditing: (editing: boolean) => void;
  /** A pen in hand: the page takes every touch, and nothing on it moves. */
  drawing: boolean;
  /** The sheets of stickers are open, in place of the tools. */
  picking: boolean;
  onPicked: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const w = useMessages().journal;
  const page = usePageStyle();
  const [pen, setPen] = useState<Pen>({ color: "ink", size: "thin", rubber: false });
  const [full, setFull] = useState(false);
  const [selected, setSelected] = useState<Selected>(editing ? { kind: "text" } : null);
  const [dragging, setDragging] = useState(false);
  const [textHeight, setTextHeight] = useState(page.line * 3);
  const [viewHeight, setViewHeight] = useState(0);
  const [centreGuide, setCentreGuide] = useState(false);
  const scrollTop = useRef(0);
  /** The page's head and date, above where things are placed. */
  const headRoom = PAGE_HEAD + page.line;
  const onDragging = (active: boolean) => {
    setDragging(active);
    onGesture(active);
    if (!active) setCentreGuide(false);
  };

  const selectedPhoto = selected?.kind === "photo" ? layout.photos.find((one) => one.id === selected.id) ?? null : null;
  const selectedSticker = selected?.kind === "sticker" ? layout.stickers.find((one) => one.id === selected.id) ?? null : null;
  // Gone from the page, by going back a step: nothing is chosen.
  const chosen: Selected = selected && selected.kind !== "text" && !selectedPhoto && !selectedSticker ? null : selected;
  const aspectOf = (id: string) => photos.find((photo) => photo.id === id)?.aspect ?? 1;

  const changePhoto = (id: string, change: (photo: JournalPhotoPlacement) => JournalPhotoPlacement) =>
    onLayout((current) => ({ ...current, photos: current.photos.map((one) => (one.id === id ? change(one) : one)) }));
  const changeSticker = (id: string, change: (sticker: JournalStickerPlacement) => JournalStickerPlacement) =>
    onLayout((current) => ({ ...current, stickers: current.stickers.map((one) => (one.id === id ? change(one) : one)) }));
  const raise = (id: string) =>
    onLayout((current) => ({
      ...current,
      photos: current.photos.map((one) => (one.id === id ? { ...one, z: topZ(current) + 1 } : one)),
      stickers: current.stickers.map((one) => (one.id === id ? { ...one, z: topZ(current) + 1 } : one)),
    }));
  const pickSticker = (sticker: StickerId) => {
    const id = newPhotoId();
    onLayout((current) => placeSticker(current, id, sticker, Math.max(0, scrollTop.current - headRoom) / width, viewHeight / width));
    setSelected({ kind: "sticker", id });
    onEditing(false);
    onPicked();
    announce(w.arrange.stickerAdded(w.arrange.stickerNames[sticker]));
  };

  const lowest = layout.photos.reduce((low, placement) => Math.max(low, (placement.y + printHeight(placement.width, aspectOf(placement.id), width)) * width), textTop(layout.text.y, width, page.line) + textHeight);
  const height = Math.max(minHeight, viewHeight - headRoom, lowest + page.line * 2, strokesBottom(layout.strokes, width) + page.line * 2, stickersBottom(layout.stickers, width) + page.line * 2);
  const changeStrokes = (change: (strokes: JournalLayout["strokes"]) => JournalLayout["strokes"]) => {
    setFull(false);
    onLayout((current) => ({ ...current, strokes: change(current.strokes) }));
  };

  return (
    <View style={styles.frame}>
      <View style={[styles.sheet, { width }]}>
        <ScrollView
          scrollEnabled={!dragging && !drawing}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
          scrollEventThrottle={64}
          onScroll={(event) => {
            scrollTop.current = event.nativeEvent.contentOffset.y;
          }}
          onLayout={(event) => setViewHeight(event.nativeEvent.layout.height)}
        >
          <View style={[styles.head, { paddingTop: PAGE_HEAD }]}>
            <View style={[StyleSheet.absoluteFill, { top: PAGE_HEAD }]}>
              <RuledLines height={page.line} line={page.line} plain={page.plain} />
            </View>
            <Text numberOfLines={1} style={[page.date, styles.dateWords, { color: page.inkSoft }]}>
              {date}
            </Text>
          </View>
          {/* A touch reaches this only where no photo or text took it first: then nothing is chosen any more. */}
          <View
            onStartShouldSetResponder={() => true}
            onResponderRelease={() => {
              setSelected(null);
              onEditing(false);
              Keyboard.dismiss();
            }}
            style={{ width, height }}
          >
            <RuledLines height={height} line={page.line} plain={page.plain} />
            <View aria-hidden pointerEvents="none" style={[styles.pageEnd, { top: pageEnd }]}>
              <Text variant="caption" colorValue={book.inkSoft} style={styles.pageEndWord}>
                {w.arrange.pageEnd}
              </Text>
            </View>
            {centreGuide && <View aria-hidden pointerEvents="none" style={[styles.centreGuide, { left: width / 2 }]} />}
            {layout.photos.map((placement) => {
              const photo = photos.find((one) => one.id === placement.id);
              if (!photo) return null;
              return (
                <PhotoItem
                  key={placement.id}
                  placement={placement}
                  photo={photo}
                  pageWidth={width}
                  selected={!drawing && selectedPhoto?.id === placement.id}
                  label={w.arrange.photoLabel(layout.photos.indexOf(placement) + 1)}
                  words={w.arrange}
                  onSelect={() => {
                    setSelected({ kind: "photo", id: placement.id });
                    onEditing(false);
                    Keyboard.dismiss();
                  }}
                  onChange={(change) => changePhoto(placement.id, change)}
                  onDragging={onDragging}
                  onGuide={setCentreGuide}
                />
              );
            })}
            {layout.stickers.filter((placement) => stickerArt(placement.sticker)).map((placement) => (
              <FreeItem
                key={placement.id}
                placement={placement}
                heightShare={placement.width}
                pageWidth={width}
                selected={!drawing && selectedSticker?.id === placement.id}
                label={w.arrange.stickerLabel(w.arrange.stickerNames[placement.sticker as StickerId])}
                words={w.arrange}
                resize={resizeSticker}
                onSelect={() => {
                  setSelected({ kind: "sticker", id: placement.id });
                  onEditing(false);
                  Keyboard.dismiss();
                }}
                onChange={(change) => changeSticker(placement.id, change)}
                onDragging={onDragging}
                onGuide={setCentreGuide}
              >
                <StickerArt sticker={placement.sticker} size={placement.width * width} />
              </FreeItem>
            ))}
            <TextItem
              value={text}
              onValue={onText}
              placement={layout.text}
              pageWidth={width}
              line={page.line}
              page={page}
              selected={!drawing && selected?.kind === "text"}
              editing={editing}
              placeholder={w.placeholder}
              label={w.textLabel}
              words={w.arrange}
              onSelect={() => setSelected({ kind: "text" })}
              onEditing={onEditing}
              onChange={(change) => onLayout((current) => ({ ...current, text: change(current.text) }))}
              onDragging={onDragging}
              onHeight={setTextHeight}
            />
            {/* Over the photos too: a line can run across them, as a pen would. */}
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.strokesLayer]}>
              <Strokes strokes={layout.strokes} width={width} height={height} />
            </View>
            {drawing && <DrawingPad strokes={layout.strokes} pen={pen} width={width} height={height} onStrokes={changeStrokes} onFull={() => setFull(true)} />}
          </View>
        </ScrollView>
        {/* The fold of the book, on the page's inner side. */}
        <View aria-hidden pointerEvents="none" style={styles.fold} />
      </View>
      {picking ? (
        <StickerDrawer full={layout.stickers.length >= JOURNAL_STICKERS_PER_ENTRY} onPick={pickSticker} />
      ) : editing ? (
        <View style={styles.keyboardBar}>
          <Text variant="caption" colorValue={desk.inkSoft}>
            {w.arrange.charCount(text.length, JOURNAL_TEXT_MAX)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onEditing(false);
              Keyboard.dismiss();
            }}
            style={styles.keyboardDone}
          >
            <Text variant="label" colorValue={book.hideDark}>
              {w.arrange.drawDone}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.context}>
          <Tool icon="arrow-undo-outline" label={w.arrange.undo} off={!canUndo} onPress={onUndo} />
          <Tool icon="arrow-redo-outline" label={w.arrange.redo} off={!canRedo} onPress={onRedo} />
          <View style={styles.contextLine} />
          {drawing ? (
            <DrawTools pen={pen} words={w.arrange} full={full} onPen={setPen} />
          ) : (
            <Tools
              selected={chosen}
              words={w.arrange}
              canCopy={layout.stickers.length < JOURNAL_STICKERS_PER_ENTRY}
              onMove={(dx, dy) => {
                if (selectedPhoto) changePhoto(selectedPhoto.id, (one) => moveItem(one, one.x + dx, one.y + dy));
                else if (selectedSticker) changeSticker(selectedSticker.id, (one) => moveItem(one, one.x + dx, one.y + dy));
                else if (selected?.kind === "text") {
                  // A whole line at a time up and down: the text lies on the lines.
                  const lineStep = page.line / width;
                  onLayout((current) => ({ ...current, text: moveText(current.text, current.text.x + dx, current.text.y + Math.sign(dy) * lineStep) }));
                }
              }}
              onTurn={(by) => {
                if (selectedPhoto) changePhoto(selectedPhoto.id, (one) => turnItem(one, one.rotation + by));
                if (selectedSticker) changeSticker(selectedSticker.id, (one) => turnItem(one, one.rotation + by));
              }}
              onFront={() => {
                const item = selectedPhoto ?? selectedSticker;
                if (item) raise(item.id);
              }}
              onCopy={() => {
                if (!selectedSticker) return;
                const id = newPhotoId();
                onLayout((current) => duplicateSticker(current, selectedSticker.id, id));
                setSelected({ kind: "sticker", id });
              }}
              onRemove={() => {
                if (selectedPhoto) onRemovePhoto(selectedPhoto.id);
                if (selectedSticker) onLayout((current) => ({ ...current, stickers: current.stickers.filter((one) => one.id !== selectedSticker.id) }));
                setSelected(null);
              }}
              onWrite={() => onEditing(true)}
            />
          )}
        </View>
      )}
    </View>
  );
}

/**
 * What lies freely on the page, a photo or a sticker. It drags with a finger; two fingers or its
 * corner handle size and turn it, about its centre. `heightShare` is its height in shares of the page's width.
 */
function FreeItem<T extends JournalPhotoPlacement | JournalStickerPlacement>({
  placement,
  heightShare,
  pageWidth,
  selected,
  label,
  words,
  resize,
  onSelect,
  onChange,
  onDragging,
  onGuide,
  children,
}: {
  placement: T;
  heightShare: number;
  pageWidth: number;
  selected: boolean;
  label: string;
  words: ToolWords;
  resize: (item: T, width: number) => T;
  onSelect: () => void;
  onChange: (change: (item: T) => T) => void;
  onDragging: (dragging: boolean) => void;
  /** It lies on the page's middle now, or no longer. */
  onGuide: (shown: boolean) => void;
  children: React.ReactNode;
}) {
  const latest = useLatest({ placement, heightShare, pageWidth, resize, onSelect, onChange, onDragging, onGuide });
  const start = useRef(placement);
  const pinch = useRef<{ distance: number; angle: number } | null>(null);

  const drag = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        start.current = latest.current.placement;
        pinch.current = null;
        latest.current.onSelect();
        latest.current.onDragging(true);
      },
      onPanResponderMove: (event, { dx, dy }) => {
        const size = latest.current.pageWidth;
        const touches = event.nativeEvent.touches ?? [];
        const [a, b] = touches;
        if (a && b) {
          // Two fingers: how far apart they are sizes it, the line between them turns it.
          const distance = Math.hypot(b.pageX - a.pageX, b.pageY - a.pageY);
          const angle = degrees(Math.atan2(b.pageY - a.pageY, b.pageX - a.pageX));
          if (!pinch.current) {
            pinch.current = { distance, angle };
            start.current = latest.current.placement;
          }
          const { distance: fromDistance, angle: fromAngle } = pinch.current;
          latest.current.onChange(() => turnItem(latest.current.resize(start.current, start.current.width * (distance / fromDistance)), start.current.rotation + angle - fromAngle));
        } else if (!pinch.current) {
          const { x, snapped } = snapToCentre(start.current.x + dx / size, start.current.width);
          latest.current.onGuide(snapped);
          latest.current.onChange(() => moveItem(start.current, x, start.current.y + dy / size));
        }
      },
      onPanResponderRelease: () => latest.current.onDragging(false),
      onPanResponderTerminate: () => latest.current.onDragging(false),
    }),
  ).current;

  // The handle sizes and turns it about its centre with one finger, or a mouse.
  const handleFrom = useRef({ centreX: 0, centreY: 0, distance: 1, angle: 0 });
  const handle = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_event, { x0, y0 }) => {
        const { placement: now, pageWidth: size, heightShare: tall } = latest.current;
        start.current = now;
        const halfWidth = (now.width * size) / 2;
        const halfHeight = (tall * size) / 2;
        const turn = (now.rotation * Math.PI) / 180;
        const toHandleX = halfWidth * Math.cos(turn) - halfHeight * Math.sin(turn);
        const toHandleY = halfWidth * Math.sin(turn) + halfHeight * Math.cos(turn);
        handleFrom.current = { centreX: x0 - toHandleX, centreY: y0 - toHandleY, distance: Math.hypot(toHandleX, toHandleY), angle: degrees(Math.atan2(toHandleY, toHandleX)) };
        latest.current.onDragging(true);
      },
      onPanResponderMove: (_event, { moveX, moveY }) => {
        const { centreX, centreY, distance, angle } = handleFrom.current;
        const x = moveX - centreX;
        const y = moveY - centreY;
        latest.current.onChange(() => turnItem(latest.current.resize(start.current, start.current.width * (Math.hypot(x, y) / distance)), start.current.rotation + degrees(Math.atan2(y, x)) - angle));
      },
      onPanResponderRelease: () => latest.current.onDragging(false),
      onPanResponderTerminate: () => latest.current.onDragging(false),
    }),
  ).current;

  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onAccessibilityTap={onSelect}
      {...sizeActions(words, (factor) => onChange((one) => resize(one, one.width * factor)))}
      {...keyboardProps(
        onSelect,
        (dx, dy) => onChange((one) => moveItem(one, one.x + dx, one.y + dy)),
        (factor) => onChange((one) => resize(one, one.width * factor)),
      )}
      {...drag.panHandlers}
      style={[styles.placed, { left: placement.x * pageWidth, top: placement.y * pageWidth, width: placement.width * pageWidth, zIndex: selected ? 6500 : placement.z, transform: [{ rotate: `${placement.rotation}deg` }] }]}
    >
      {/* Touches stay with this item. */}
      <View pointerEvents="none">{children}</View>
      {selected && (
        <>
          <View aria-hidden pointerEvents="none" style={styles.outline} />
          <View aria-hidden {...handle.panHandlers} style={styles.handle}>
            <Ionicons name="resize" size={16} color={book.leather} />
          </View>
        </>
      )}
    </View>
  );
}

function PhotoItem({
  placement,
  photo,
  pageWidth,
  selected,
  label,
  words,
  onSelect,
  onChange,
  onDragging,
  onGuide,
}: {
  placement: JournalPhotoPlacement;
  photo: CanvasPhoto;
  pageWidth: number;
  selected: boolean;
  label: string;
  words: ToolWords;
  onSelect: () => void;
  onChange: (change: (photo: JournalPhotoPlacement) => JournalPhotoPlacement) => void;
  onDragging: (dragging: boolean) => void;
  onGuide: (shown: boolean) => void;
}) {
  const itemWidth = placement.width * pageWidth;
  const imageHeight = (itemWidth - PRINT_BORDER * 2) / photo.aspect;
  return (
    <FreeItem
      placement={placement}
      heightShare={printHeight(placement.width, photo.aspect, pageWidth)}
      pageWidth={pageWidth}
      selected={selected}
      label={label}
      words={words}
      resize={resizePhoto}
      onSelect={onSelect}
      onChange={onChange}
      onDragging={onDragging}
      onGuide={onGuide}
    >
      <PrintFrame id={photo.id} width={itemWidth} tilt={0}>
        {/* `draggable`: the browser's own drag of an image would end this one. */}
        <Image source={photo.source} recyclingKey={photo.id} cachePolicy="memory" contentFit="cover" draggable={false} style={{ height: imageHeight }} />
      </PrintFrame>
    </FreeItem>
  );
}

function TextItem({
  value,
  onValue,
  placement,
  pageWidth,
  line,
  page,
  selected,
  editing,
  placeholder,
  label,
  words,
  onSelect,
  onEditing,
  onChange,
  onDragging,
  onHeight,
}: {
  value: string;
  onValue: (text: string) => void;
  placement: JournalLayout["text"];
  pageWidth: number;
  line: number;
  page: ReturnType<typeof usePageStyle>;
  selected: boolean;
  editing: boolean;
  placeholder: string;
  label: string;
  words: ToolWords;
  onSelect: () => void;
  onEditing: (editing: boolean) => void;
  onChange: (change: (text: JournalLayout["text"]) => JournalLayout["text"]) => void;
  onDragging: (dragging: boolean) => void;
  onHeight: (height: number) => void;
}) {
  const latest = useLatest({ placement, pageWidth, onSelect, onChange, onDragging, onEditing });
  const start = useRef(placement);
  const moved = useRef(false);
  const drag = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        start.current = latest.current.placement;
        moved.current = false;
        latest.current.onSelect();
        latest.current.onDragging(true);
      },
      onPanResponderMove: (_event, { dx, dy }) => {
        if (!moved.current && Math.hypot(dx, dy) < DRAG_FROM) return;
        moved.current = true;
        const size = latest.current.pageWidth;
        latest.current.onChange(() => moveText(start.current, start.current.x + dx / size, start.current.y + dy / size));
      },
      onPanResponderRelease: () => {
        latest.current.onDragging(false);
        // Hardly moved: it was a tap, to write.
        if (!moved.current) latest.current.onEditing(true);
      },
      onPanResponderTerminate: () => latest.current.onDragging(false),
    }),
  ).current;

  // The edge handle sets how wide the text runs.
  const edgeFrom = useRef(placement.width);
  const edge = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        edgeFrom.current = textWidth(latest.current.placement);
        latest.current.onDragging(true);
      },
      onPanResponderMove: (_event, { dx }) => latest.current.onChange((one) => resizeText(one, edgeFrom.current + dx / latest.current.pageWidth)),
      onPanResponderRelease: () => latest.current.onDragging(false),
      onPanResponderTerminate: () => latest.current.onDragging(false),
    }),
  ).current;

  const box = { left: placement.x * pageWidth, top: textTop(placement.y, pageWidth, line), width: textWidth(placement) * pageWidth, zIndex: selected ? 6000 : placement.z };
  if (editing) {
    return (
      <View style={[styles.placed, box]} onLayout={(event) => onHeight(event.nativeEvent.layout.height)}>
        <TextInput
          multiline
          autoFocus
          value={value}
          onChangeText={onValue}
          onBlur={() => onEditing(false)}
          maxLength={JOURNAL_TEXT_MAX}
          placeholder={placeholder}
          placeholderTextColor={page.inkSoft}
          accessibilityLabel={label}
          scrollEnabled={false}
          textAlignVertical="top"
          style={[page.input, styles.input, { color: page.ink, minHeight: line * 2 }]}
        />
      </View>
    );
  }
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      onAccessibilityTap={() => {
        onSelect();
        onEditing(true);
      }}
      {...keyboardProps(
        () => {
          onSelect();
          onEditing(true);
        },
        (dx, dy) => onChange((one) => moveText(one, one.x + dx, one.y + dy)),
        (factor) => onChange((one) => resizeText(one, one.width * factor)),
      )}
      {...sizeActions({ larger: words.wider, smaller: words.narrower }, (factor) => onChange((one) => resizeText(one, one.width * factor)))}
      {...drag.panHandlers}
      style={[styles.placed, box]}
      onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
    >
      <Text style={[page.body, { color: value ? page.ink : page.inkSoft, minHeight: line * 2 }]}>{value || placeholder}</Text>
      {selected && (
        <>
          <View aria-hidden pointerEvents="none" style={styles.outline} />
          <View aria-hidden {...edge.panHandlers} style={styles.edgeHandle}>
            <Ionicons name="swap-horizontal" size={15} color={book.leather} />
          </View>
        </>
      )}
    </View>
  );
}

type ToolWords = ReturnType<typeof useMessages>["journal"]["arrange"];

function Tool({ icon, label, off = false, on = false, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; off?: boolean; on?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: off, selected: on }} disabled={off} onPress={onPress} style={({ pressed }) => [styles.tool, on && styles.toolOn, pressed && styles.toolPressed, off && styles.toolOff]}>
      <Ionicons name={icon} size={22} color={desk.ink} />
    </Pressable>
  );
}

/** What can be done with the thing chosen, without dragging it. */
function Tools({
  selected,
  words,
  canCopy,
  onMove,
  onTurn,
  onFront,
  onCopy,
  onRemove,
  onWrite,
}: {
  selected: Selected;
  words: ToolWords;
  canCopy: boolean;
  onMove: (dx: number, dy: number) => void;
  onTurn: (by: number) => void;
  onFront: () => void;
  onCopy: () => void;
  onRemove: () => void;
  onWrite: () => void;
}) {
  const [arrows, setArrows] = useState(false);
  if (!selected) {
    return (
      <Text variant="caption" numberOfLines={2} colorValue={desk.inkSoft} style={styles.toolsHint}>
        {words.hint}
      </Text>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={styles.flex} contentContainerStyle={styles.toolsRow}>
      {selected.kind !== "text" ? (
        <>
          <Tool icon="trash-outline" label={selected.kind === "photo" ? words.remove : words.removeSticker} onPress={onRemove} />
          {selected.kind === "sticker" && <Tool icon="copy-outline" label={words.duplicate} off={!canCopy} onPress={onCopy} />}
          <Tool icon="layers-outline" label={words.front} onPress={onFront} />
          <Tool icon="return-up-back" label={words.turnLeft} onPress={() => onTurn(-TURN_STEP)} />
          <Tool icon="return-up-forward" label={words.turnRight} onPress={() => onTurn(TURN_STEP)} />
        </>
      ) : (
        <Tool icon="pencil" label={words.write} onPress={onWrite} />
      )}
      {/* For those who cannot drag: folded away, so they do not crowd out what is used most. */}
      <Tool icon="move-outline" label={words.moveByButtons} on={arrows} onPress={() => setArrows((now) => !now)} />
      {arrows && (
        <>
          <Tool icon="arrow-back" label={words.left} onPress={() => onMove(-STEP, 0)} />
          <Tool icon="arrow-up" label={words.up} onPress={() => onMove(0, -STEP)} />
          <Tool icon="arrow-down" label={words.down} onPress={() => onMove(0, STEP)} />
          <Tool icon="arrow-forward" label={words.right} onPress={() => onMove(STEP, 0)} />
        </>
      )}
    </ScrollView>
  );
}

/** The pens: a colour, how thick, and the rubber. */
function DrawTools({ pen, words, full, onPen }: { pen: Pen; words: ToolWords; full: boolean; onPen: (pen: Pen) => void }) {
  if (full) {
    return (
      <Text accessibilityRole="alert" variant="caption" numberOfLines={2} colorValue={book.gold} style={styles.toolsHint}>
        {words.drawFull}
      </Text>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.flex} contentContainerStyle={styles.toolsRow}>
      {JOURNAL_STROKE_COLORS.map((color) => {
        const on = !pen.rubber && pen.color === color;
        return (
          <Pressable key={color} accessibilityRole="radio" accessibilityLabel={words.colors[color]} accessibilityState={{ selected: on }} onPress={() => onPen({ ...pen, color, rubber: false })} style={styles.tool}>
            <View style={[styles.swatchRing, on && styles.swatchRingOn]}>
              <View style={[styles.swatch, { backgroundColor: STROKE_COLORS[color] }]} />
            </View>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={pen.size === "thin" ? words.makeThick : words.makeThin}
        onPress={() => onPen({ ...pen, size: pen.size === "thin" ? "thick" : "thin", rubber: false })}
        style={styles.tool}
      >
        <View style={[styles.penSize, { height: pen.size === "thin" ? 3 : 7 }]} />
      </Pressable>
      <Tool icon="backspace-outline" label={words.rubber} on={pen.rubber} onPress={() => onPen({ ...pen, rubber: !pen.rubber })} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  frame: {
    flex: 1,
  },
  sheet: {
    flex: 1,
    alignSelf: "center",
    borderRadius: 6,
    backgroundColor: book.paper,
    boxShadow: "0px 6px 22px rgba(0, 0, 0, 0.42)",
  },
  scroll: {
    flex: 1,
    borderRadius: 6,
    backgroundColor: book.paper,
  },
  fold: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 9,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    backgroundColor: "rgba(40, 50, 44, 0.07)",
  },
  head: {
    justifyContent: "flex-end",
  },
  dateWords: {
    paddingLeft: MARGIN_LEFT,
    paddingRight: spacing.xl,
  },
  placed: {
    position: "absolute",
  },
  pageEnd: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: book.labelEdge,
  },
  pageEndWord: {
    alignSelf: "flex-end",
    paddingHorizontal: spacing.sm,
  },
  centreGuide: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1.5,
    marginLeft: -0.75,
    zIndex: 8000,
    backgroundColor: book.gilt,
  },
  outline: {
    position: "absolute",
    top: -3,
    right: -3,
    bottom: -3,
    left: -3,
    borderWidth: 1.5,
    borderRadius: 3,
    borderColor: book.leather,
  },
  handle: {
    position: "absolute",
    right: -HANDLE / 2,
    bottom: -HANDLE / 2,
    width: HANDLE,
    height: HANDLE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: HANDLE / 2,
    borderWidth: 1.5,
    borderColor: book.leather,
    backgroundColor: "#FFFFFF",
    boxShadow: "0px 2px 5px rgba(0, 0, 0, 0.3)",
    zIndex: 1,
  },
  strokesLayer: {
    zIndex: 7000,
  },
  edgeHandle: {
    position: "absolute",
    right: -13,
    top: "50%",
    marginTop: -13,
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: book.leather,
    backgroundColor: "#FFFFFF",
    boxShadow: "0px 2px 5px rgba(0, 0, 0, 0.3)",
  },
  swatchRing: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchRingOn: {
    borderColor: book.gold,
  },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: desk.ink,
  },
  penSize: {
    width: 24,
    borderRadius: 4,
    backgroundColor: desk.ink,
  },
  input: {
    padding: 0,
  },
  context: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: touchTarget.min + spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  contextLine: {
    width: 1,
    height: 24,
    marginHorizontal: spacing.xxs,
    backgroundColor: desk.raised,
  },
  keyboardBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  keyboardDone: {
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: touchTarget.min / 2,
    backgroundColor: book.gold,
  },
  toolsHint: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  toolsRow: {
    alignItems: "center",
  },
  tool: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: touchTarget.min / 2,
  },
  toolOn: {
    backgroundColor: desk.raised,
  },
  toolPressed: {
    backgroundColor: desk.raised,
  },
  toolOff: {
    opacity: 0.35,
  },
});
