import { radius, spacing, touchTarget, typography } from "@vagabonds/ui";
import { router, useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { AssetCard } from "@/components/asset-card";
import { CityPicker } from "@/components/city-picker";
import { ResourceView } from "@/components/resource-view";
import { useAssetList, useCities, type AssetListPage } from "@/data";
import { useColors } from "@/theme";

/** Content column width; on a wide screen the cards stay readable instead of stretching. */
const MAX_CONTENT_WIDTH = 720;

export default function MonumentsScreen() {
  const c = useColors();
  // The city lives in the URL (/monuments?city=bursa), so a filtered list can be shared.
  const { city } = useLocalSearchParams<{ city?: string }>();
  const cities = useCities();
  const list = useAssetList(city);
  const cityLabel = cities.status === "success" ? cities.data.find((x) => x.code === city)?.label : undefined;

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <Head>
        <title>{cityLabel ? `${cityLabel} eserleri · Vagabonds` : "Eserler · Vagabonds"}</title>
      </Head>
      {/* Without the city list the picker is left out; the asset list still works. */}
      {cities.status === "success" && cities.data.length > 1 && (
        <View style={styles.column}>
          <CityPicker cities={cities.data} selected={city} onSelect={(code) => router.setParams({ city: code })} />
        </View>
      )}
      <ResourceView resource={list}>
        {(page) => (
          <FlatList
            data={page.items}
            keyExtractor={(a) => a.id}
            style={{ backgroundColor: c.background }}
            contentContainerStyle={styles.list}
            contentInsetAdjustmentBehavior="automatic"
            onEndReached={page.loadMore}
            onEndReachedThreshold={0.5}
            ListHeaderComponent={
              <Text style={[typography.body, { color: c.textSecondary }]}>{page.total} eser</Text>
            }
            ListEmptyComponent={
              <Text style={[typography.body, { color: c.textSecondary }]}>Henüz gösterilecek eser yok.</Text>
            }
            ListFooterComponent={<ListFooter page={page} />}
            renderItem={({ item }) => <AssetCard asset={item} />}
          />
        )}
      </ResourceView>
    </View>
  );
}

function ListFooter({ page }: { page: AssetListPage }) {
  const c = useColors();

  if (page.loadingMore) {
    return <ActivityIndicator color={c.primary} accessibilityLabel="Daha fazla eser yükleniyor" style={styles.footer} />;
  }
  if (page.moreError) {
    return (
      <View style={[styles.footer, styles.footerError]} accessibilityRole="alert">
        <Text style={[typography.body, { color: c.textSecondary }]}>{page.moreError.message}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={page.loadMore}
          style={[styles.button, { borderColor: c.primary }]}
        >
          <Text style={[typography.label, { color: c.primary }]}>Daha fazla yükle</Text>
        </Pressable>
      </View>
    );
  }
  if (page.items.length > 0 && page.items.length >= page.total) {
    return (
      <Text style={[typography.caption, styles.footer, { color: c.textSecondary }]}>Tüm eserler gösterildi.</Text>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  column: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
  },
  list: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  footer: {
    paddingVertical: spacing.xl,
    textAlign: "center",
  },
  footerError: {
    alignItems: "center",
    gap: spacing.md,
  },
  button: {
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
