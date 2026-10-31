import { touchTarget, typography } from "@vagabonds/ui";
import { Link } from "expo-router";
import { StyleSheet } from "react-native";

import { ScreenPlaceholder } from "@/components/screen-placeholder";
import { useColors } from "@/theme";

export default function NotFoundScreen() {
  const c = useColors();
  return (
    <ScreenPlaceholder
      title="Sayfa bulunamadı"
      description="Aradığın sayfa taşınmış ya da hiç var olmamış olabilir."
    >
      <Link href="/" style={[styles.link, { color: c.primary }]}>
        Haritaya dön
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
