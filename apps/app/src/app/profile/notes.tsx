import { radius, spacing, useTheme } from "@vagabonds/ui";
import Head from "expo-router/head";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MyContributions } from "@/components/my-contributions";

/** Profil · Bıraktığım Notlar: the visitor's notes and their moderation, on a card of their own. */
export default function MyNotesScreen() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <Head>
        <title>Bıraktığım Notlar · Vagabonds</title>
      </Head>
      <View style={[styles.card, { backgroundColor: c.surface }]}>
        <MyContributions title={null} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    padding: spacing.lg,
  },
  card: {
    padding: spacing.lg,
    borderRadius: radius.xl + spacing.xs,
  },
});
