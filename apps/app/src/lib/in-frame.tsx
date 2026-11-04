import Ionicons from "@expo/vector-icons/Ionicons";
import { fontFamily, palette, Text } from "@vagabonds/ui";
import { Link, type Href } from "expo-router";
import { cloneElement, createContext, useContext, useEffect, useRef, type ComponentRef, type ReactElement, type ReactNode } from "react";
import { Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View, type ModalProps, type StyleProp, type ViewStyle } from "react-native";

/**
 * Screens shown inside a frame instead of the window: the admin panel's phone preview. There a
 * screen's modals stay inside the frame and its links are handed to the frame, which opens what it
 * can show (the dossier) in place and ignores the rest, so the panel is never left.
 */
export interface Frame {
  open: (href: Href) => void;
  /** Back from a screen the frame opened. */
  back: () => void;
  /** The frame's screen, in place of the window's. */
  width: number;
  height: number;
  /** In the panel's editor: the page's parts are picked to be edited instead of used. */
  edit?: FrameEditing;
}

/**
 * The panel's editor, for screens in its phone. Every piece of the asset's page that comes from
 * the record is marked with the field it shows: "name", "subtitle", "section:<id>:title",
 * "fact:<key>"… A field names one thing; the part before a ":" names the list it is in.
 */
export interface FrameEditing {
  /** "field" for the field being edited, "step" for the rest of its question, else null. */
  state: (field: string) => "field" | "step" | null;
  pick: (field: string) => void;
  /** Set when a field is picked outside the frame, so the frame scrolls it into view. */
  /** Soft: only as far as needed to bring it into view, as while typing. */
  focus: { field: string; n: number; soft?: boolean } | null;
  /** Empty parts show where they would go. */
  samples: boolean;
}

/** Whether a field is the one named, or inside it: "section:a:title" is in "section:a" and in "section". */
export const fieldIn = (field: string, target: string) => field === target || field.startsWith(`${target}:`);

export const InFrame = createContext<Frame | null>(null);

export const useInFrame = () => useContext(InFrame);

/** The window's size, or the frame's when inside one. */
export function useFrameDimensions(): { width: number; height: number } {
  const window = useWindowDimensions();
  const frame = useInFrame();
  return frame ? { width: frame.width, height: frame.height } : window;
}

/** A full-screen modal; inside a frame, an overlay that covers only the frame. */
export function FrameModal({ visible, children, ...props }: ModalProps & { children: ReactNode }) {
  const frame = useInFrame();
  if (!frame) {
    return (
      <Modal visible={visible} {...props}>
        {children}
      </Modal>
    );
  }
  if (!visible) return null;
  return <View style={styles.overlay}>{children}</View>;
}

/** `<Link asChild>`; inside a frame, the child's press goes to the frame instead. */
export function FrameLink({ href, children }: { href: Href; children: ReactElement<{ onPress?: () => void }> }) {
  const frame = useInFrame();
  if (!frame) {
    return (
      <Link href={href} asChild>
        {children}
      </Link>
    );
  }
  return cloneElement(children, { onPress: () => frame.open(href) });
}

export const useFrameEditing = () => useContext(InFrame)?.edit ?? null;

/** The id of the frame's screen on the web: scrolling to a part stops there, so the page around it stays put. */
export const FRAME_ROOT_ID = "in-frame-root";

/** Scrolls a box to a place over a quarter second; `scrollTo`'s own smooth scrolling does not run in every scroll view. */
function glide(box: HTMLElement, to: number) {
  const from = box.scrollTop;
  const end = Math.max(0, Math.min(to, box.scrollHeight - box.clientHeight));
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / 250);
    box.scrollTop = from + (end - from) * (1 - (1 - t) ** 3);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * Scrolls each scroll view between a part and the frame's screen so the part shows: centred, or
 * soft, only as far as it takes. Unlike `scrollIntoView` it leaves the page outside the frame alone,
 * and it measures through the frame's scaling.
 */
