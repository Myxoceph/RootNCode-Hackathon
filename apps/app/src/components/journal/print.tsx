import Ionicons from "@expo/vector-icons/Ionicons";
import type { JournalPhoto } from "@vagabonds/contracts";
import { spacing, Text, touchTarget } from "@vagabonds/ui";
import { Image } from "expo-image";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { journalImageUri } from "@/data/journal";
import { useMessages } from "@/i18n";
import { dropJournalPhoto, retryJournalPhoto, type PendingPhoto } from "@/lib/journal";
import { PRINT_BORDER, printTilt } from "@/lib/journal-layout";

import { book } from "./paper";

const FRAME = PRINT_BORDER;
const TALLEST = 1.25;
const WIDEST = 1.6;

/** Kept clear at the page's right edge, so a tilted print never reaches it. */
export const PRINT_SIDE_ROOM = spacing.xl;
/** Share of the page's height one photo may take: the text under it stays in sight. */
const SINGLE_SHARE = 0.56;

/**
 * How the prints of a page sit: one at its own shape, within reason and the room there is; more share
 * rows of two. Worked out from the sizes alone, with no photo loaded, so a page never jumps, and
 * rounded up to whole lines, so the text below stays on the page's lines.
 */
export function printLayout(count: number, aspect: number, width: number, pageHeight: number, line: number) {
  const gap = spacing.md;
  if (count === 0) return { itemWidth: 0, imageHeight: 0, height: 0 };
  if (count === 1) {
    const shape = Math.min(WIDEST, Math.max(1 / TALLEST, aspect));
    const roomWidth = width - FRAME * 2;
    const imageHeight = Math.round(Math.min(roomWidth / shape, pageHeight * SINGLE_SHARE));
    const itemWidth = Math.round(imageHeight * shape) + FRAME * 2;
    return { itemWidth, imageHeight, height: Math.ceil((imageHeight + FRAME * 2 + gap * 2) / line) * line };
  }
  const itemWidth = Math.floor((width - gap) / 2);
  const imageHeight = itemWidth - FRAME * 2;
  const rows = Math.ceil(count / 2);
  return { itemWidth, imageHeight, height: Math.ceil((rows * (imageHeight + FRAME * 2 + gap) + gap) / line) * line };
}

/** The white print and its tape. `tilt` 0 for one whose turn is set from outside. */
export function PrintFrame({ id, width, tilt, children }: { id: string; width: number; tilt?: number; children: React.ReactNode }) {
  return (
    <View style={[styles.print, { width, transform: [{ rotate: `${tilt ?? printTilt(id)}deg` }] }]}>
      <View aria-hidden style={[styles.tape, { width: Math.min(58, width * 0.4) }]} />
      {children}
    </View>
  );
}

/** A print on the page: the small size, the tiny picture until it comes, and a tap to open the big one. */
export function PhotoPrint({ photo, width, imageHeight, label, tilt, onOpen }: { photo: JournalPhoto; width: number; imageHeight: number; label: string; tilt?: number; onOpen: () => void }) {
  return (
    <PrintFrame id={photo.id} width={width} {...(tilt === undefined ? {} : { tilt })}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onOpen}>
        <Image
          // The signature in the path changes by the hour; the photo does not.
          source={{ uri: journalImageUri(photo.thumbUrl), cacheKey: `journal-${photo.id}-thumb` }}
          placeholder={{ uri: photo.lqip }}
          recyclingKey={photo.id}
          cachePolicy="memory-disk"
          contentFit="cover"
          // The browser's own drag of an image would stop a page being turned from it.
          draggable={false}
          transition={120}
          style={{ height: imageHeight, backgroundColor: photo.dominantColor }}
        />
      </Pressable>
    </PrintFrame>
  );
}

/** A print on its way: shown from the device, with how it is going. */
export function PendingPrint({ photo, width, imageHeight, tilt }: { photo: PendingPhoto; width: number; imageHeight: number; tilt?: number }) {
  const w = useMessages().journal;
  const failed = photo.status === "failed";
  return (
    <PrintFrame id={photo.id} width={width} {...(tilt === undefined ? {} : { tilt })}>
      <Image source={{ uri: photo.uri }} recyclingKey={photo.id} cachePolicy="none" contentFit="cover" draggable={false} style={{ height: imageHeight }} accessibilityLabel={w.photoSending} />
      <View style={styles.veil}>
        {failed ? (
          <>
            <Text variant="caption" colorValue="#FFFFFF" style={styles.veilText} accessibilityRole="alert">
              {photo.error}
            </Text>
            <View style={styles.veilActions}>
              <Pressable accessibilityRole="button" accessibilityLabel={w.photoRetry} onPress={() => retryJournalPhoto(photo.id)} style={styles.veilButton}>
                <Ionicons name="refresh" size={22} color="#FFFFFF" />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={w.photoDrop} onPress={() => dropJournalPhoto(photo.id)} style={styles.veilButton}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </Pressable>
            </View>
          </>
        ) : (
          <ActivityIndicator color="#FFFFFF" accessibilityLabel={w.photoSending} />
        )}
      </View>
    </PrintFrame>
  );
}

const styles = StyleSheet.create({
  print: {
    padding: FRAME,
    backgroundColor: book.print,
    boxShadow: "0px 2px 6px rgba(52, 23, 32, 0.28)",
  },
  tape: {
    position: "absolute",
    zIndex: 1,
    top: -9,
    alignSelf: "center",
    height: 20,
    backgroundColor: book.tape,
    transform: [{ rotate: "-3deg" }],
  },
  veil: {
    position: "absolute",
    top: FRAME,
    right: FRAME,
    bottom: FRAME,
    left: FRAME,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.xs,
    backgroundColor: "rgba(20, 12, 10, 0.62)",
  },
  veilText: {
    textAlign: "center",
  },
  veilActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  veilButton: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
  },
});
