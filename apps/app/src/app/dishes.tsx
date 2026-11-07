import Ionicons from "@expo/vector-icons/Ionicons";
import type { CityDish } from "@vagabonds/contracts";
import { fontFamily, radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { Stack, useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";
import { useRef } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCityDishes } from "@/data";
import { useMessages } from "@/i18n";
import { bottomInset } from "@/lib/bottom-inset";
import { useWideWeb, wideColumn } from "@/lib/use-wide-web";

/**
 * `/dishes?city=konya&dish=konya-etliekmek`: a city's local dishes (module 5), as the data team
 * wrote them, each with its geographical indication. Rehber's dish sources open it; the dish the
 * answer named is marked and scrolled to.
 */
export default function DishesScreen() {
  const m = useMessages();
  const w = m.dishes;
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWideWeb();
  const { city, dish } = useLocalSearchParams<{ city?: string; dish?: string }>();
  const dishes = useCityDishes(city ?? null);
  const scroll = useRef<ScrollViewInstance>(null);
  const scrolled = useRef(false);
  const data = dishes.status === "success" ? dishes.data : null;
  const title = data ? w.title(data.city.label) : m.screens.foodStops;

  return (
    <ScrollView
      ref={scroll}
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.content, wide && wideColumn, { paddingBottom: bottomInset(insets.bottom) + spacing.xl }]}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen options={{ title }} />
      <Head>
        <title>{m.common.title(title)}</title>
      </Head>

      {dishes.status === "loading" && <ActivityIndicator color={c.textSecondary} accessibilityLabel={w.loading} style={styles.state} />}
      {dishes.status === "error" && (
        <View style={styles.state}>
          <Text color="textSecondary">{dishes.error.message}</Text>
          <Pressable accessibilityRole="button" onPress={dishes.retry} style={styles.retry}>
            <Text variant="label" color="primary">
              {w.retry}
            </Text>
          </Pressable>
        </View>
      )}
      {dishes.status === "success" && (data === null || data.dishes.length === 0) && (
        <Text color="textSecondary" style={styles.state}>
          {data === null ? w.noCity : w.none}
        </Text>
      )}

      {data && data.dishes.length > 0 && (
        <>
          <Text color="textSecondary">{w.intro(data.city.label, data.dishes.length)}</Text>
          {data.dishes.map((item) => (
            <View
              key={item.id}
              onLayout={(event) => {
                // Once, to the dish the answer named.
                if (item.id !== dish || scrolled.current) return;
                scrolled.current = true;
                scroll.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - spacing.lg), animated: false });
              }}
            >
              <DishCard dish={item} named={item.id === dish} />
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function DishCard({ dish, named }: { dish: CityDish; named: boolean }) {
  const w = useMessages().dishes;
  const { colors: c } = useTheme();
  const gi = dish.geographicalIndication;
  return (
    <View
      style={[styles.card, { backgroundColor: c.surface, borderColor: named ? c.highlightMark : c.border }, named && styles.named]}
    >
      {named && (
        <View style={styles.namedRow}>
          <Ionicons name="sparkles" size={14} color={c.highlightMark} aria-hidden />
          <Text variant="caption" color="highlight" style={styles.namedText}>
            {w.named}
          </Text>
        </View>
      )}
      <Text variant="heading" headingLevel={2}>
        {dish.name}
      </Text>
      <Text variant="caption" color="textSecondary">
        {dish.district ? `${dish.kind.label} · ${dish.district}` : dish.kind.label}
      </Text>
      <Text>{dish.description}</Text>
      {dish.story && (
        <Text color="textSecondary" style={styles.story}>
          {dish.story}
        </Text>
      )}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={w.giLabel(gi.type.label, gi.registrationNumber, gi.registrant)}
        onPress={() => void Linking.openURL(gi.portalUrl)}
        style={({ pressed }) => [styles.gi, { borderTopColor: c.border }, pressed && styles.pressed]}
      >
        <Ionicons name="ribbon-outline" size={16} color={c.highlightMark} aria-hidden />
        <Text variant="caption" color="textSecondary" style={styles.giText}>
          {w.gi(gi.type.label, gi.registrationNumber, gi.registrant)}
        </Text>
        <Ionicons name="open-outline" size={14} color={c.textSecondary} aria-hidden />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  state: {
    marginTop: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  retry: {
    minHeight: touchTarget.min,
    justifyContent: "center",
  },
  card: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  named: {
    borderWidth: 2,
  },
  namedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  namedText: {
    fontFamily: fontFamily.sansSemiBold,
  },
  story: {
    marginTop: spacing.xs,
  },
  gi: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: touchTarget.min,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  giText: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
