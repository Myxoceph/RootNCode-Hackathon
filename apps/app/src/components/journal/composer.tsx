import Ionicons from "@expo/vector-icons/Ionicons";
import { Marcellus_400Regular } from "@expo-google-fonts/marcellus/400Regular";
import { type JournalEntry, type JournalLayout } from "@vagabonds/contracts";
import { radius, spacing, Text, touchTarget } from "@vagabonds/ui";
import { useFonts } from "expo-font";
import * as ImagePicker from "expo-image-picker";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DataError } from "@/data/errors";
import { journalImageUri } from "@/data/journal";
import { useLang, useMessages } from "@/i18n";
import { announce } from "@/lib/announce";
import { formatDate } from "@/lib/format-date";
import { addJournalEntry, editJournalEntry, newPhotoId, photoRoom, type PickedPhoto } from "@/lib/journal";
import { emptyHistory, record, redo, undo, type History } from "@/lib/journal-history";
import { autoLayout, compactLayout, placeNewPhoto, placementsFor, type PageRoom } from "@/lib/journal-layout";

import { ArrangeCanvas, type CanvasPhoto } from "./arrange";
import { book, desk, linesArea, MARGIN_LEFT, usePageStyle } from "./paper";

const PICK_AFTER_MS = 450;
const TITLE_FONT = "Marcellus_400Regular";

/** What going back and forward brings back: the words have their own, on the keyboard. */
interface Draft {
  layout: JournalLayout;
  added: readonly PickedPhoto[];
  removed: readonly string[];
}

/** A finger on something: the whole movement, from touch to release, is one step to go back. */
type Gesture = "none" | "started" | "moving";

/**
 * A page being written and arranged: the page itself, the size it has in the book, lying on the cover's
 * green, with what can be done with the thing chosen under it and the tools at the foot. Closes as soon as
 * the text is saved; its photos go on in the background. `entry` is the page being changed, null a new one;
 * `pickFirst` opens the photos straight away, `writeFirst` the keyboard. Mounted anew for each page.
 */
