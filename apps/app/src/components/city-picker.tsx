import { radius, spacing, touchTarget, typography } from "@vagabonds/ui";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

import type { CityOption } from "@/data";
import { useColors } from "@/theme";

interface CityPickerProps {
  cities: CityOption[];
  /** `undefined` means all cities. */
  selected: string | undefined;
  onSelect: (code: string | undefined) => void;
}

/**
 * One-choice filter above the list: "Tümü" plus every city with published assets.
 * A radio group, so screen readers announce the choice and which one is on;
 * the selected chip is also filled, not only recolored.
 */
export function CityPicker({ cities, selected, onSelect }: CityPickerProps) {
  const total = cities.reduce((sum, city) => sum + city.assetCount, 0);
  const options = [{ code: undefined, label: "Tümü", assetCount: total }, ...cities];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="radiogroup"
      accessibilityLabel="Şehir"
    >
      {options.map((option) => (
        <Chip
          key={option.code ?? "all"}
          label={option.label}
          count={option.assetCount}
          selected={option.code === selected}
          onPress={() => onSelect(option.code)}
        />
      ))}
    </ScrollView>
  );
}

function Chip({ label, count, selected, onPress }: { label: string; count: number; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      // `aria-checked`, not `accessibilityState`: react-native-web drops the latter.
      aria-checked={selected}
      accessibilityLabel={`${label}, ${count} eser`}
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.primary : c.surface },
      ]}
    >
      <Text style={[typography.label, { color: selected ? c.onPrimary : c.text }]}>
        {label} · {count}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chip: {
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
