import { Button, spacing, Text } from "@vagabonds/ui";
import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import type { DataError, ResourceWithRetry } from "@/data";
import { announce } from "@/lib/announce";
import { useColors } from "@/theme";
import { useMessages } from "@/i18n";

interface ResourceViewProps<T> {
  resource: ResourceWithRetry<T>;
  children: (data: T) => ReactNode;
}

/** Renders the loading and error states of a data hook, and `children` once the data is in. */
export function ResourceView<T>({ resource, children }: ResourceViewProps<T>) {
  const c = useColors();
  const m = useMessages();

  if (resource.status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.primary} size="large" accessibilityLabel={m.common.loading} />
      </View>
    );
  }
  if (resource.status === "error") {
    return <DataErrorView error={resource.error} onRetry={resource.retry} />;
  }
  return <>{children(resource.data)}</>;
}

export function DataErrorView({ error, onRetry }: { error: DataError; onRetry: () => void }) {
  const m = useMessages();
  const title = error.kind === "invalid" ? m.monuments.unreadable : m.monuments.unavailable;

  // The screen changes under the reader's finger; say what happened (web: role="alert" below).
  useEffect(() => announce(`${title}. ${error.message}`), [title, error.message]);

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
          {error.details.length > 5 ? m.shared.moreIssues(error.details.length - 5) : ""}
        </Text>
      )}
      <Button label={m.common.retry} onPress={onRetry} />
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
