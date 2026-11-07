import Ionicons from "@expo/vector-icons/Ionicons";
import { fontFamily, palette, radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import * as ImagePicker from "expo-image-picker";
import { useState, type ComponentProps } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DataError, removeAvatar, uploadPickedAvatar } from "@/data";
import { useMessages } from "@/i18n";
import { announce } from "@/lib/announce";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** The badge on the photo's corner: large enough to tap (with its slop), small enough to sit on the frame. */
export const AVATAR_BADGE = 34;
const BADGE = AVATAR_BADGE;

/**
 * A way to change the profile photo: a gold camera badge, laid by the screen on the photo's corner,
 * opens a sheet to pick a photo from the library or remove the one there. It turns while the photo is
 * saved; what went wrong is said in the sheet and aloud. The photo is the passport's, so only its owner
 * sees it (`PUT /me/avatar`). The badge is not inside the photo's card: the card is a button itself,
 * and a button inside a button is not allowed on the web.
 */
export function AvatarEditor({
  hasPhoto,
  open,
  onOpenChange,
  style,
}: {
  hasPhoto: boolean;
  /** Whether the sheet is up; held by the screen, so it can open it too (a screen reader's action). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the badge lies. */
  style?: StyleProp<ViewStyle>;
}) {
  const w = useMessages().profile.photo;
  const setOpen = onOpenChange;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setError(null);
  };

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      announce(done);
      setOpen(false);
    } catch (err) {
      const message = err instanceof DataError ? err.message : w.failed;
      setError(message);
      announce(message);
    } finally {
      setBusy(false);
    }
  };

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      // Framed as the passport's photo is: a little taller than wide.
      allowsEditing: true,
      aspect: [4, 5],
      exif: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const { uri, width, height } = result.assets[0];
    await run(() => uploadPickedAvatar(uri, width, height), w.saved);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={hasPhoto ? w.change : w.add}
        accessibilityState={{ busy }}
        hitSlop={8}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.badge, style, pressed && styles.pressed]}
      >
        {busy ? <ActivityIndicator size="small" color={palette.altin950} accessibilityLabel={w.saving} /> : <Ionicons name="camera" size={17} color={palette.altin950} />}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
        <Sheet
          hasPhoto={hasPhoto}
          busy={busy}
          error={error}
          onPick={() => void pick()}
          onRemove={() => void run(removeAvatar, w.removed)}
          onClose={close}
        />
      </Modal>
    </>
  );
}

function Sheet({
  hasPhoto,
  busy,
  error,
  onPick,
  onRemove,
  onClose,
}: {
  hasPhoto: boolean;
  busy: boolean;
  error: string | null;
  onPick: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const w = useMessages().profile.photo;
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.backdrop}>
      {/* The dimmed page closes the sheet, as "Vazgeç" does; a screen reader uses the button. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
      <View style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
        <View style={[styles.grabber, { backgroundColor: c.border }]} />
        <Text variant="heading" headingLevel={2}>
          {w.title}
        </Text>
        <Text variant="caption" color="textSecondary">
          {w.note}
        </Text>

        <View style={styles.options}>
          <Option icon="images-outline" label={w.pick} onPress={onPick} disabled={busy} />
          {hasPhoto && <Option icon="trash-outline" label={w.remove} onPress={onRemove} disabled={busy} danger />}
        </View>

        {busy && (
          <View style={styles.row}>
            <ActivityIndicator color={c.highlightMark} />
            <Text variant="caption" color="textSecondary">
              {w.saving}
            </Text>
          </View>
        )}
        {error && (
          <Text variant="caption" color="warning" accessibilityRole="alert">
            {error}
          </Text>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          disabled={busy}
          style={({ pressed }) => [styles.cancel, { borderColor: c.border }, pressed && { backgroundColor: c.surfaceRaised }, busy && styles.disabled]}
        >
          <Text variant="label">{w.cancel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Option({ icon, label, onPress, disabled, danger = false }: { icon: IconName; label: string; onPress: () => void; disabled: boolean; danger?: boolean }) {
  const { colors: c } = useTheme();
  const tint = danger ? c.warning : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.option, { backgroundColor: c.surfaceRaised }, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Ionicons name={icon} size={20} color={danger ? c.warning : c.highlightMark} aria-hidden />
      <Text variant="label" colorValue={tint} style={styles.optionText}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.altin200,
    borderWidth: 2,
    borderColor: "#582A37",
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(6, 8, 13, 0.55)",
  },
  sheet: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.sm,
  },
  options: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: touchTarget.min + 8,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  optionText: {
    fontFamily: fontFamily.sansSemiBold,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cancel: {
    minHeight: touchTarget.min + 4,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
});
