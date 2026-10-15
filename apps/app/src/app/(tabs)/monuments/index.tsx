import { spacing, typography } from "@vagabonds/ui";
import Head from "expo-router/head";
import { FlatList, StyleSheet, Text } from "react-native";

import { MonumentCard } from "@/components/monument-card";
import { ResourceView } from "@/components/resource-view";
import { useMonuments } from "@/data";
import { useColors } from "@/theme";

export default function MonumentsScreen() {
  const c = useColors();
  const monuments = useMonuments();

  return (
    <>
      <Head>
        <title>Eserler · Vagabonds</title>
      </Head>
      <ResourceView resource={monuments}>
        {(data) => (
          <FlatList
            data={data}
            keyExtractor={(m) => m.id}
            style={{ backgroundColor: c.background }}
            contentContainerStyle={styles.list}
            contentInsetAdjustmentBehavior="automatic"
            ListHeaderComponent={
              <Text style={[typography.body, { color: c.textSecondary }]}>{data.length} eser</Text>
            }
            ListEmptyComponent={
              <Text style={[typography.body, { color: c.textSecondary }]}>Henüz gösterilecek eser yok.</Text>
            }
            renderItem={({ item }) => <MonumentCard monument={item} />}
          />
        )}
      </ResourceView>
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
});
