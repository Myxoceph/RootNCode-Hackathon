import { Button, fontFamily, radius, spacing, Text, useTheme } from "@vagabonds/ui";
import Head from "expo-router/head";
import { ScrollView, StyleSheet, View } from "react-native";

import { bursaDishes, type Dish } from "@/content/food";
import { toggleDish, useAddedDishes } from "@/lib/route-plan";

/**
 * Lezzet Durakları (module 5): food near each monument's exit, with one line
 * on how the waqf and the bazaar shaped it. Added dishes join the route.
 */
export default function FoodScreen() {
  const { colors: c } = useTheme();
  const added = useAddedDishes();

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
      <Head>
        <title>Lezzet Durakları · Vagabonds</title>
      </Head>
      <Text color="textSecondary">Bursa · rotanın mola noktaları</Text>
      {bursaDishes.map((dish) => (
        <DishCard key={dish.id} dish={dish} added={added.includes(dish.id)} />
      ))}
    </ScrollView>
  );
}

function DishCard({ dish, added }: { dish: Dish; added: boolean }) {
  const { colors: c } = useTheme();
  const accent = c[dish.color];

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      {/* The band echoes an İznik tile pattern in the dish's own color. */}
      <View style={[styles.band, { backgroundColor: c.surfaceRaised }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.dots}>
          {Array.from({ length: 40 }, (_, i) => (
            <View key={i} style={[styles.tileDot, { backgroundColor: accent }]} />
          ))}
        </View>
        <View style={[styles.stamp, { backgroundColor: c.surface, borderColor: accent }]}>
          <Text variant="heading" colorValue={accent}>
            {dish.name[0]}
          </Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text variant="heading" accessibilityRole="header">
          {dish.name}
        </Text>
        <Text variant="caption" color="textSecondary" style={styles.mono}>
          {dish.where}
        </Text>
        <Text>{dish.description}</Text>
        <View style={[styles.context, { borderTopColor: c.border }]}>
          <Text variant="caption" color="textSecondary">
            {dish.context}
          </Text>
        </View>
        <Button
          label={added ? "Rotada ✓" : "Rotaya ekle"}
          accessibilityLabel={`${dish.name}: rotaya ekle`}
          variant="ghost"
          selected={added}
          onPress={() => toggleDish(dish.id)}
          style={styles.button}
        />
      </View>
    </View>
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
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  band: {
    height: 58,
    overflow: "visible",
  },
  dots: {
    flexDirection: "row",
    gap: 14,
    padding: 8,
    height: 58,
    overflow: "hidden",
    opacity: 0.6,
  },
  tileDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stamp: {
    position: "absolute",
    left: spacing.lg,
    bottom: -22,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: spacing.lg,
    paddingTop: spacing.xxl,
    gap: spacing.xs,
  },
  mono: {
    fontFamily: fontFamily.mono,
  },
  context: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  button: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
  },
});
