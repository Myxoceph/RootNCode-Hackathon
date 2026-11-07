import Ionicons from "@expo/vector-icons/Ionicons";
import { radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";

import { deleteAccount, DataError } from "@/data";
import { useMessages } from "@/i18n";
import { announce } from "@/lib/announce";

/**
 * The account's way out, kept apart from signing out: it takes everything with it and cannot be
 * undone, so it opens in place and asks for the password before anything happens.
 */
export function DeleteAccount() {
  const m = useMessages();
  const w = m.profile.deleteAccount;
  const { colors: c } = useTheme();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setPassword("");
    setError(null);
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(password);
      announce(w.done);
    } catch (err) {
      const message = err instanceof DataError ? err.message : w.failed;
      setError(message);
      announce(message);
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityHint={w.hint}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.opener, pressed && { backgroundColor: c.surfaceRaised }]}
      >
        <Ionicons name="trash-outline" size={16} color={c.textSecondary} aria-hidden />
        <Text variant="label" color="textSecondary">
          {w.open}
        </Text>
      </Pressable>
    );
  }

  const canConfirm = password.length > 0 && !busy;
  return (
    <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.warning }]} accessibilityRole="alert">
      <Text variant="label" color="warning">
        {w.title}
      </Text>
      <Text color="textSecondary">{w.warning}</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        accessibilityLabel={w.password}
        placeholder={w.password}
        placeholderTextColor={c.textSecondary}
        autoFocus
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        editable={!busy}
        onSubmitEditing={() => {
          if (canConfirm) void confirm();
        }}
        style={[styles.input, { color: c.text, borderColor: c.border }]}
      />
      {error !== null && <Text color="warning">{error}</Text>}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={close}
          style={({ pressed }) => [styles.action, { backgroundColor: c.surfaceRaised }, pressed && styles.pressed]}
        >
          <Text variant="label">{w.cancel}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canConfirm, busy }}
          disabled={!canConfirm}
          onPress={() => void confirm()}
          style={({ pressed }) => [styles.action, { backgroundColor: c.warning }, !canConfirm && styles.disabled, pressed && styles.pressed]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={c.onPrimary} />
          ) : (
            <Text variant="label" colorValue={c.onPrimary}>
              {w.confirm}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  opener: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: touchTarget.min,
    borderRadius: radius.xl,
  },
  panel: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  input: {
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: 16,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  action: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
