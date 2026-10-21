import { radius, spacing, touchTarget, typography } from "@vagabonds/ui";
import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import type { DataError, ResourceWithRetry } from "@/data";
import { announce } from "@/lib/announce";
import { useColors } from "@/theme";

interface ResourceViewProps<T> {
  resource: ResourceWithRetry<T>;
  children: (data: T) => ReactNode;
}

/** Renders the loading and error states of a data hook, and `children` once the data is in. */
export function ResourceView<T>({ resource, children }: ResourceViewProps<T>) {
  const c = useColors();

  if (resource.status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.primary} size="large" accessibilityLabel="Yükleniyor" />
      </View>
    );
  }
  if (resource.status === "error") {
    return <DataErrorView error={resource.error} onRetry={resource.retry} />;
  }
  return <>{children(resource.data)}</>;
}

export function DataErrorView({ error, onRetry }: { error: DataError; onRetry: () => void }) {
  const c = useColors();
  const title = error.kind === "invalid" ? "Veriler okunamadı" : "Veriler yüklenemedi";

  // The screen changes under the reader's finger; say what happened (web: role="alert" below).
  useEffect(() => announce(`${title}. ${error.message}`), [title, error.message]);

  return (
    <View style={styles.center} accessibilityRole="alert">
      <Text accessibilityRole="header" style={[typography.heading, { color: c.text }]}>
        {title}
      </Text>
      <Text style={[typography.body, styles.centerText, { color: c.textSecondary }]}>{error.message}</Text>
      {__DEV__ && error.details.length > 0 && (
        <Text style={[typography.caption, { color: c.textSecondary }]}>
          {error.details.slice(0, 5).join("\n")}
          {error.details.length > 5 ? `\n… ve ${error.details.length - 5} sorun daha` : ""}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.button, { backgroundColor: c.primary }, pressed && styles.pressed]}
      >
        <Text style={[typography.label, { color: c.onPrimary }]}>Tekrar dene</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  centerText: {
    textAlign: "center",
  },
  button: {
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.8,
  },
});
