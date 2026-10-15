import { spacing, typography } from "@vagabonds/ui";
import Head from "expo-router/head";
import type { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";

import { useColors } from "@/theme";

interface ScreenPlaceholderProps {
  title: string;
  description: string;
}

/** Stand-in body for screens whose content lands in a later task. */
export function ScreenPlaceholder({ title, description, children }: PropsWithChildren<ScreenPlaceholderProps>) {
  const c = useColors();
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      {/* Rendered into the static web HTML, so every URL has a page title (WCAG 2.4.2). */}
      <Head>
        <title>{`${title} · Vagabonds`}</title>
      </Head>
      <Text accessibilityRole="header" style={[typography.title, { color: c.text }]}>
        {title}
      </Text>
      <Text style={[typography.body, { color: c.textSecondary }]}>{description}</Text>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
    gap: spacing.md,
  },
});
