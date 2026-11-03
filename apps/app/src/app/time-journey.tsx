import Ionicons from "@expo/vector-icons/Ionicons";
import { cameraColors, fontFamily, spacing, Text, touchTarget } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TimeJourney } from "@/components/time-journey";
import { useSearchableAssets } from "@/data";
import { centuriesOf, firstCentury } from "@/lib/home";

const COLUMN = 640;
const TITLE_SOFT = "rgba(255, 255, 255, 0.76)";

/** Zamanda Yolculuk, opened from the Eserler list: a line of words and the walk through the centuries, on the whole screen. */
export default function TimeJourneyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const assets = useSearchableAssets(true);
  const list = assets.status === "success" && assets.data ? assets.data : [];
  const centuries = useMemo(() => centuriesOf(list), [list]);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Head>
        <title>Zamanda Yolculuk · Vagabonds</title>
      </Head>
      {/* The page is dark in both themes. */}
      <StatusBar style="light" />

      <TimeJourney centuries={centuries} opening={firstCentury(centuries)} page={Math.min(width, COLUMN)} bottomInset={insets.bottom + spacing.md}>
        <View style={styles.head}>
          <Pressable accessibilityRole="button" accessibilityLabel="Geri" hitSlop={6} onPress={() => (router.canGoBack() ? router.back() : router.replace("/monuments"))} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={cameraColors.text} />
          </Pressable>
          <Text variant="heading" headingLevel={1} colorValue={TITLE_SOFT} style={styles.title}>
            {"Eserleri "}
            <Text variant="heading" colorValue={cameraColors.text} style={styles.titleStrong}>
              zaman yolculuğu
            </Text>
            {"\nile keşfedebilirsin"}
          </Text>
        </View>
        {assets.status === "loading" && <ActivityIndicator color={cameraColors.textSecondary} accessibilityLabel="Eserler yükleniyor" style={styles.loading} />}
        {assets.status === "error" && (
          <Pressable accessibilityRole="button" onPress={assets.retry} style={styles.retry}>
            <Text variant="caption" colorValue={cameraColors.textSecondary}>
              {`${assets.error.message} Tekrar denemek için dokun.`}
            </Text>
          </Pressable>
        )}
      </TimeJourney>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: cameraColors.background,
  },
  content: {
    flexGrow: 1,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  back: {
    width: touchTarget.min,
    height: touchTarget.min,
    marginLeft: -spacing.xs,
    borderRadius: touchTarget.min / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.28)",
  },
  title: {
    flex: 1,
    fontFamily: fontFamily.sansSemiBold,
    letterSpacing: -0.3,
  },
  titleStrong: {
    fontFamily: fontFamily.sansBold,
  },
  loading: {
    paddingVertical: spacing.xxxl,
  },
  retry: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    marginTop: spacing.md,
  },
});
