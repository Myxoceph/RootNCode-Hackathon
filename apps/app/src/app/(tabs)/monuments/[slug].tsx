import { touchTarget, typography } from "@vagabonds/ui";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";
import { StyleSheet } from "react-native";

import { MonumentDetail } from "@/components/monument-detail";
import { ResourceView } from "@/components/resource-view";
import { ScreenPlaceholder } from "@/components/screen-placeholder";
import { dataSource, useMonument } from "@/data";
import { useColors } from "@/theme";

/** Pre-renders one web page per monument, so every detail URL works as a static file. */
export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  const monuments = await dataSource.listMonuments();
  return monuments.map((m) => ({ slug: m.slug }));
}

export default function MonumentScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const monument = useMonument(slug);

  return (
    <ResourceView resource={monument}>
      {(data) =>
        data === null ? (
          <MonumentNotFound />
        ) : (
          <>
            <Stack.Screen options={{ title: data.name }} />
            <Head>
              <title>{`${data.name} · Vagabonds`}</title>
            </Head>
            <MonumentDetail monument={data} />
          </>
        )
      }
    </ResourceView>
  );
}

function MonumentNotFound() {
  const c = useColors();
  return (
    <ScreenPlaceholder title="Eser bulunamadı" description="Bu adreste bir eser yok. Bağlantı eskimiş olabilir.">
      <Link href="/monuments" style={[styles.link, { color: c.primary }]}>
        Tüm eserlere dön
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
