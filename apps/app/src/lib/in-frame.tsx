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

/** The parts of an asset's page the panel's editor edits one at a time. */
export type EditPart =
  | "identity"
  | "place"
  | "media"
  | "summary"
  | "built"
  | "facts"
  | "highlights"
  | "sections"
  | "timeline"
  | "legends"
  | "inscriptions"
  | "people"
  | "waqf"
  | "visit"
  | "access"
  | "tips";

export interface FrameEditing {
  selected: EditPart | null;
  pick: (part: EditPart) => void;
  label: (part: EditPart) => string;
  /** Set when a part is picked outside the frame, so the frame scrolls it into view. */
  focus: { part: EditPart; n: number } | null;
  /** Empty parts show where they would go. */
  samples: boolean;
}

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

/**
 * A part of the page the panel's editor can pick: outlined on hover, gold while it is being edited,
 * and a press picks it instead of doing what it does in the app. Anywhere else, just its children.
 */
export function Editable({ part, children, style }: { part: EditPart; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const edit = useFrameEditing();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const focus = edit?.focus;
  useEffect(() => {
    if (!focus || focus.part !== part || Platform.OS !== "web") return;
    const node = ref.current as unknown as HTMLElement | null;
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focus, part]);
  if (!edit) return <>{children}</>;
  const on = edit.selected === part;
  return (
    <View ref={ref} style={style}>
      {children}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${edit.label(part)}: düzenle`}
        onPress={() => edit.pick(part)}
        style={({ hovered }: { hovered?: boolean }) => [styles.target, (hovered || on) && styles.targetShown, on && styles.targetOn]}
      >
        {({ hovered }: { hovered?: boolean }) =>
          hovered || on ? (
            <View style={styles.tag}>
              <Ionicons name="create-outline" size={11} color={palette.altin950} />
              <Text colorValue={palette.altin950} style={styles.tagText}>
                {edit.label(part)}
              </Text>
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
  targetOn: { borderStyle: "solid", borderWidth: 2, backgroundColor: "rgba(231, 194, 106, 0.14)" },
  tag: { position: "absolute", top: -22, left: 6, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: palette.altin200 },
  tagText: { fontFamily: fontFamily.sansBold, fontSize: 10.5 },
});
