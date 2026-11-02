import Ionicons from "@expo/vector-icons/Ionicons";
import { fontFamily, radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import Head from "expo-router/head";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { announce } from "@/lib/announce";
import { removeRoute, useSavedRoutes, type SavedRoute } from "@/lib/saved-routes";

const regionLabel: Record<SavedRoute["region"], string> = { bursa: "Bursa", edirne: "Edirne", both: "Bursa & Edirne" };
const durationLabel: Record<SavedRoute["duration"], string> = { half: "Yarım gün", "1": "1 gün", "2": "2 gün" };

/**
 * Profil · Rotalarım: the routes saved from the planner ("Rotayı kaydet"), newest first. A card
 * opens its route in the planner again; empty, it points to the planner.
 */
export default function MyRoutesScreen() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const routes = useSavedRoutes();

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <Head>
        <title>Rotalarım · Vagabonds</title>
      </Head>

      {routes.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: c.surface }]}>
          <View style={[styles.emptyIcon, { backgroundColor: c.surfaceRaised }]}>
            <Ionicons name="map-outline" size={26} color={c.highlightMark} />
          </View>
          <Text variant="heading" headingLevel={2} style={styles.centered}>
            Henüz kayıtlı rotan yok
          </Text>
          <Text color="textSecondary" style={styles.centered}>
            Rota planlayıcıda bir güzergâh oluştur, "Rotayı kaydet" ile buraya ekle.
          </Text>
          <NewRoute onPress={() => router.push("/route")} />
        </View>
      ) : (
        <>
          <View accessibilityRole="list" style={styles.list}>
            {routes.map((route) => (
              <View key={route.id} style={[styles.card, { backgroundColor: c.surface }]}>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`${route.title}, ${regionLabel[route.region]}, ${durationLabel[route.duration]}, ${route.stops} eser. Rotayı aç`}
                  onPress={() =>
                    router.push({ pathname: "/route", params: { region: route.region, duration: route.duration, dishes: route.dishes.join(",") } })
                  }
                  style={({ pressed }) => [styles.cardMain, pressed && styles.pressed]}
                >
                  <View style={[styles.cardIcon, { backgroundColor: c.surfaceRaised }]}>
                    <Ionicons name="git-branch" size={20} color={c.highlightMark} />
                  </View>
                  <View style={styles.flex}>
                    <Text variant="label" numberOfLines={2} style={styles.cardTitle}>
                      {route.title}
                    </Text>
                    <Text variant="caption" color="textSecondary">
                      {`${regionLabel[route.region]} · ${durationLabel[route.duration]} · ${route.stops} eser`}
                    </Text>
                    <Text variant="caption" color="textSecondary">
                      {`${new Date(route.savedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })} tarihinde kaydedildi`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={c.textSecondary} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${route.title} rotasını sil`}
                  onPress={() => {
                    void removeRoute(route.id);
                    announce("Rota silindi.");
                  }}
                  hitSlop={4}
                  style={({ pressed }) => [styles.remove, pressed && { backgroundColor: c.surfaceRaised }]}
                >
                  <Ionicons name="trash-outline" size={18} color={c.textSecondary} />
                </Pressable>
              </View>
            ))}
          </View>
          <NewRoute onPress={() => router.push("/route")} />
        </>
      )}
    </ScrollView>
  );
}

function NewRoute({ onPress }: { onPress: () => void }) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.new, { backgroundColor: c.highlightMark }, pressed && styles.pressed]}
    >
      <Ionicons name="add" size={20} color={c.onPrimary} />
      <Text variant="label" colorValue={c.onPrimary} style={styles.newText}>
        Yeni rota planla
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centered: {
    textAlign: "center",
  },
  pressed: {
    opacity: 0.8,
  },
  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    padding: spacing.lg,
    gap: spacing.lg,
  },
  list: {
    gap: spacing.md,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.xl,
    paddingRight: spacing.xs,
  },
  cardMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 16,
    marginBottom: spacing.xxs,
  },
  remove: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.xl + spacing.xs,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  new: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    alignSelf: "stretch",
    minHeight: touchTarget.min + 6,
    borderRadius: radius.full,
  },
  newText: {
    fontFamily: fontFamily.sansSemiBold,
  },
});
