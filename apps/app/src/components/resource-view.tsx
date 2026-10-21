import { Button, spacing, Text } from "@vagabonds/ui";
import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import type { DataError, ResourceWithRetry } from "@/data";
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
  const title = error.kind === "invalid" ? "Veriler okunamadı" : "Veriler yüklenemedi";

  return (
    <View style={styles.center} accessibilityRole="alert">
      <Text variant="heading" headingLevel={1}>
        {title}
      </Text>
      <Text color="textSecondary" style={styles.centerText}>
        {error.message}
      </Text>
      {__DEV__ && error.details.length > 0 && (
        <Text variant="caption" color="textSecondary">
          {error.details.slice(0, 5).join("\n")}
          {error.details.length > 5 ? `\n… ve ${error.details.length - 5} sorun daha` : ""}
        </Text>
      )}
      <Button label="Tekrar dene" onPress={onRetry} />
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
});
