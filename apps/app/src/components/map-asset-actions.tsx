import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetSummary } from "@vagabonds/contracts";
import { fontFamily, palette, radius, spacing, Text, useTheme } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import { useEffect, useState, type ComponentProps } from "react";
import { Animated, Easing, Linking, Platform, Pressable, StyleSheet, View } from "react-native";

import { useHasInscriptions } from "@/ar/inscription-scope";
import { CARD_COLORS, GLASS_COLORS, GlassFill } from "@/components/city-asset-cards";
import { useAsset } from "@/data";
import { isAssetUnlocked } from "@/lib/related-assets";
import { useUnlockedAssets } from "@/lib/unlocked-assets";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { speakAnswer, stopAnswer, stopAnswerOf, useSpeaking } from "@/lib/voice";
import { visitSealTarget } from "@/lib/visit-seal";

type IconName = ComponentProps<typeof Ionicons>["name"];

interface Action {
  key: string;
  icon: IconName;
  /** One or two short words: the five stand side by side, all in sight. */
  label: string;
  /** What it does, after the label; or why it is dimmed. */
  hint: string;
  disabled: boolean;
  /** Filled in gold: asking Rehber, and the description while it is being read. */
  on?: boolean;
  hidden?: boolean;
  onPress: () => void;
}

/**
 * One bar of the city cards' frosted glass under the map's search bar for the asset chosen on the map, with everything in sight:
 * ask Rehber, directions, Taşın Dili, Ziyaret Mührü and its spoken description. Each keeps its place
 * from asset to asset: the three that wait for the asset's record stay dimmed when it has no readable
 * inscription, no seal part or no description. The bar drops in once, as the city's cards rise in
 * under the map.
 */
export function MapAssetActions({ asset }: { asset: AssetSummary }) {
  const { colors: c, scheme } = useTheme();
  const router = useRouter();
  const detail = useAsset(asset.id);
  // Read in EVREN's voice, as Rehber's answers; the phone's voice when it cannot be reached.
  const descriptionKey = `description:${asset.id}`;
  const describing = useSpeaking() === descriptionKey;
  const record = detail.status === "success" ? detail.data : null;
  const description = record?.accessibility.audioDescription ?? null;
  const readable = useHasInscriptions(record);
  const sealable = record ? visitSealTarget(record) !== null : false;
  const coords = asset.coordinates;
  const opened = isAssetUnlocked(asset, useUnlockedAssets());
  const reduceMotion = useReducedMotion();
  const [drop] = useState(() => new Animated.Value(0));

  // The same timing as the cards (city-asset-cards.tsx), from above instead of below.
  useEffect(() => {
    if (reduceMotion) drop.setValue(1);
    else Animated.timing(drop, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [drop, reduceMotion]);

  // Another asset, another description: stop reading the last one.
  useEffect(() => () => stopAnswerOf((key) => key === descriptionKey), [descriptionKey]);

  const actions: Action[] = [
    {
      key: "ask",
      icon: "sparkles",
      label: "Rehber'e sor",
      hint: `${asset.name} hakkında asistanı açar`,
      disabled: false,
      on: true,
      onPress: () => router.push({ pathname: "/assistant", params: { asset: asset.id, name: asset.name } }),
    },
    {
      key: "directions",
      icon: "navigate",
      label: "Yol tarifi",
      hint: coords ? `${asset.name} için harita uygulamasını açar` : "Bu eserin konumu bilinmiyor",
      disabled: !coords,
      onPress: () => coords && Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`),
    },
    {
      key: "inscription",
      // The camera's: not on the web (ADR 0001), where "Kilidini aç" says the seal is the phone's too.
      hidden: web,
      icon: "scan",
      label: "Taşın Dili",
      hint: readable ? "Kitabeyi kamerayla okur" : record ? "Bu eserde okunacak kitabe yok" : "Eserin bilgileri yükleniyor",
      disabled: !readable,
      onPress: () => router.push({ pathname: "/inscription", params: { asset: asset.id } }),
    },
    {
      key: "seal",
      icon: "ribbon",
      label: "Mühür",
      hint: sealable ? "Ziyaret Mührü: eserde olduğunu kamerayla kanıtlar" : record ? "Bu eserde mühür kısmı yok" : "Eserin bilgileri yükleniyor",
      disabled: !sealable,
      // An unlocked asset needs no seal: its place goes to the others.
      hidden: opened || web,
      onPress: () => router.push({ pathname: "/visit-seal", params: { asset: asset.id } }),
    },
    {
      key: "describe",
      icon: describing ? "stop" : "ear",
      label: describing ? "Durdur" : "Betimle",
      hint: describing ? "Sesli betimlemeyi keser" : description ? "Mekânı sesli betimler" : record ? "Bu eserin sesli betimlemesi yok" : "Eserin bilgileri yükleniyor",
      disabled: !description,
      on: describing,
      onPress: () => {
        if (!description) return;
        if (describing) stopAnswer();
        else void speakAnswer(descriptionKey, description);
      },
    },
  ];

  return (
    <Animated.View style={[styles.bar, { borderColor: CARD_COLORS[scheme].edge, opacity: drop, transform: [{ translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }]}>
      <GlassFill />
      {actions.filter((action) => !action.hidden).map((action) => (
        <Pressable
          key={action.key}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityHint={action.hint}
          // The web drops the hint: the same words, unseen, describe the button there.
          aria-describedby={web ? `map-action-${action.key}-hint` : undefined}
          accessibilityState={{ disabled: action.disabled }}
          disabled={action.disabled}
          onPress={action.onPress}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.cell,
            action.on ? { backgroundColor: c.highlightMark } : hovered && !action.disabled && { backgroundColor: GLASS_COLORS.chip },
            action.disabled && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name={action.icon} size={20} color={action.on ? c.onPrimary : palette.altin200} />
          <Text variant="caption" colorValue={action.on ? c.onPrimary : GLASS_COLORS.text} numberOfLines={1} style={styles.label}>
            {action.label}
          </Text>
          {web && (
            <View nativeID={`map-action-${action.key}-hint`} aria-hidden style={styles.unseen}>
              <Text>{action.hint}</Text>
            </View>
          )}
        </Pressable>
      ))}
    </Animated.View>
  );
}

const BAR_EDGE = 2;
const web = Platform.OS === "web";

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    gap: spacing.xxs,
    marginTop: spacing.sm,
    padding: spacing.xxs,
    borderRadius: radius.xl,
    borderWidth: BAR_EDGE,
    overflow: "hidden",
  },
  cell: {
    // A cell is as wide as its words and shares out what is left, so the longest words fit on a small phone.
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xxs,
    // Follows the bar's corner at an even distance, the gold and the hover alike.
    borderRadius: radius.xl - BAR_EDGE - spacing.xxs,
  },
  label: {
    fontFamily: fontFamily.sansSemiBold,
    // A little under the 14pt floor so five fit side by side; each is also read out in full.
    fontSize: 13,
    lineHeight: 15,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.75,
  },
  unseen: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
  },
});
