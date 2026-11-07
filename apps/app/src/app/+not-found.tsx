import { touchTarget, typography } from "@vagabonds/ui";
import { Link } from "expo-router";
import { StyleSheet } from "react-native";

import { ScreenPlaceholder } from "@/components/screen-placeholder";
import { useColors } from "@/theme";
import { useMessages } from "@/i18n";

export default function NotFoundScreen() {
  const c = useColors();
  const w = useMessages().shared;
  return (
    <ScreenPlaceholder
      title={w.notFoundTitle}
      description={w.notFoundBody}
    >
      <Link href="/" style={[styles.link, { color: c.primary }]}>
        {w.backToMap}
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
