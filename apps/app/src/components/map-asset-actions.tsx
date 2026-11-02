import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetSummary } from "@vagabonds/contracts";
import { fontFamily, palette, radius, spacing, Text, useTheme } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import { useEffect, useState, type ComponentProps } from "react";
import { Animated, Easing, Linking, Pressable, StyleSheet } from "react-native";

import { useHasInscriptions } from "@/ar/inscription-scope";
import { CARD_COLORS, GLASS_COLORS, GlassFill } from "@/components/city-asset-cards";
import { useAsset } from "@/data";
import { isAssetUnlocked } from "@/lib/related-assets";
import { speak, stopSpeaking } from "@/lib/speak";
import { useUnlockedAssets } from "@/lib/unlocked-assets";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { visitSealTarget } from "@/lib/visit-seal";

type IconName = ComponentProps<typeof Ionicons>["name"];

interface Action {
  key: string;
  icon: IconName;
  /** One or two short words: the five stand side by side, all in sight. */
  label: string;
  spoken: string;
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
  const [describing, setDescribing] = useState(false);
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
  useEffect(() => {
    setDescribing(false);
    return stopSpeaking;
  }, [asset.id]);

  const actions: Action[] = [
    {
      key: "ask",
      icon: "sparkles",
      label: "Rehber'e sor",
      spoken: `${asset.name} hakkında Rehber'e sor, asistanı açar`,
      disabled: false,
      on: true,
      onPress: () => router.push({ pathname: "/assistant", params: { asset: asset.id, name: asset.name } }),
    },
    {
      key: "directions",
      icon: "navigate",
      label: "Yol tarifi",
      spoken: `${asset.name}: yol tarifi al, harita uygulamasını açar`,
      disabled: !coords,
      onPress: () => coords && Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`),
    },
    {
      key: "inscription",
      icon: "scan",
      label: "Taşın Dili",
      spoken: `${asset.name}: Taşın Dili, kitabeyi kamerayla oku`,
      disabled: !readable,
      onPress: () => router.push({ pathname: "/inscription", params: { asset: asset.id } }),
    },
    {
      key: "seal",
      icon: "ribbon",
      label: "Mühür",
      spoken: `${asset.name}: Ziyaret Mührü, eserde olduğunu kamerayla kanıtla`,
      disabled: !sealable,
      // An unlocked asset needs no seal: its place goes to the others.
      hidden: opened,
      onPress: () => router.push({ pathname: "/visit-seal", params: { asset: asset.id } }),
    },
    {
      key: "describe",
      icon: describing ? "stop" : "ear",
      label: describing ? "Durdur" : "Betimle",
      spoken: describing ? "Sesli betimlemeyi durdur" : `${asset.name}: mekânı sesli betimle`,
      disabled: !description,
      on: describing,
      onPress: () => {
        if (!description) return;
        if (describing) stopSpeaking();
        else speak(description);
        setDescribing(!describing);
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
          accessibilityLabel={action.spoken}
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
        </Pressable>
      ))}
    </Animated.View>
  );
}

const BAR_EDGE = 2;

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
});
