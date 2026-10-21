import Ionicons from "@expo/vector-icons/Ionicons";
import { Card, radius, spacing, Text, useTheme } from "@vagabonds/ui";
import { Link, type Href } from "expo-router";
import Head from "expo-router/head";
import type { ComponentProps } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const modes: Array<{ href: Href; icon: ComponentProps<typeof Ionicons>["name"]; title: string; description: string; web: string }> = [
  {
    href: "/time-curtain",
    icon: "time-outline",
    title: "Zaman Perdesi",
    description: "Arşiv fotoğrafını vizörde hayalet gibi tut, aynı açıdan çek, sonra perdeyi kaydır.",
    web: "Web'de: arşiv ve bugünkü kare yan yana, kaydırmalı perde.",
  },
  {
    href: "/inscription",
    icon: "scan-outline",
    title: "Taşın Dili",
    description: "Kapıdaki kitabeye odaklan: hat parlar, okunuşu, meali ve vakfiye şartı belirir.",
    web: "Web'de: kitabe metni, meal ve vakfiye şartı doğrudan okunur.",
  },
];

/** Kamera: picks one of the two camera experiences (modules 1 and 2). */
export default function CameraScreen() {
  const { colors: c } = useTheme();
  const web = Platform.OS === "web";
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
    >
      <Head>
        <title>Kamera · Vagabonds</title>
      </Head>
      <Text variant="title" headingLevel={1}>
        Kamera
      </Text>
      <Text color="textSecondary">
        {web ? "Kamera deneyimleri telefonda çalışır. Burada kamerasız sürümleri açılır." : "Bir deneyim seç."}
      </Text>
      {modes.map((mode) => (
        <Link key={mode.title} href={mode.href} asChild>
          <Pressable accessibilityRole="link" accessibilityHint={web ? mode.web : undefined}>
            <Card style={styles.card}>
              <View style={[styles.icon, { backgroundColor: c.surfaceRaised }]}>
                <Ionicons name={mode.icon} size={28} color={c.primary} accessibilityElementsHidden importantForAccessibility="no" />
              </View>
              <View style={styles.flex}>
                <Text variant="heading">{mode.title}</Text>
                <Text color="textSecondary">{mode.description}</Text>
                {web && (
                  <Text variant="caption" color="textSecondary">
                    {mode.web}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color={c.textSecondary} accessibilityElementsHidden importantForAccessibility="no" />
            </Card>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: {
    flex: 1,
    gap: spacing.xxs,
  },
});
