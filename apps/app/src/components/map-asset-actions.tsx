import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetSummary } from "@vagabonds/contracts";
import { fontFamily, radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import { useEffect, useState, type ComponentProps } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { useAsset } from "@/data";
import { speak, stopSpeaking } from "@/lib/speak";

type IconName = ComponentProps<typeof Ionicons>["name"];

interface Action {
  key: string;
  icon: IconName;
  /** Two words, one per line, so four fit side by side on a phone. */
  label: string;
  spoken: string;
  disabled: boolean;
  on?: boolean;
  onPress: () => void;
}

/**
 * Four small buttons under the map's search bar for the asset chosen on the map: directions,
 * Taşın Dili, Zaman Perdesi and its spoken description. Taşın Dili and the description wait for
 * the asset's record and stay dimmed when it has no readable inscription or no description.
 */
export function MapAssetActions({ asset }: { asset: AssetSummary }) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const detail = useAsset(asset.id);
  const [describing, setDescribing] = useState(false);
  const record = detail.status === "success" ? detail.data : null;
  const description = record?.accessibility.audioDescription ?? null;
  const readable = record ? record.inscriptions.some((i) => i.translation || i.transliteration) : false;
  const coords = asset.coordinates;

  // Another asset, another description: stop reading the last one.
  useEffect(() => {
    setDescribing(false);
    return stopSpeaking;
  }, [asset.id]);

  const actions: Action[] = [
    {
      key: "directions",
      icon: "navigate",
      label: "Yol\ntarifi",
      spoken: `${asset.name}: yol tarifi al, harita uygulamasını açar`,
      disabled: !coords,
      onPress: () => coords && Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`),
    },
    {
      key: "inscription",
      icon: "scan",
      label: "Taşın\nDili",
      spoken: `${asset.name}: Taşın Dili, kitabeyi kamerayla oku`,
      disabled: !readable,
      onPress: () => router.push({ pathname: "/inscription", params: { asset: asset.id } }),
    },
    {
      key: "curtain",
      icon: "time",
      label: "Zaman\nPerdesi",
      spoken: `${asset.name}: Zaman Perdesi, dünü ve bugünü karşılaştır`,
      disabled: false,
      onPress: () => router.push({ pathname: "/time-curtain", params: { asset: asset.id } }),
    },
    {
      key: "describe",
      icon: describing ? "stop" : "ear",
      label: describing ? "Durdur" : "Sesli\nbetimle",
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
    <View style={styles.row}>
      {actions.map((action) => (
        <Pressable
          key={action.key}
          accessibilityRole="button"
          accessibilityLabel={action.spoken}
          accessibilityState={{ disabled: action.disabled }}
          disabled={action.disabled}
          // Drawn short, but still a 44pt target.
          hitSlop={{ top: 3, bottom: 3 }}
          onPress={action.onPress}
          style={({ pressed }) => [
            styles.chip,
            shadow,
            { backgroundColor: action.on ? c.highlightMark : c.surface },
            action.disabled && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name={action.icon} size={16} color={action.on ? c.onPrimary : c.highlight} />
          <Text variant="caption" colorValue={action.on ? c.onPrimary : c.text} numberOfLines={2} style={[styles.label, styles.flex]}>
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Short, so the row stays light over the map; `hitSlop` makes up the rest of the 44pt target. */
const CHIP_HEIGHT = touchTarget.min - 6;

const shadow = { shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 };

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.xs + spacing.xxs,
    marginTop: spacing.sm,
  },
  chip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    // The icon sits at the same place in every chip, the words beside it.
    justifyContent: "flex-start",
    gap: spacing.xs + spacing.xxs,
    minHeight: CHIP_HEIGHT,
    paddingVertical: spacing.xs,
    paddingLeft: spacing.sm + spacing.xxs,
    paddingRight: spacing.xs,
    borderRadius: radius.lg,
  },
  flex: {
    flex: 1,
  },
  label: {
    fontFamily: fontFamily.sansSemiBold,
    // A little under the 14pt floor so four fit side by side; each is also read out in full.
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
