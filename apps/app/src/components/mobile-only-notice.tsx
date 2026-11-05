import Ionicons from "@expo/vector-icons/Ionicons";
import { Button, palette, radius, spacing, Text, useTheme } from "@vagabonds/ui";
import { Modal, Pressable, StyleSheet, View } from "react-native";

/**
 * Said on the web when something needs the phone's camera: the web has none (ADR 0001), so
 * "Kilidini aç" there says where the asset is unlocked instead of opening Ziyaret Mührü.
 * `name` is the asset asked for; the notice shows while it is set (an empty string shows it without a name).
 */
export function MobileOnlyNotice({ name, onClose }: { name: string | null; onClose: () => void }) {
  const { colors: c, scheme } = useTheme();
  const dark = scheme === "dark";
  return (
    <Modal visible={name !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Kapat" accessibilityRole="button" />
        <View
          accessibilityViewIsModal
          role="alertdialog"
          aria-modal
          aria-labelledby="mobile-only-title"
          aria-describedby="mobile-only-body"
          style={[styles.card, { backgroundColor: dark ? c.surfaceRaised : c.surface, borderColor: dark ? "rgba(255, 255, 255, 0.12)" : c.border }]}
        >
          <View style={[styles.disc, { backgroundColor: dark ? palette.altin300 : palette.gece950 }]} aria-hidden>
            <Ionicons name="phone-portrait-outline" size={26} color={dark ? palette.gece950 : palette.altin200} />
          </View>
          <Text variant="heading" headingLevel={2} nativeID="mobile-only-title" style={styles.center}>
            Mobil uygulamada açılır
          </Text>
          {name && (
            <Text variant="label" color="highlight" style={styles.center}>
              {name}
            </Text>
          )}
          <Text color="textSecondary" nativeID="mobile-only-body" style={styles.center}>
            Eserlerin kilidini yalnızca mobil uygulamada açabilirsin. Eserin yanındayken Ziyaret Mührü ile işaretli kısmı kameraya tanıtman yeterli.
          </Text>
          <Button label="Tamam" onPress={onClose} style={styles.button} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(5, 9, 22, 0.55)",
  },
  card: {
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  disc: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  center: {
    textAlign: "center",
  },
  button: {
    alignSelf: "stretch",
    marginTop: spacing.sm,
  },
});
