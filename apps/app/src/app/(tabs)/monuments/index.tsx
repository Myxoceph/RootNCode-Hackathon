import { spacing, typography } from "@vagabonds/ui";
import Head from "expo-router/head";
import { FlatList, StyleSheet, Text } from "react-native";

import { ResourceView } from "@/components/resource-view";
import { useMonuments } from "@/data";
import { useColors } from "@/theme";

/** Eserler: the monument list. Cards and the detail screen come with Y4. */
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
            renderItem={({ item }) => (
              <Text style={[typography.bodyLarge, { color: c.text }]}>
                {item.name} · {item.city}
              </Text>
            )}
          />
        )}
      </ResourceView>
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.xl,
    gap: spacing.md,
  },
});
