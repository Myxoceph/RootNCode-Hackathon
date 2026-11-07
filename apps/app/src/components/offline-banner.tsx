import Ionicons from "@expo/vector-icons/Ionicons";
import { spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { useEffect, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";

import { refreshData, useOfflineSince } from "@/data";
import { announce } from "@/lib/announce";
import { useMessages } from "@/i18n";

function clock(time: number): string {
  const date = new Date(time);
  const sameDay = date.toDateString() === new Date().toDateString();
  const hm = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return sameDay ? hm : `${date.getDate()}.${date.getMonth() + 1} ${hm}`;
}

/**
 * A strip above every screen while they show stored answers (data/cached-source.ts):
 * since when, and a refresh. The screens below get the top inset as zero, so they
 * do not leave room for the notch twice.
 */
export function OfflineBanner({ children }: { children: ReactNode }) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const since = useOfflineSince();
  const w = useMessages().shared;
  const text = since === null ? null : w.offline(clock(since));

  useEffect(() => {
    if (text) announce(text);
  }, [text]);

  // The tree keeps its shape whether the strip shows or not: a changed shape would remount
  // the navigator below and throw the visitor off the screen they are on.
  return (
    <View style={styles.fill}>
      {text && (
        <View
          style={[styles.banner, { paddingTop: insets.top + spacing.xs, backgroundColor: c.surfaceRaised, borderBottomColor: c.border }]}
          accessibilityRole="alert"
        >
          <Ionicons name="cloud-offline-outline" size={18} color={c.text} accessibilityElementsHidden importantForAccessibility="no" />
          <Text variant="caption" style={styles.fill}>
            {text}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={w.refreshData} onPress={refreshData} style={styles.refresh}>
            <Text variant="label" color="primary">
              {w.refresh}
            </Text>
          </Pressable>
        </View>
      )}
      <SafeAreaInsetsContext.Provider value={text ? { ...insets, top: 0 } : insets}>
        <View style={styles.fill}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  refresh: {
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
  },
});
