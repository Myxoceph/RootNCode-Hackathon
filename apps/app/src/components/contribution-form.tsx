import Ionicons from "@expo/vector-icons/Ionicons";
import {
  CONTRIBUTION_TEXT_MAX,
  CONTRIBUTION_TEXT_MIN,
  ContributionTextSchema,
  NicknameSchema,
  normalizeContributionText,
  type TextContributionKind,
} from "@vagabonds/contracts";
import { Button, fontFamily, radius, spacing, Text, useTheme, useUi } from "@vagabonds/ui";
import { useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import { Segmented } from "@/components/segmented";
import { communityAvailable, DataError, sendContribution, useCommunity } from "@/data";
import { announce } from "@/lib/announce";

const kinds: ReadonlyArray<{ value: TextContributionKind; label: string; hint: string }> = [
  { value: "tip", label: "İpucu", hint: "Ziyarete yarayan bir bilgi: giriş, saatler, kalabalık, rampa…" },
  { value: "memory", label: "Anı", hint: "Bu eserle ilgili bir anın ya da duyduğun bir hikâye." },
  { value: "correction", label: "Düzeltme", hint: "Sayfadaki bir bilgi yanlışsa doğrusunu ve kaynağını yaz." },
];

type Phase = "closed" | "open" | "sending" | "sent";

/**
 * "Not bırak": a visitor note on the asset (module 6). The first note asks for a nickname,
 * which opens an anonymous session (data/community.ts); later notes go under it. Every note
 * waits for a moderator, and the form says so.
 */
export function ContributionForm({ asset }: { asset: { id: string; name: string } }) {
  const { colors: c } = useTheme();
  const { user } = useCommunity();
  const [phase, setPhase] = useState<Phase>("closed");
  const [kind, setKind] = useState<TextContributionKind>("tip");
  const [body, setBody] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);

  const chars = normalizeContributionText(body).length;
  const needsNickname = user === null;

  function fail(message: string) {
    setError(message);
    announce(message);
  }

  async function submit() {
    // The contract's own check; the counter tells which limit it broke.
    if (!ContributionTextSchema.safeParse(body).success) {
      return fail(
        chars < CONTRIBUTION_TEXT_MIN
          ? `Not en az ${CONTRIBUTION_TEXT_MIN} karakter olmalı.`
          : `Not en çok ${CONTRIBUTION_TEXT_MAX} karakter olabilir.`,
      );
    }
    if (needsNickname && !NicknameSchema.safeParse(nickname).success) {
      return fail("Takma ad 2–32 karakter olmalı; harf ya da rakamla başlamalı. Boşluk, nokta, alt çizgi ve tire kullanılabilir.");
    }
    setError(null);
    setPhase("sending");
    try {
      await sendContribution(asset, { kind, body }, needsNickname ? nickname.trim() : undefined);
      setBody("");
      setPhase("sent");
      announce("Notun gönderildi. Moderatör onayından sonra burada görünecek.");
    } catch (e) {
      setPhase("open");
      fail(e instanceof DataError ? e.message : "Not gönderilemedi. Biraz sonra tekrar dene.");
    }
  }

  if (!communityAvailable) {
    return (
      <Text variant="caption" color="textSecondary">
        Örnek veriyle çalışılıyor: not göndermek için sunucu gerekiyor.
      </Text>
    );
  }

  if (phase === "closed") {
    return (
      <View style={styles.closed}>
        <Button
          label="Not bırak"
          variant="ghost"
          icon={<Ionicons name="create-outline" size={18} color={c.text} />}
          onPress={() => setPhase("open")}
        />
        <Text variant="caption" color="textSecondary">
          Notlar bir moderatör onayladıktan sonra herkese görünür.
        </Text>
      </View>
    );
  }

  if (phase === "sent") {
    return (
      <View style={[styles.box, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.row} accessibilityRole="alert">
          <Ionicons name="checkmark-circle-outline" size={20} color={c.success} accessibilityElementsHidden importantForAccessibility="no" />
          <Text style={styles.flex}>Notun incelemede. Onaylanınca burada görünür; durumunu Profil sekmesinde görebilirsin.</Text>
        </View>
        <Button label="Bir not daha bırak" variant="ghost" onPress={() => setPhase("open")} />
      </View>
    );
  }

  const sending = phase === "sending";
  const hint = kinds.find((k) => k.value === kind)?.hint;
  return (
    <View style={[styles.box, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text variant="label" headingLevel={2}>
        Not bırak
      </Text>
      <Segmented label="Not türü" options={kinds} value={kind} onChange={setKind} />
      <Field
        label="Notun"
        hint={hint}
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={CONTRIBUTION_TEXT_MAX + 200}
        editable={!sending}
      />
      <Text variant="caption" color={chars > CONTRIBUTION_TEXT_MAX ? "warning" : "textSecondary"} accessibilityLiveRegion="polite">
        {chars < CONTRIBUTION_TEXT_MIN
          ? `${chars}/${CONTRIBUTION_TEXT_MAX} · en az ${CONTRIBUTION_TEXT_MIN} karakter`
          : `${chars}/${CONTRIBUTION_TEXT_MAX}`}
      </Text>

      {needsNickname ? (
        <Field
          label="Takma ad"
          hint="Notunun yanında görünür. Hesap, e-posta ya da şifre gerekmez."
          value={nickname}
          onChangeText={setNickname}
          maxLength={32}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          editable={!sending}
        />
      ) : (
        user && (
          <Text variant="caption" color="textSecondary">
            {`${user.nickname} olarak gönderilecek.`}
          </Text>
        )
      )}

      {error && (
        <Text variant="caption" color="warning" accessibilityRole="alert">
          {error}
        </Text>
      )}

      <View style={styles.actions}>
        <Button label={sending ? "Gönderiliyor…" : "Gönder"} onPress={submit} disabled={sending || user === undefined} style={styles.flex} />
        <Button
          label="Vazgeç"
          variant="ghost"
          disabled={sending}
          onPress={() => {
            setError(null);
            setPhase("closed");
          }}
        />
      </View>
    </View>
  );
}

function Field({ label, hint, multiline, ...rest }: TextInputProps & { label: string; hint?: string }) {
  const { colors: c } = useTheme();
  const { textScale } = useUi();
  return (
    <View style={styles.field}>
      <Text variant="label">{label}</Text>
      {hint && (
        <Text variant="caption" color="textSecondary">
          {hint}
        </Text>
      )}
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        multiline={multiline}
        placeholderTextColor={c.textSecondary}
        style={[
          styles.input,
          multiline && styles.multiline,
          { color: c.text, borderColor: c.border, backgroundColor: c.background, fontSize: 16 * textScale, lineHeight: 24 * textScale },
        ]}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  closed: {
    gap: spacing.xs,
    alignItems: "flex-start",
  },
  box: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  field: {
    gap: spacing.xs,
  },
  input: {
    fontFamily: fontFamily.sans,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  multiline: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});
