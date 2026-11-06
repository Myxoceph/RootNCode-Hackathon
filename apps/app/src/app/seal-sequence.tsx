import { Button, cameraColors, spacing, Text } from "@vagabonds/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { DataErrorView } from "@/components/resource-view";
import { SealSequence } from "@/components/seal-sequence";
import { useAsset } from "@/data";
import { useMessages } from "@/i18n";

/** A sealed asset's sequence again, opened from its page. */
export default function SealSequenceScreen() {
  const m = useMessages();
  const router = useRouter();
  const { asset: id } = useLocalSearchParams<{ asset?: string }>();
  const resource = useAsset(id ?? "");
  const leave = () => (router.canGoBack() ? router.back() : router.navigate("/map"));

  if (resource.status === "success" && resource.data) return <SealSequence asset={resource.data} onDone={leave} />;
  return (
    <View style={styles.screen}>
      {resource.status === "loading" ? (
        <ActivityIndicator color={cameraColors.gold} size="large" accessibilityLabel={m.common.loading} />
      ) : (
        <>
          {resource.status === "error" ? (
            <DataErrorView error={resource.error} onRetry={resource.retry} />
          ) : (
            <Text colorValue={cameraColors.text} style={styles.centered} accessibilityRole="alert">
              {m.seal.notFound}
            </Text>
          )}
          <Button label={m.seal.ok} onPress={leave} colors={[cameraColors.gold, cameraColors.onGold]} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.lg,
    padding: spacing.lg,
    backgroundColor: cameraColors.background,
  },
  centered: {
    textAlign: "center",
  },
});
