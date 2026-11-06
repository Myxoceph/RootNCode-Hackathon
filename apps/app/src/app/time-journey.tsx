import Ionicons from "@expo/vector-icons/Ionicons";
import {
  cameraColors,
  fontFamily,
  palette,
  spacing,
  Text,
  touchTarget,
  useTheme,
} from "@vagabonds/ui";
import { useRouter } from "expo-router";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TimeJourney } from "@/components/time-journey";
import { useSearchableAssets } from "@/data";
import { siteItems, SiteNav } from "@/components/web-nav-bar";
import { useMessages } from "@/i18n";
import { centuriesOf, firstCentury } from "@/lib/home";
import { useWideWeb } from "@/lib/use-wide-web";

const COLUMN = 640;
/** On a wide web page the journey spreads to this, with room at the sides. */
const WIDE_COLUMN = 1200;
const TITLE_SOFT = "rgba(255, 255, 255, 0.76)";

/** Zamanda Yolculuk, opened from the Eserler list: a line of words and the walk through the centuries, on the whole screen. */
export default function TimeJourneyScreen() {
  const m = useMessages();
  const w = m.journey;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const assets = useSearchableAssets(true);
  const list = assets.status === "success" && assets.data ? assets.data : [];
  const centuries = useMemo(() => centuriesOf(list), [list]);
  const wide = useWideWeb();
  // The web follows the light theme; the phone keeps the page dark, as its camera pages.
  const { scheme } = useTheme();
  const light = Platform.OS === "web" && scheme !== "dark";
  const ink = light
    ? { text: palette.gece950, soft: palette.gece600, page: palette.gece50 }
    : {
        text: cameraColors.text,
        soft: cameraColors.textSecondary,
        page: cameraColors.background,
      };
  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/monuments");
  const nav = wide ? (
    <SiteNav
      items={siteItems(m)}
      active="monuments"
      background="transparent"
      onPress={(item) =>
        router.navigate(
          siteItems(m).find((site) => site.name === item.name)!.href,
        )
      }
    />
  ) : undefined;

  return (
    <ScrollView
      style={[styles.page, { backgroundColor: ink.page }]}
      contentContainerStyle={styles.content}
    >
      <Head>
        <title>{m.common.title(m.screens.timeJourney)}</title>
      </Head>
      {/* Dark in both themes on the phone; the web follows its theme. */}
      <StatusBar style={light ? "dark" : "light"} />

      <TimeJourney
        centuries={centuries}
        opening={firstCentury(centuries)}
        page={
          wide
            ? Math.min(width - spacing.xl * 2, WIDE_COLUMN)
            : Math.min(width, COLUMN)
        }
        bottomInset={insets.bottom + (wide ? spacing.xl : spacing.md)}
        wide={wide}
        top={nav}
        light={light}
      >
        {wide ? (
          <View style={styles.headWide}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={w.backToList}
              onPress={back}
              style={({
                hovered,
                pressed,
              }: {
                hovered?: boolean;
                pressed: boolean;
              }) => [
                styles.backLink,
                hovered && {
                  backgroundColor: light
                    ? "rgba(11, 15, 24, 0.06)"
                    : "rgba(255, 255, 255, 0.1)",
                },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="chevron-back" size={16} color={ink.soft} />
              <Text variant="label" colorValue={ink.soft}>
                {m.tabs.monuments}
              </Text>
            </Pressable>
            {/* The page's name for a screen reader; the cards say the rest. */}
            <Text headingLevel={1} style={styles.unseen}>
              {m.screens.timeJourney}
            </Text>
          </View>
        ) : (
          <View style={styles.head}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={m.common.back}
              hitSlop={6}
              onPress={back}
              style={[
                styles.back,
                light && { backgroundColor: "rgba(255, 255, 255, 0.7)" },
              ]}
            >
              <Ionicons name="chevron-back" size={22} color={ink.text} />
            </Pressable>
            <Text
              variant="heading"
              headingLevel={1}
              colorValue={light ? ink.soft : TITLE_SOFT}
              style={styles.title}
            >
              {w.titleStart}
              <Text
                variant="heading"
                colorValue={ink.text}
                style={styles.titleStrong}
              >
                {w.titleStrong}
              </Text>
              {w.titleEnd}
            </Text>
          </View>
        )}
        {assets.status === "loading" && (
          <ActivityIndicator
            color={ink.soft}
            accessibilityLabel={m.monuments.loading}
            style={styles.loading}
          />
        )}
        {assets.status === "error" && (
          <Pressable
            accessibilityRole="button"
            onPress={assets.retry}
            style={styles.retry}
          >
            <Text variant="caption" colorValue={ink.soft}>
              {`${assets.error.message} ${m.common.tapToRetry}`}
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
  headWide: {
    flexDirection: "row",
    alignItems: "center",
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginLeft: -spacing.sm,
    paddingVertical: spacing.xxs,
    paddingLeft: spacing.xs,
    paddingRight: spacing.sm,
    borderRadius: 999,
  },
  backLinkHover: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  pressed: {
    opacity: 0.8,
  },
  unseen: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
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
