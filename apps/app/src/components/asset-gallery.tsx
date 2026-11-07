import Ionicons from "@expo/vector-icons/Ionicons";
import type { Media } from "@vagabonds/contracts";
import { cameraColors, spacing, Text, touchTarget } from "@vagabonds/ui";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AssetImage } from "@/components/asset-image";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { FrameModal, useFrameDimensions } from "@/lib/in-frame";
import { useMessages } from "@/i18n";

/**
 * Every photo and drawing of an asset, full screen: swiped sideways, or stepped with the previous and
 * next buttons for switch access. Android's back button and Escape close it.
 */
export function AssetGallery({ photos, visible, onClose }: { photos: Media[]; visible: boolean; onClose: () => void }) {
  const reduceMotion = useReducedMotion();
  return (
    <FrameModal visible={visible} animationType={reduceMotion ? "none" : "fade"} presentationStyle="fullScreen" onRequestClose={onClose}>
      {visible && <Viewer photos={photos} onClose={onClose} />}
    </FrameModal>
  );
}

function Viewer({ photos, onClose }: { photos: Media[]; onClose: () => void }) {
  const w = useMessages().shared.gallery;
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { width } = useFrameDimensions();
  const scroll = useRef<ScrollViewInstance>(null);
  const [index, setIndex] = useState(0);
  const photo = photos[index];

  const go = (to: number) => {
    if (to < 0 || to >= photos.length) return;
    setIndex(to);
    scroll.current?.scrollTo({ x: to * width, animated: !reduceMotion });
  };
  const step = useRef((by: number) => go(index + by));
  step.current = (by) => go(index + by);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") step.current(-1);
      if (event.key === "ArrowRight") step.current(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const credit = photo ? [...new Set([photo.credit, photo.photographer])].filter(Boolean).join(" · ") : "";

  return (
    <View style={styles.screen}>
      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <Text
          variant="label"
          colorValue={cameraColors.text}
          style={styles.flex}
          accessibilityLabel={w.photoOf(index + 1, photos.length)}
          accessibilityLiveRegion="polite"
        >
          {`${index + 1}/${photos.length}`}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={w.close} hitSlop={6} onPress={onClose} style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
          <Ionicons name="close" size={22} color={cameraColors.text} />
        </Pressable>
      </View>

      <ScrollView
        ref={scroll}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={(event) => {
          const at = Math.round(event.nativeEvent.contentOffset.x / width);
          if (at !== index && at >= 0 && at < photos.length) setIndex(at);
        }}
        style={styles.flex}
      >
        {photos.map((media, at) => (
          <View key={media.key} style={[styles.page, { width }]}>
            {/* Only this photo and its neighbours load: an asset can have dozens. */}
            {Math.abs(at - index) <= 1 && <AssetImage media={media} fill fit="contain" decorative={at !== index} style={styles.clear} />}
          </View>
        ))}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.words}>
          {photo?.caption && (
            <Text colorValue={cameraColors.text} numberOfLines={3}>
              {photo.caption}
            </Text>
          )}
          {credit !== "" && (
            <Text variant="caption" colorValue={cameraColors.textSecondary} numberOfLines={2}>
              {credit}
            </Text>
          )}
        </View>
        <View style={styles.steps}>
          <Step icon="chevron-back" label={w.previous} disabled={index === 0} onPress={() => go(index - 1)} />
          <Step icon="chevron-forward" label={w.next} disabled={index === photos.length - 1} onPress={() => go(index + 1)} />
        </View>
      </View>
    </View>
  );
}

function Step({ icon, label, disabled, onPress }: { icon: "chevron-back" | "chevron-forward"; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.round, disabled && styles.off, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={22} color={cameraColors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: cameraColors.background,
  },
  flex: {
    flex: 1,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  page: {
    height: "100%",
  },
  clear: {
    backgroundColor: "transparent",
  },
  bottom: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    minHeight: 96,
  },
  words: {
    flex: 1,
    gap: spacing.xxs,
  },
  steps: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  round: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  off: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.7,
  },
});
