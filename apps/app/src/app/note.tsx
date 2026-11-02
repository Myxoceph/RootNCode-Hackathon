import Ionicons from "@expo/vector-icons/Ionicons";
import { CONTRIBUTION_TEXT_MAX, CONTRIBUTION_TEXT_MIN, ContributionTextSchema, NicknameSchema, normalizeContributionText, type AssetDetail, type PulseItem, type TextContributionKind } from "@vagabonds/contracts";
import { cameraColors, fontFamily, palette, radius, spacing, Text, touchTarget, typography, useTheme, useUi } from "@vagabonds/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { useState, type ComponentProps } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { AssetImage } from "@/components/asset-image";
import { ResourceView } from "@/components/resource-view";
import { communityAvailable, DataError, sendContribution, useAsset, useCommunity, usePulse } from "@/data";
import { announce } from "@/lib/announce";
import { formatDate } from "@/lib/format-date";

type IconName = ComponentProps<typeof Ionicons>["name"];

const KINDS: ReadonlyArray<{ value: TextContributionKind; label: string; icon: IconName; hint: string }> = [
  { value: "tip", label: "İpucu", icon: "bulb-outline", hint: "Ziyarete yarayan bir bilgi: giriş, saatler, kalabalık, rampa…" },
  { value: "memory", label: "Anı", icon: "heart-outline", hint: "Bu eserle ilgili bir anın ya da duyduğun bir hikâye." },
  { value: "correction", label: "Düzeltme", icon: "create-outline", hint: "Sayfadaki bir bilgi yanlışsa doğrusunu ve kaynağını yaz." },
];

const HERO_HEIGHT = 220;

/**
 * "Not bırak" over an unlocked asset on the map: the asset's photo, then the note. It goes to the API
 * under the visitor's session (the first note opens one under a nickname) and waits for a moderator;
 * under the form are the notes a moderator has approved.
 */
export default function NoteScreen() {
  const { asset: id } = useLocalSearchParams<{ asset?: string }>();
  const resource = useAsset(id ?? "");
  const { colors: c } = useTheme();
  return (
    <View style={[styles.flex, { backgroundColor: c.background }]}>
      <Head>
        <title>Not bırak · Vagabonds</title>
      </Head>
      <ResourceView resource={resource}>
        {(asset) =>
          asset ? (
            <Note asset={asset} />
          ) : (
            <View style={styles.missing}>
              <BackButton />
              <Text>Eser bulunamadı.</Text>
            </View>
          )
        }
      </ResourceView>
    </View>
  );
}

function useLeave() {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace("/"));
}

function BackButton() {
  const leave = useLeave();
  const insets = useSafeAreaInsets();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Geri" hitSlop={6} onPress={leave} style={[styles.back, { top: insets.top + spacing.xs }]}>
      <Ionicons name="chevron-back" size={22} color={cameraColors.text} />
    </Pressable>
  );
}

function Note({ asset }: { asset: AssetDetail }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxxl }}>
        <Hero asset={asset} />
        <View style={styles.column}>
          <Composer asset={asset} />
          <ApprovedNotes id={asset.id} />
        </View>
      </ScrollView>
      <BackButton />
    </KeyboardAvoidingView>
  );
}

function Hero({ asset }: { asset: AssetDetail }) {
  return (
    <View style={styles.hero}>
      {asset.cover && <AssetImage media={asset.cover} decorative fill />}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="note-hero" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.2" stopColor={cameraColors.background} stopOpacity={0.1} />
              <Stop offset="1" stopColor={cameraColors.background} stopOpacity={0.92} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#note-hero)" />
        </Svg>
      </View>
      <View style={styles.heroWords}>
        <Text variant="overline" colorValue={cameraColors.gold}>
          NOT BIRAK
        </Text>
        <Text variant="title" headingLevel={1} colorValue={cameraColors.text} numberOfLines={2}>
          {asset.name}
        </Text>
      </View>
    </View>
  );
}

