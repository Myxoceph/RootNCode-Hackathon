import Ionicons from "@expo/vector-icons/Ionicons";
import type { Inscription, Monument } from "@vagabonds/contracts";
import { radius, spacing, touchTarget, typography } from "@vagabonds/ui";
import { Link } from "expo-router";
import type { PropsWithChildren } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { monumentTypeLabel, relationTypeLabel, splitUnverified } from "@/lib/labels";
import { useColors } from "@/theme";

/** Read-only detail of one monument. */
export function MonumentDetail({ monument }: { monument: Monument }) {
  const c = useColors();
  const approvedTips = monument.visitorTips.filter((t) => t.status === "approved");

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={[typography.title, { color: c.text }]}>
          {monument.name}
        </Text>
        <Text style={[typography.label, { color: c.primary }]}>
          {monumentTypeLabel[monument.monumentType]} · {monument.city}
        </Text>
        <Text style={[typography.body, { color: c.textSecondary }]}>{monument.period}</Text>
      </View>

      <Section title="Mekânı tanı">
        <Body>{monument.accessibilityAudioDesc}</Body>
      </Section>

      <Section title="Erişim">
        <Availability label="Rampa" available={monument.hasRamp} />
        <Availability label="Basamaksız giriş" available={monument.stepFreeAccess} />
      </Section>

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
                <Text style={[typography.label, { color: c.primary, textDecorationLine: "underline" }]}>
                  {relation.relatedMonumentName}
                </Text>
                <Text style={[typography.caption, { color: c.textSecondary }]}>
                  {relationTypeLabel[relation.relationType]}
                  {relation.note ? ` · ${relation.note}` : ""}
                </Text>
              </Pressable>
            </Link>
          ))}
        </Section>
      )}

      {approvedTips.length > 0 && (
        <Section title="Ziyaretçi notları">
          {approvedTips.map((tip) => (
            <View key={tip.id} style={styles.tip}>
              <Body>{tip.tipText}</Body>
              <Text style={[typography.caption, { color: c.textSecondary }]}>
                {new Date(tip.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
              </Text>
            </View>
          ))}
        </Section>
      )}

      <Section title="Konum">
        <Text
          style={[typography.data, { color: c.text }]}
          accessibilityLabel={`Enlem ${monument.latitude}, boylam ${monument.longitude}`}
        >
          {formatCoordinate(monument.latitude, "K", "G")} · {formatCoordinate(monument.longitude, "D", "B")}
        </Text>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  const c = useColors();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[typography.heading, { color: c.text }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Body({ children }: { children: string }) {
  const c = useColors();
  return <Text style={[typography.body, { color: c.text }]}>{children}</Text>;
}

/** Says "var" / "yok" in words, so the state never depends on the icon or its color alone. */
function Availability({ label, available }: { label: string; available: boolean }) {
  const c = useColors();
  return (
    <View style={styles.row}>
      <Ionicons
        name={available ? "checkmark-circle" : "close-circle"}
        size={24}
        color={available ? c.primary : c.textSecondary}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text style={[typography.body, { color: c.text }]}>
        {label}: {available ? "var" : "yok"}
      </Text>
    </View>
  );
}

function InscriptionBlock({ inscription }: { inscription: Inscription }) {
  const c = useColors();
  const fields = [
    { label: "Transkripsiyon", value: inscription.transcription },
    { label: "Günümüz Türkçesi", value: inscription.modernTurkish },
    { label: "Vakfiye şartı", value: inscription.waqfCondition },
  ];

  return (
    <View style={[styles.inscription, { borderColor: c.border }]}>
      {fields.map(({ label, value }) => {
        if (value === null) return null;
        const { text, unverified } = splitUnverified(value);
        return (
          <View key={label} style={styles.field}>
            <View style={styles.row}>
              <Text style={[typography.label, { color: c.textSecondary }]}>{label}</Text>
              {unverified && <UnverifiedTag />}
            </View>
            <Body>{text}</Body>
          </View>
        );
      })}
    </View>
  );
}

function UnverifiedTag() {
  const c = useColors();
  return (
    <Text
      style={[typography.caption, styles.tag, { color: c.warning, borderColor: c.warning }]}
      accessibilityLabel="Bu metin henüz kaynakla doğrulanmadı"
    >
      Doğrulanmadı
    </Text>
  );
}

function formatCoordinate(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`;
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  intro: {
    gap: spacing.xs,
  },
  section: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  relation: {
    minHeight: touchTarget.min,
    paddingVertical: spacing.xs,
    gap: spacing.xxs,
  },
  tip: {
    gap: spacing.xxs,
  },
  inscription: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
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
