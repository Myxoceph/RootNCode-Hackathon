import { radius, spacing, touchTarget, typography } from "@vagabonds/ui";
import Head from "expo-router/head";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { AssetCard } from "@/components/asset-card";
import { ResourceView } from "@/components/resource-view";
import { useAssetList, type AssetListPage } from "@/data";
import { useColors } from "@/theme";

/** Content column width; on a wide screen the cards stay readable instead of stretching. */
const MAX_CONTENT_WIDTH = 720;

export default function MonumentsScreen() {
  const c = useColors();
  const list = useAssetList();

  return (
    <>
      <Head>
        <title>Eserler · Vagabonds</title>
      </Head>
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
    </>
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
