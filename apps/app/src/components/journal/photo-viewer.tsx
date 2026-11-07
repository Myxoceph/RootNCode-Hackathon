import Ionicons from "@expo/vector-icons/Ionicons";
import type { JournalPhoto } from "@vagabonds/contracts";
import { spacing, touchTarget } from "@vagabonds/ui";
import { Image } from "expo-image";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { journalImageUri } from "@/data/journal";
import { useMessages } from "@/i18n";

/** A photo opened from its page: only here does the big size load. It stays off the device's disk. */
export function PhotoViewer({ photo, label, onClose }: { photo: JournalPhoto | null; label: string; onClose: () => void }) {
  const w = useMessages();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={photo !== null} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.page} accessibilityViewIsModal>
        {photo && (
          <Image
            source={{ uri: journalImageUri(photo.fullUrl), cacheKey: `journal-${photo.id}-full` }}
            placeholder={{ uri: journalImageUri(photo.thumbUrl), cacheKey: `journal-${photo.id}-thumb` }}
            placeholderContentFit="contain"
            cachePolicy="memory"
            contentFit="contain"
            transition={120}
            style={styles.image}
            accessibilityLabel={label}
          />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={w.common.close}
          onPress={onClose}
          style={[styles.close, { top: insets.top + spacing.sm }]}
        >
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#0C0908",
  },
  image: {
    flex: 1,
  },
  close: {
    position: "absolute",
    right: spacing.md,
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: touchTarget.min / 2,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
});
