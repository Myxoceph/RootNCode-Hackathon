import { touchTarget, typography } from "@vagabonds/ui";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";
import { StyleSheet } from "react-native";

import { AssetDetailView } from "@/components/asset-detail";
import { ResourceView } from "@/components/resource-view";
import { ScreenPlaceholder } from "@/components/screen-placeholder";
import { useAsset } from "@/data";
import { useMessages } from "@/i18n";
import { useColors } from "@/theme";

/**
 * `/monuments/<asset id>`, e.g. `/monuments/bursa-osmangazi-ulucami`.
 *
 * The data comes from the API at runtime, so the web build exports one shell page for
 * every id (`monuments/[id].html`); deploy/Caddyfile serves it for each detail URL.
 */
export default function MonumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const asset = useAsset(id);

  return (
    <ResourceView resource={asset}>
      {(data) =>
        data === null ? (
          <MonumentNotFound />
        ) : (
          <>
            <Stack.Screen options={{ title: data.name }} />
            <Head>
              <title>{`${data.name} · Vagabonds`}</title>
            </Head>
            <AssetDetailView asset={data} />
          </>
        )
      }
    </ResourceView>
  );
}

function MonumentNotFound() {
  const c = useColors();
  const w = useMessages().monuments;
  return (
    <ScreenPlaceholder title={w.notFoundTitle} description={w.notFoundBody}>
      <Link href="/monuments" style={[styles.link, { color: c.primary }]}>
        {w.backToAll}
      </Link>
    </ScreenPlaceholder>
  );
}

const styles = StyleSheet.create({
  link: {
    ...typography.label,
    minHeight: touchTarget.min,
    textDecorationLine: "underline",
  },
});