export function JournalComposer({
  entry,
  pageWidth,
  pageHeight,
  pickFirst = false,
  writeFirst = false,
  onClose,
  onSaved,
}: {
  entry: JournalEntry | null;
  pageWidth: number;
  pageHeight: number;
  pickFirst?: boolean;
  writeFirst?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const w = useMessages().journal;
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const page = usePageStyle();
  const [titleLoaded] = useFonts({ Marcellus_400Regular });
  const room: PageRoom = { left: MARGIN_LEFT / pageWidth, right: 1 - spacing.xl / pageWidth, width: pageWidth };

  const kept = entry?.photos ?? [];
  const keptPlaceable = kept.map((photo) => ({ id: photo.id, aspect: photo.width / photo.height }));
  const [text, setText] = useState(entry?.text ?? "");
  const [{ draft, history }, setState] = useState<{ draft: Draft; history: History<Draft> }>(() => ({
    draft: {
      layout: entry?.layout ? { ...entry.layout, photos: placementsFor(entry.layout, keptPlaceable, room) } : autoLayout(keptPlaceable, room),
      added: [],
      removed: [],
    },
    history: emptyHistory(),
  }));
  const { layout, added, removed } = draft;
  /** Moved by hand: from then on a new photo does not rearrange what was placed. */
  const [moved, setMoved] = useState(entry?.layout != null);
  const [changedLayout, setChangedLayout] = useState(false);
  const [editing, setEditing] = useState(writeFirst);
  const [drawing, setDrawing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const gesture = useRef<Gesture>("none");

  const keptNow = kept.filter((photo) => !removed.includes(photo.id));
  const canvasPhotos: CanvasPhoto[] = [
    ...keptNow.map((photo) => ({ id: photo.id, aspect: photo.width / photo.height, source: { uri: journalImageUri(photo.thumbUrl), cacheKey: `journal-${photo.id}-thumb` } })),
    ...added.map((photo) => ({ id: photo.id, aspect: photo.width / photo.height, source: { uri: photo.uri } })),
  ];
  const photoSpace = photoRoom(entry) + removed.length - added.length;
  const hasContent = text.trim().length > 0 || keptNow.length > 0 || added.length > 0 || layout.strokes.length > 0 || layout.stickers.length > 0;
  const dirty = text !== (entry?.text ?? "") || added.length > 0 || removed.length > 0 || changedLayout;
  const canSave = !saving && dirty && (entry !== null || hasContent);

  const change = (next: (current: Draft) => Draft) => {
    const joins = gesture.current === "moving";
    if (gesture.current === "started") gesture.current = "moving";
    setChangedLayout(true);
    setState((state) => {
      const draftNow = next(state.draft);
      return { draft: draftNow, history: joins ? { ...state.history, future: [] } : record(state.history, state.draft) };
    });
  };

  const travel = (step: typeof undo, word: string) => {
    const result = step(history, draft);
    if (!result) return;
    setChangedLayout(true);
    setState({ draft: result.value, history: result.history });
    announce(word);
  };

  const pick = async () => {
    setError(null);
    setEditing(false);
    setDrawing(false);
    setPicking(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: photoSpace > 1,
        selectionLimit: photoSpace,
        exif: false,
        // The file as it is: it becomes a smaller JPEG only when its turn to be sent comes.
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      });
      if (result.canceled) return;
      const photos = result.assets.slice(0, photoSpace).map(({ uri, width, height }) => ({ id: newPhotoId(), uri, width, height }));
      const shapes = photos.map((photo) => ({ id: photo.id, aspect: photo.width / photo.height }));
      change((current) => ({
        ...current,
        added: [...current.added, ...photos],
        layout: moved
          ? shapes.reduce((next, shape) => placeNewPhoto(next, shape, room), current.layout)
          : { ...autoLayout([...canvasPhotos.map(({ id, aspect }) => ({ id, aspect })), ...shapes], room), strokes: current.layout.strokes, stickers: current.layout.stickers },
      }));
      announce(w.photosPicked(photos.length));
    } catch {
      setError(w.errors.pickFailed);
    }
  };

  // Once this page has slid up: the system will not put its picker over a sheet still on its way.
  useEffect(() => {
    if (!pickFirst) return;
    const timer = setTimeout(() => void pick(), Platform.OS === "web" ? 0 : PICK_AFTER_MS);
    return () => clearTimeout(timer);
    // Only as the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removePhoto = (id: string) =>
    change((current) => ({
      added: current.added.filter((photo) => photo.id !== id),
      removed: current.added.some((photo) => photo.id === id) ? current.removed : [...current.removed, id],
      layout: { ...current.layout, photos: current.layout.photos.filter((photo) => photo.id !== id) },
    }));

  const tidy = () => {
    setMoved(false);
    // What was drawn and stuck on stays where it is: only the photos and the text are put in order.
    change((current) => ({ ...current, layout: { ...autoLayout(canvasPhotos.map(({ id, aspect }) => ({ id, aspect })), room), strokes: current.layout.strokes, stickers: current.layout.stickers } }));
    announce(w.arrange.tidied);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const final = compactLayout(layout);
      if (entry) await editJournalEntry(entry, text, [...added], [...removed], changedLayout || entry.layout !== null ? final : undefined);
      else await addJournalEntry(text, [...added], final);
      announce(w.saved);
      onSaved();
    } catch (cause) {
      setError(cause instanceof DataError ? cause.message : w.errors.failed);
      setSaving(false);
    }
  };

  const close = () => {
    if (dirty && !discarding) setDiscarding(true);
    else onClose();
  };

  const tools = [
    { key: "write", icon: "create-outline", label: w.arrange.write, word: w.arrange.writeShort, on: false, off: false, onPress: () => {
      setDrawing(false);
      setPicking(false);
      setEditing(true);
    } },
    { key: "photo", icon: "image-outline", label: w.addPhoto, hint: w.addPhotoHint(photoSpace), word: w.addPhotoShort, on: false, off: photoSpace <= 0, onPress: () => void pick() },
    { key: "stickers", icon: picking ? "close" : "happy-outline", label: picking ? w.arrange.stickersClose : w.arrange.stickers, word: picking ? w.arrange.stickersCloseShort : w.arrange.stickers, on: picking, off: false, onPress: () => {
      setEditing(false);
      setDrawing(false);
      setPicking((now) => !now);
    } },
    { key: "draw", icon: drawing ? "checkmark" : "brush-outline", label: drawing ? w.arrange.drawDone : w.arrange.draw, word: drawing ? w.arrange.drawDone : w.arrange.draw, on: drawing, off: false, onPress: () => {
      setEditing(false);
      setPicking(false);
      setDrawing((now) => !now);
    } },
    { key: "tidy", icon: "grid-outline", label: w.arrange.tidy, word: w.arrange.tidyShort, on: false, off: false, onPress: tidy },
  ] as const;

  return (
    <Modal visible animationType="slide" onRequestClose={close} statusBarTranslucent>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.page} accessibilityViewIsModal>
        <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={w.cancel} onPress={close} disabled={saving} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={desk.ink} />
          </Pressable>
          <Text headingLevel={1} numberOfLines={1} colorValue={book.gold} style={[styles.title, titleLoaded && !page.plain ? styles.titleFont : null]}>
            {entry ? w.editTitle : w.newTitle}
          </Text>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSave }} disabled={!canSave} onPress={() => void save()} style={[styles.saveButton, !canSave && styles.saveOff]}>
            <Text variant="label" numberOfLines={1} colorValue={canSave ? book.hideDark : desk.inkSoft}>
              {saving ? w.saving : w.save}
            </Text>
          </Pressable>
        </View>

        <ArrangeCanvas
          width={pageWidth}
          pageEnd={linesArea(pageHeight, page.line) - page.line}
          minHeight={pageHeight}
          date={formatDate(entry?.createdAt ?? new Date().toISOString(), lang)}
          photos={canvasPhotos}
          layout={layout}
          text={text}
          onText={setText}
          onLayout={(next) => {
            setMoved(true);
            change((current) => ({ ...current, layout: next(current.layout) }));
          }}
          onGesture={(active) => {
            gesture.current = active ? "started" : "none";
          }}
          onRemovePhoto={removePhoto}
          editing={editing}
          onEditing={setEditing}
          drawing={drawing}
          picking={picking}
          onPicked={() => setPicking(false)}
          canUndo={history.past.length > 0}
          canRedo={history.future.length > 0}
          onUndo={() => travel(undo, w.arrange.undone)}
          onRedo={() => travel(redo, w.arrange.redone)}
        />

        {error && (
          <View accessibilityRole="alert" style={styles.errorPill}>
            <Ionicons name="alert-circle" size={18} color={book.danger} />
            <Text variant="caption" colorValue={book.danger} style={styles.flex}>
              {error}
            </Text>
          </View>
        )}

        {/* While writing the keyboard is the tool: the page gets the room. */}
        {!editing && (
          <View style={[styles.dockRoom, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
            <View style={styles.dock}>
              {tools.map((tool) => (
                <Pressable
                  key={tool.key}
                  accessibilityRole="button"
                  accessibilityLabel={tool.label}
                  accessibilityHint={"hint" in tool ? tool.hint : undefined}
                  accessibilityState={{ disabled: tool.off, selected: tool.on }}
                  disabled={tool.off}
                  onPress={tool.onPress}
                  style={[styles.dockItem, tool.on && styles.dockItemOn, tool.off && styles.dockItemOff]}
                >
                  <Ionicons name={tool.icon} size={22} color={tool.on ? book.hideDark : desk.ink} />
                  <Text variant="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} colorValue={tool.on ? book.hideDark : desk.ink}>
                    {tool.word}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {discarding && (
          <View accessibilityViewIsModal style={styles.shade}>
            <View accessibilityRole="alert" style={styles.dialog}>
              <Text colorValue={book.ink} style={styles.dialogText}>
                {w.discardAsk}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => setDiscarding(false)} style={styles.dialogKeep}>
                <Text variant="label" colorValue="#FFFFFF">
                  {w.discardNo}
                </Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={onClose} style={styles.dialogLeave}>
                <Text variant="label" colorValue={book.danger}>
                  {w.discardYes}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  page: {
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
  saveButton: {
    minWidth: 76,
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: touchTarget.min / 2,
    backgroundColor: book.gold,
  },
  saveOff: {
    backgroundColor: desk.raised,
  },
  errorPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: book.paper,
  },
  dockRoom: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xxs,
  },
  dock: {
    flexDirection: "row",
    alignSelf: "center",
    width: "100%",
    maxWidth: 480,
    padding: spacing.xxs,
    borderRadius: radius.lg,
    backgroundColor: desk.raised,
  },
  dockItem: {
    flex: 1,
    minHeight: touchTarget.min + spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 2,
    borderRadius: radius.md,
  },
  dockItemOn: {
    backgroundColor: book.gold,
  },
  dockItemOff: {
    opacity: 0.45,
  },
  shade: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: "rgba(6, 22, 16, 0.62)",
  },
  dialog: {
    width: "100%",
    maxWidth: 340,
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: book.paper,
  },
  dialogText: {
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  dialogKeep: {
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: book.leather,
  },
  dialogLeave: {
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
  },
});
