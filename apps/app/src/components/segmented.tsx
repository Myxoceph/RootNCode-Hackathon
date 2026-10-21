import { radius, spacing, touchTarget, Text, useTheme } from "@vagabonds/ui";
import { Pressable, StyleSheet, View } from "react-native";

interface SegmentedProps<T extends string> {
  /** Names the group for screen readers ("Bölge", "Süre"). */
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  /** "chips" wrap as separate pills; "track" sits in one bar, like a segmented control. */
  look?: "chips" | "track";
}

/** One choice out of a few. Each option is a radio button, so the selection is spoken, not only colored. */
export function Segmented<T extends string>({ label, options, value, onChange, look = "chips" }: SegmentedProps<T>) {
  const { colors: c } = useTheme();
  const track = look === "track";

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.group, track && [styles.track, { backgroundColor: c.surfaceRaised }]]}
    >
      {options.map((option) => {
        const on = option.value === value;
        const background = on ? (track ? c.surface : c.text) : track ? "transparent" : c.surface;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            aria-checked={on}
            onPress={() => onChange(option.value)}
            style={[
              styles.option,
              track ? styles.trackOption : [styles.chip, { borderColor: on ? c.text : c.border }],
              { backgroundColor: background },
            ]}
          >
            <Text variant="label" colorValue={on && !track ? c.background : c.text}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  track: {
    flexWrap: "nowrap",
    gap: 0,
    padding: spacing.xxs,
    borderRadius: radius.lg,
  },
  option: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  chip: {
    borderRadius: radius.full,
    borderWidth: 1,
  },
  trackOption: {
    flex: 1,
    borderRadius: radius.md,
  },
});
