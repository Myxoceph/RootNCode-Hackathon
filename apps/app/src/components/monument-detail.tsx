import Ionicons from "@expo/vector-icons/Ionicons";
import type { Inscription, Monument } from "@vagabonds/contracts";
import { fontFamily, radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { useState, type ComponentProps, type PropsWithChildren } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { toggleCapsule, useCapsulePlayer } from "@/audio/capsule-player";
import { BuildingIllustration } from "@/components/building-illustration";
import { CAPSULE_SECONDS, captionAt, capsuleForMonumentType, capsules, formatSeconds } from "@/content/capsules";
import { monumentTypeLabel, relationTypeLabel, splitUnverified } from "@/lib/labels";
import { useA11ySettings } from "@/settings/a11y-settings";

type Tab = "story" | "tips" | "access";

const tabs: Array<{ key: Tab; label: string }> = [
  { key: "story", label: "Hikâye" },
  { key: "tips", label: "Ziyaretçi Notları" },
  { key: "access", label: "Ulaşım" },
];

/**
 * Eser kartı (module 6). Physical access sits at the top (module 8), visitor
 * notes are the default tab: field notes first, encyclopedia second.
 */
export function MonumentDetail({ monument }: { monument: Monument }) {
  const { colors: c } = useTheme();
  const [tab, setTab] = useState<Tab>("tips");

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.hero}>
        {/* The drawing stays underneath, so a photo that fails to load leaves it visible. */}
        <BuildingIllustration mode="now" id={`hero-${monument.slug}`} />
        {monument.archivePhotoUrl && (
          <Image
            source={monument.archivePhotoUrl}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityLabel={`${monument.name}, ${monument.archiveYear ?? ""} arşiv fotoğrafı`}
          />
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.intro}>
          <Text variant="title" headingLevel={1}>
            {monument.name}
          </Text>
          <Text variant="caption" color="textSecondary" style={styles.mono}>
            {`${monument.period} · ${monumentTypeLabel[monument.monumentType]} · ${monument.city}`}
          </Text>
        </View>

        <View style={styles.access} accessibilityLabel="Fiziksel erişim" accessibilityRole="summary">
          <AccessTile icon="trending-up-outline" title="Rampa" available={monument.hasRamp} />
          <AccessTile icon="walk-outline" title="Basamaksız giriş" available={monument.stepFreeAccess} />
        </View>

        <View accessibilityRole="tablist" style={[styles.tabs, { borderBottomColor: c.border }]}>
          {tabs.map(({ key, label }) => {
            const on = key === tab;
            return (
              <Pressable
                key={key}
                accessibilityRole="tab"
                aria-selected={on}
                onPress={() => setTab(key)}
                style={[styles.tab, { borderBottomColor: on ? c.highlightMark : "transparent" }]}
              >
                <Text variant="label" color={on ? "text" : "textSecondary"}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.panel}>
          {tab === "story" && <Story monument={monument} />}
          {tab === "tips" && <Tips monument={monument} />}
          {tab === "access" && <Access monument={monument} />}
        </View>

        <MiniPlayer monument={monument} />
      </View>
    </ScrollView>
  );
}

/** Says "var" / "yok" in words, so the state never depends on the icon or its color alone. */
function AccessTile({ icon, title, available }: { icon: ComponentProps<typeof Ionicons>["name"]; title: string; available: boolean }) {
  const { colors: c } = useTheme();
  return (
    <View
      style={[styles.tile, { backgroundColor: c.surface, borderColor: c.border }]}
      accessible
      accessibilityLabel={`${title}: ${available ? "var" : "yok"}`}
    >
      <Ionicons name={icon} size={22} color={available ? c.primary : c.warning} />
      <Text variant="label">{available ? "Var" : "Yok"}</Text>
      <Text variant="caption" color="textSecondary" style={styles.centerText}>
        {title}
      </Text>
    </View>
  );
}

function Story({ monument }: { monument: Monument }) {
  const { colors: c } = useTheme();
  return (
    <>
      <Text>{monument.accessibilityAudioDesc}</Text>
      {monument.inscriptions.length > 0 && (
        <Section title="Kitabeler">
          {monument.inscriptions.map((inscription) => (
            <InscriptionBlock key={inscription.id} inscription={inscription} />
          ))}
        </Section>
      )}
      {monument.relations.length > 0 && (
        <Section title="Bağlantılı eserler">
          {monument.relations.map((relation) => (
            <Link
              key={`${relation.relatedMonumentId}-${relation.relationType}`}
              href={{ pathname: "/monuments/[slug]", params: { slug: relation.relatedMonumentSlug } }}
              asChild
            >
              <Pressable accessibilityRole="link" style={styles.relation}>
                <Text variant="label" color="primary" style={styles.underline}>
                  {relation.relatedMonumentName}
                </Text>
                <Text variant="caption" colorValue={c.textSecondary}>
                  {relationTypeLabel[relation.relationType]}
                  {relation.note ? ` · ${relation.note}` : ""}
                </Text>
              </Pressable>
            </Link>
          ))}
        </Section>
      )}
    </>
  );
}

const tipAccents = ["warning", "highlight", "primary", "success"] as const;

function Tips({ monument }: { monument: Monument }) {
  const { colors: c } = useTheme();
  const tips = monument.visitorTips.filter((t) => t.status === "approved");
  if (tips.length === 0) return <Text color="textSecondary">Bu eser için henüz onaylanmış ziyaretçi notu yok.</Text>;

  const latest = tips.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
  return (
    <>
      <Text variant="caption" color="textSecondary">
        {`Topluluk özeti · ${tips.length} not · son güncelleme ${formatDate(latest.createdAt)}`}
      </Text>
      <View accessibilityRole="list" style={styles.tips}>
        {tips.map((tip, i) => {
          const accent = c[tipAccents[i % tipAccents.length] ?? "primary"];
          return (
            <View key={tip.id} style={[styles.tip, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={[styles.tipIcon, { backgroundColor: c.surfaceRaised }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={accent} accessibilityElementsHidden importantForAccessibility="no" />
              </View>
              <View style={styles.flex}>
                <Text>{tip.tipText}</Text>
                <Text variant="caption" color="textSecondary">
                  {formatDate(tip.createdAt)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </>
  );
}

function Access({ monument }: { monument: Monument }) {
  const { colors: c } = useTheme();
  const rows = [
    {
      label: "Konum",
      value: `${formatCoordinate(monument.latitude, "K", "G")} · ${formatCoordinate(monument.longitude, "D", "B")}`,
      a11y: `Enlem ${monument.latitude}, boylam ${monument.longitude}`,
      mono: true,
    },
    { label: "Rampa", value: monument.hasRamp ? "Var" : "Yok" },
    { label: "Basamaksız giriş", value: monument.stepFreeAccess ? "Var" : "Yok" },
  ];
  return (
    <View style={styles.kv}>
      {rows.map((row) => (
        <View key={row.label} style={[styles.kvRow, { borderBottomColor: c.border }]} accessible accessibilityLabel={`${row.label}: ${row.a11y ?? row.value}`}>
          <Text variant="caption" color="textSecondary" style={styles.kvLabel}>
            {row.label}
          </Text>
          <Text style={[styles.flex, row.mono && styles.mono]}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

/** Plays the sound capsule that fits the building type; hidden when none fits yet. */
function MiniPlayer({ monument }: { monument: Monument }) {
  const { colors: c } = useTheme();
  const { settings } = useA11ySettings();
  const player = useCapsulePlayer();
  const type = capsuleForMonumentType[monument.monumentType];
  if (!type) return null;

  const capsule = capsules[type];
  const mine = player?.type === type ? player : null;
  const line = mine
    ? settings.captions
      ? captionAt(type, mine.elapsed)
      : `${formatSeconds(mine.elapsed)} / ${formatSeconds(CAPSULE_SECONDS)}`
    : `${capsule.description} · ${formatSeconds(CAPSULE_SECONDS)}`;

  return (
    <View style={[styles.player, { backgroundColor: c.text }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={mine ? "Durdur" : `${capsule.name} ses kapsülünü çal`}
        onPress={() => toggleCapsule(type)}
        style={[styles.playButton, { backgroundColor: c.highlightMark }]}
      >
        <Ionicons name={mine ? "pause" : "play"} size={16} color={c.onPrimary} />
      </Pressable>
      <View style={styles.flex}>
        <Text variant="label" colorValue={c.background}>{`Zaman kapsülü · ${capsule.name}`}</Text>
        <Text variant="caption" colorValue={c.background} accessibilityLiveRegion="polite">
          {line}
        </Text>
      </View>
    </View>
  );
}

function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <View style={styles.section}>
      <Text variant="heading" headingLevel={2}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function InscriptionBlock({ inscription }: { inscription: Inscription }) {
  const { colors: c } = useTheme();
  const fields = [
    { label: "Transkripsiyon", value: inscription.transcription },
    { label: "Günümüz Türkçesi", value: inscription.modernTurkish },
    { label: "Vakfiye şartı", value: inscription.waqfCondition },
  ];

  return (
    <View style={[styles.inscription, { borderColor: c.border, backgroundColor: c.surface }]}>
      {fields.map(({ label, value }) => {
        if (value === null) return null;
        const { text, unverified } = splitUnverified(value);
        return (
          <View key={label} style={styles.field}>
            <View style={styles.row}>
              <Text variant="label" color="textSecondary">
                {label}
              </Text>
              {unverified && <UnverifiedTag />}
            </View>
            <Text>{text}</Text>
          </View>
        );
      })}
    </View>
  );
}

function UnverifiedTag() {
  const { colors: c } = useTheme();
  return (
    <Text
      variant="caption"
      color="warning"
      style={[styles.tag, { borderColor: c.warning }]}
      accessibilityLabel="Bu metin henüz kaynakla doğrulanmadı"
    >
      Doğrulanmadı
    </Text>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

function formatCoordinate(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`;
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  hero: {
    height: 220,
    overflow: "hidden",
  },
  body: {
    padding: spacing.lg,
    gap: spacing.md,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  intro: {
    gap: spacing.xs,
  },
  flex: {
    flex: 1,
  },
  mono: {
    fontFamily: fontFamily.mono,
  },
  centerText: {
    textAlign: "center",
  },
  underline: {
    textDecorationLine: "underline",
  },
  access: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  tile: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xxs,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabs: {
    flexDirection: "row",
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    borderBottomWidth: 2,
    marginBottom: -StyleSheet.hairlineWidth,
  },
  panel: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  relation: {
    minHeight: touchTarget.min,
    paddingVertical: spacing.xs,
    gap: spacing.xxs,
  },
  tips: {
    gap: spacing.sm,
  },
  tip: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tipIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  kv: {
    gap: spacing.sm,
  },
  kvRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  kvLabel: {
    width: 128,
  },
  player: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xl,
  },
  playButton: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  inscription: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  field: {
    gap: spacing.xxs,
  },
  tag: {
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
});
