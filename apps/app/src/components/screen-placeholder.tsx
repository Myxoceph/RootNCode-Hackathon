import { spacing, Text, useTheme } from "@vagabonds/ui";
import Head from "expo-router/head";
import type { PropsWithChildren } from "react";
import { ScrollView, StyleSheet } from "react-native";

interface ScreenPlaceholderProps {
  title: string;
  description: string;
}

/** Stand-in body for screens whose content lands in a later task. */
export function ScreenPlaceholder({ title, description, children }: PropsWithChildren<ScreenPlaceholderProps>) {
  const { colors: c } = useTheme();
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
      <Text variant="title" headingLevel={1}>
        {title}
      </Text>
      <Text color="textSecondary">{description}</Text>
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