/** Brings a node into the middle of the scroll views around it, leaving the window as it is. */
export const revealNode = (node: HTMLElement) => reveal(node, false);

function reveal(node: HTMLElement, soft: boolean) {
  let target: HTMLElement = node;
  for (let box = node.parentElement; box && box.id !== FRAME_ROOT_ID; box = box.parentElement) {
    const overflow = getComputedStyle(box).overflowY;
    if (!/(auto|scroll)/.test(overflow) || box.scrollHeight <= box.clientHeight) continue;
    const outer = box.getBoundingClientRect();
    const scale = outer.height / box.clientHeight || 1;
    const inner = target.getBoundingClientRect();
    const top = (inner.top - outer.top) / scale;
    const height = inner.height / scale;
    const fits = top >= 0 && top + height <= box.clientHeight;
    if (!(soft && fits)) {
      const by = soft ? (top < 0 ? top - 16 : top + height - box.clientHeight + 16) : top - Math.max(0, (box.clientHeight - height) / 2);
      glide(box, box.scrollTop + by);
    }
    target = box;
  }
}

/**
 * A piece of the page the panel's editor can pick: outlined on hover with what it is, gold while
 * its question is open, and a press opens its question instead of doing what it does in the app.
 * Anywhere else, just its children.
 */
export function Editable({ field, label, children, style }: { field: string; label: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const edit = useFrameEditing();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const focus = edit?.focus;
  useEffect(() => {
    if (!focus || !(fieldIn(field, focus.field) || fieldIn(focus.field, field)) || Platform.OS !== "web") return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node) return;
    // Of all the pieces in what is asked for (a list, say), only the first scrolls; failing a piece
    // that is it or inside it, the first that holds it (one tip of the tips, say).
    const pieces = [...document.querySelectorAll<HTMLElement>("[data-edit-field]")];
    const first = pieces.find((el) => fieldIn(el.dataset.editField ?? "", focus.field)) ?? pieces.find((el) => fieldIn(focus.field, el.dataset.editField ?? ""));
    if (first === node) reveal(node, focus.soft ?? false);
  }, [focus, field]);
  if (!edit) return <>{children}</>;
  const state = edit.state(field);
  return (
    // `dataSet` becomes data-edit-field on the web; React Native's types do not know it.
    <View ref={ref} style={style} {...({ dataSet: { editField: field } } as object)}>
      {children}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: düzenle`}
        onPress={() => edit.pick(field)}
        style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.target, state === "step" && styles.targetStep, hovered && styles.targetShown, state === "field" && styles.targetOn]}
      >
        {({ hovered }: { pressed: boolean; hovered?: boolean }) =>
          hovered || state === "field" ? (
            <View style={styles.tagRoom} pointerEvents="none">
              <View style={styles.tag}>
                <Ionicons name="create-outline" size={11} color={palette.altin950} />
                <Text colorValue={palette.altin950} style={styles.tagText} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            </View>
          ) : null
        }
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 100 },
  target: { position: "absolute", top: -6, right: -8, bottom: -6, left: -8, borderRadius: 12, borderWidth: 1.5, borderColor: "transparent", zIndex: 5 },
  targetShown: { borderColor: palette.altin200, borderStyle: "dashed", backgroundColor: "rgba(231, 194, 106, 0.08)" },
  targetStep: { borderStyle: "dashed", borderWidth: 1, borderColor: "rgba(231, 194, 106, 0.45)", backgroundColor: "transparent" },
  targetOn: { borderStyle: "solid", borderWidth: 2, borderColor: palette.altin200, backgroundColor: "rgba(231, 194, 106, 0.16)" },
  // Room for the label wider than a small piece, so it never wraps.
  tagRoom: { position: "absolute", top: -22, left: 6, width: 260 },
  tag: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: palette.altin200 },
  tagText: { fontFamily: fontFamily.sansBold, fontSize: 10.5 },
});