function Composer({ asset }: { asset: AssetDetail }) {
  const { colors: c } = useTheme();
  const { textScale } = useUi();
  const { user } = useCommunity();
  const leave = useLeave();
  const [kind, setKind] = useState<TextContributionKind>("tip");
  const [body, setBody] = useState("");
  const [nickname, setNickname] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<"body" | "nickname" | null>(null);

  const chars = normalizeContributionText(body).length;
  const needsNickname = user === null;
  const ready = chars >= CONTRIBUTION_TEXT_MIN && chars <= CONTRIBUTION_TEXT_MAX;
  const hint = KINDS.find((option) => option.value === kind)?.hint;

  function fail(message: string) {
    setError(message);
    announce(message);
  }

  async function submit() {
    if (!ContributionTextSchema.safeParse(body).success) {
      return fail(chars < CONTRIBUTION_TEXT_MIN ? `Not en az ${CONTRIBUTION_TEXT_MIN} karakter olmalı.` : `Not en çok ${CONTRIBUTION_TEXT_MAX} karakter olabilir.`);
    }
    if (needsNickname && !NicknameSchema.safeParse(nickname).success) {
      return fail("Takma ad 2–32 karakter olmalı; harf ya da rakamla başlamalı. Boşluk, nokta, alt çizgi ve tire kullanılabilir.");
    }
    setError(null);
    setSending(true);
    try {
      await sendContribution(asset, { kind, body }, needsNickname ? nickname.trim() : undefined);
      setBody("");
      setSent(true);
      announce("Notun gönderildi. Moderatör onayından sonra görünecek.");
    } catch (e) {
      fail(e instanceof DataError ? e.message : "Not gönderilemedi. Biraz sonra tekrar dene.");
    } finally {
      setSending(false);
    }
  }

  if (!communityAvailable) {
    return (
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text color="textSecondary">Örnek veriyle çalışılıyor: not göndermek için sunucu gerekiyor.</Text>
      </View>
    );
  }

  if (sent) {
    return (
      <View style={[styles.card, styles.sent, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="alert">
        <View style={[styles.sentMark, { backgroundColor: c.highlightMark }]}>
          <Ionicons name="checkmark" size={30} color={c.onPrimary} />
        </View>
        <Text variant="heading" style={styles.center}>
          Notun bize ulaştı
        </Text>
        <Text color="textSecondary" style={styles.center}>
          Bir moderatör onaylayınca herkese görünür. Durumunu Profil sekmesinde görebilirsin.
        </Text>
        <PrimaryButton label="Haritaya dön" icon="map" onPress={leave} />
        <Pressable accessibilityRole="button" onPress={() => setSent(false)} style={styles.again}>
          <Text variant="label" color="highlight">
            Bir not daha bırak
          </Text>
        </Pressable>
      </View>
    );
  }

  const fieldStyle = (name: "body" | "nickname") => [styles.field, { backgroundColor: c.background, borderColor: focused === name ? c.highlightMark : c.border }];
  const typed = { color: c.text, fontSize: typography.body.fontSize * textScale, lineHeight: typography.body.lineHeight * textScale };
  const noOutline = Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null;

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.kinds} accessibilityRole="radiogroup" accessibilityLabel="Not türü">
        {KINDS.map((option) => {
          const on = option.value === kind;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={option.label}
              onPress={() => setKind(option.value)}
              style={[styles.kind, { backgroundColor: on ? c.highlightMark : c.background, borderColor: on ? c.highlightMark : c.border }]}
            >
              <Ionicons name={option.icon} size={20} color={on ? c.onPrimary : c.textSecondary} />
              <Text variant="caption" colorValue={on ? c.onPrimary : c.text} style={styles.semibold}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={fieldStyle("body")}>
        <TextInput
          accessibilityLabel="Notun"
          accessibilityHint={hint}
          value={body}
          onChangeText={setBody}
          onFocus={() => setFocused("body")}
          onBlur={() => setFocused(null)}
          placeholder={hint}
          placeholderTextColor={c.textSecondary}
          multiline
          maxLength={CONTRIBUTION_TEXT_MAX + 200}
          editable={!sending}
          style={[styles.input, styles.multiline, typed, noOutline]}
        />
        <Text variant="caption" color={chars > CONTRIBUTION_TEXT_MAX ? "warning" : "textSecondary"} accessibilityLiveRegion="polite" style={styles.count}>
          {chars < CONTRIBUTION_TEXT_MIN ? `en az ${CONTRIBUTION_TEXT_MIN} karakter · ${chars}` : `${chars} / ${CONTRIBUTION_TEXT_MAX}`}
        </Text>
      </View>

      {needsNickname ? (
        <View style={styles.nickname}>
          <View style={fieldStyle("nickname")}>
            <TextInput
              accessibilityLabel="Takma ad"
              value={nickname}
              onChangeText={setNickname}
              onFocus={() => setFocused("nickname")}
              onBlur={() => setFocused(null)}
              placeholder="Takma adın"
              placeholderTextColor={c.textSecondary}
              maxLength={32}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              editable={!sending}
              style={[styles.input, typed, noOutline]}
            />
          </View>
          <Text variant="caption" color="textSecondary">
            Notunun yanında görünür. Hesap, e-posta ya da şifre gerekmez.
          </Text>
        </View>
      ) : (
        user && (
          <View style={styles.signedAs}>
            <Ionicons name="person-circle-outline" size={18} color={c.textSecondary} />
            <Text variant="caption" color="textSecondary">
              {`${user.nickname} olarak gönderilecek`}
            </Text>
          </View>
        )
      )}

      {error && (
        <View style={styles.error} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={18} color={c.warning} />
          <Text variant="caption" color="warning" style={styles.flex}>
            {error}
          </Text>
        </View>
      )}

      <PrimaryButton label={sending ? "Gönderiliyor…" : "Notu gönder"} icon="send" onPress={submit} disabled={!ready || sending || user === undefined} busy={sending} />

      <View style={styles.moderation}>
        <Ionicons name="shield-checkmark-outline" size={16} color={c.textSecondary} style={styles.moderationIcon} />
        <Text variant="caption" color="textSecondary" style={styles.moderationText}>
          Notlar moderatör onayından sonra görünür.
        </Text>
      </View>
    </View>
  );
}

function PrimaryButton({ label, icon, onPress, disabled = false, busy = false }: { label: string; icon: IconName; onPress: () => void; disabled?: boolean; busy?: boolean }) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primary, { backgroundColor: c.highlightMark }, disabled && styles.dimmed, pressed && styles.pressed]}
    >
      {busy ? <ActivityIndicator color={c.onPrimary} size="small" /> : <Ionicons name={icon} size={18} color={c.onPrimary} />}
      <Text variant="label" colorValue={c.onPrimary} style={styles.semibold}>
        {label}
      </Text>
    </Pressable>
  );
}

