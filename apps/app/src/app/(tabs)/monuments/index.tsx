import { Button, spacing, Text, useTheme } from "@vagabonds/ui";
import { router, useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";
import { useEffect } from "react";
import { AccessibilityInfo, ActivityIndicator, FlatList, Platform, StyleSheet, View } from "react-native";

import { AssetCard } from "@/components/asset-card";
import { CityPicker } from "@/components/city-picker";
import { ResourceView } from "@/components/resource-view";
import { useAssetList, useCities, type AssetListPage } from "@/data";

/** Content column width; on a wide screen the cards stay readable instead of stretching. */
const MAX_CONTENT_WIDTH = 720;

export default function MonumentsScreen() {
  const { colors: c } = useTheme();
  // The city lives in the URL (/monuments?city=bursa), so a filtered list can be shared.
  const { city } = useLocalSearchParams<{ city?: string }>();
  const cities = useCities();
  const list = useAssetList(city);
  const cityLabel = cities.status === "success" ? cities.data.find((x) => x.code === city)?.label : undefined;

  // A status message (WCAG 4.1.3): read out when the list loads or the city changes.
  // Android and the web read the live region below; iOS needs an explicit announcement.
  const status =
    list.status === "loading"
      ? "Eserler yükleniyor"
      : list.status === "success"
        ? `${cityLabel ? `${cityLabel}: ` : ""}${list.data.total} eser`
        : "";
  useEffect(() => {
    if (Platform.OS === "ios" && status !== "") AccessibilityInfo.announceForAccessibility(status);
  }, [status]);

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
      <View style={styles.column}>
        <Text color="textSecondary" accessibilityLiveRegion="polite" style={styles.status}>
          {status}
        </Text>
      </View>
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
            ListEmptyComponent={<Text color="textSecondary">Henüz gösterilecek eser yok.</Text>}
            ListFooterComponent={<ListFooter page={page} />}
            renderItem={({ item }) => <AssetCard asset={item} />}
          />
        )}
      </ResourceView>
    </View>
  );
}

function ListFooter({ page }: { page: AssetListPage }) {
  const { colors: c } = useTheme();

  if (page.loadingMore) {
    return <ActivityIndicator color={c.primary} accessibilityLabel="Daha fazla eser yükleniyor" style={styles.footer} />;
  }
  if (page.moreError) {
    return (
      <View style={[styles.footer, styles.footerError]} accessibilityRole="alert">
        <Text color="textSecondary">{page.moreError.message}</Text>
        <Button label="Daha fazla yükle" variant="ghost" onPress={page.loadMore} />
      </View>
    );
  }
  if (page.items.length > 0 && page.items.length >= page.total) {
    return (
      <Text variant="caption" color="textSecondary" style={[styles.footer, styles.centerText]}>
        Tüm eserler gösterildi.
      </Text>
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
  status: {
    paddingHorizontal: spacing.lg,
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
  },
  footerError: {
    alignItems: "center",
    gap: spacing.md,
  },
  centerText: {
    textAlign: "center",
  },
});
