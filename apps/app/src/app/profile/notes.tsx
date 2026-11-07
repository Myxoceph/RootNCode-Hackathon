import { spacing, useTheme } from "@vagabonds/ui";
import Head from "expo-router/head";
import { ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MyContributions } from "@/components/my-contributions";
import { useMessages } from "@/i18n";
import { bottomInset } from "@/lib/bottom-inset";
import { useWideWeb, wideColumn } from "@/lib/use-wide-web";

/** Profil · Bıraktığım Notlar: the visitor's notes and their moderation, each on a card of its own. */
export default function MyNotesScreen() {
  const m = useMessages();
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWideWeb();
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[
        styles.content,
        wide && wideColumn,
        { paddingBottom: bottomInset(insets.bottom) + spacing.xl },
      ]}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Head>
        <title>{m.common.title(m.screens.notes)}</title>
      </Head>
      <MyContributions title={m.screens.notes} />
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
});