/** What other visitors left here and a moderator approved; nothing shows until there is some. */
function ApprovedNotes({ id }: { id: string }) {
  const { colors: c } = useTheme();
  const pulse = usePulse(id);
  const items: PulseItem[] = pulse.status === "success" && pulse.data ? pulse.data.items.filter((item) => item.origin === "community") : [];
  if (items.length === 0) return null;
  return (
    <View style={styles.approved}>
      <Text variant="overline" headingLevel={2} color="textSecondary">
        ZİYARETÇİLERİN NOTLARI
      </Text>
      {items.map((item) => (
        <View key={item.id} style={[styles.approvedItem, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text>{item.text}</Text>
          <Text variant="caption" color="textSecondary">
            {[item.author, item.date && formatDate(item.date)].filter(Boolean).join(" · ")}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    textAlign: "center",
  },
  semibold: {
    fontFamily: fontFamily.sansSemiBold,
  },
  missing: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  back: {
    position: "absolute",
    left: spacing.md,
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10, 14, 22, 0.62)",
  },
  hero: {
    height: HERO_HEIGHT,
    overflow: "hidden",
    backgroundColor: palette.gece800,
  },
  heroWords: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    gap: spacing.xxs,
  },
  column: {
    gap: spacing.xl,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    paddingHorizontal: spacing.md,
    // The card rises over the photo's lower edge.
    marginTop: -spacing.md,
  },
  card: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  kinds: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  kind: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    minHeight: 64,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  field: {
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  input: {
    fontFamily: fontFamily.sans,
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  multiline: {
    minHeight: 132,
    textAlignVertical: "top",
  },
  count: {
    alignSelf: "flex-end",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  nickname: {
    gap: spacing.xs,
  },
  signedAs: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  moderation: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xs,
  },
  // Level with the first line when a large text size or a small phone wraps the sentence.
  moderationIcon: {
    marginTop: 2,
  },
  moderationText: {
    flexShrink: 1,
  },
  error: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 52,
    alignSelf: "stretch",
    borderRadius: radius.full,
  },
  dimmed: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.8,
  },
  sent: {
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  sentMark: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  again: {
    minHeight: touchTarget.min,
    justifyContent: "center",
  },
  approved: {
    gap: spacing.sm,
  },
  approvedItem: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
