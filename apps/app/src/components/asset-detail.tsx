import Ionicons from "@expo/vector-icons/Ionicons";
import type { AccessibilityStatus, AssetDetail, InscriptionV2 } from "@vagabonds/contracts";
import { radius, spacing, touchTarget, typography } from "@vagabonds/ui";
import { Link } from "expo-router";
import type { ComponentProps, PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AssetImage } from "@/components/asset-image";
import { useAssetRelations } from "@/data";
import { useColors } from "@/theme";

const MAX_CONTENT_WIDTH = 720;

/** Read-only detail of one asset. */
export function AssetDetailView({ asset }: { asset: AssetDetail }) {
  const c = useColors();
  const a11y = asset.accessibility;

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      {asset.cover && <AssetImage media={asset.cover} style={styles.cover} />}

      <View style={styles.intro}>
        <Text accessibilityRole="header" style={[typography.title, { color: c.text }]}>
          {asset.name}
        </Text>
        {asset.subtitle && <Text style={[typography.bodyLarge, { color: c.textSecondary }]}>{asset.subtitle}</Text>}
        <Text style={[typography.label, { color: c.primary }]}>
          {asset.type.label} · {asset.district}, {asset.city.label}
        </Text>
        {asset.datingDisplay && (
          <Text style={[typography.body, { color: c.textSecondary }]}>{asset.datingDisplay}</Text>
        )}
      </View>

      <Body>{asset.summary}</Body>

      {a11y.audioDescription && (
        <Section title="Mekânı tanı">
          <Body>{a11y.audioDescription}</Body>
        </Section>
      )}

      {asset.sections.map((section) => (
        <Section key={section.id} title={section.title ?? "Tarihçe"}>
          <Body>{section.body}</Body>
        </Section>
      ))}

      {asset.inscriptions.length > 0 && (
        <Section title="Kitabeler">
          {asset.inscriptions.map((inscription) => (
            <InscriptionBlock key={inscription.id} inscription={inscription} />
          ))}
        </Section>
      )}

      <Section title="Erişim">
        <AccessibilityRow label="Tekerlekli sandalye" status={a11y.wheelchair} />
        <AccessibilityRow label="Basamaksız giriş" status={a11y.stepFree} />
        <AccessibilityRow label="Rampa" status={a11y.ramp} />
        <AccessibilityRow label="Engelli tuvaleti" status={a11y.toilet} />
        {a11y.notes && <Body>{a11y.notes}</Body>}
        {!a11y.verified && (
          <Caption>Bu bilgiler yerinde doğrulanmadı. Gitmeden önce teyit etmeni öneririz.</Caption>
        )}
      </Section>

      <RelatedAssets id={asset.id} />

      {asset.visitorTips.length > 0 && (
        <Section title="Ziyaretçi notları">
          {asset.visitorTips.map((tip, index) => (
            <Body key={index}>{tip.text}</Body>
          ))}
        </Section>
      )}

      {asset.coordinates && (
        <Section title="Konum">
          {asset.address && <Body>{asset.address}</Body>}
          <Text
            style={[typography.data, { color: c.text }]}
            accessibilityLabel={`Enlem ${asset.coordinates.lat}, boylam ${asset.coordinates.lng}`}
          >
            {formatCoordinate(asset.coordinates.lat, "K", "G")} · {formatCoordinate(asset.coordinates.lng, "D", "B")}
          </Text>
          {!asset.coordinates.verified && <Caption>Konum yaklaşık; yerinde doğrulanmadı.</Caption>}
        </Section>
      )}
    </ScrollView>
  );
}

function RelatedAssets({ id }: { id: string }) {
  const c = useColors();
  const relations = useAssetRelations(id);

  // The detail is useful without its links, so a failed request only hides this section.
  if (relations.status === "error" || (relations.status === "success" && relations.data === null)) return null;

  return (
    <Section title="Bağlantılı eserler">
      {relations.status === "loading" ? (
        <ActivityIndicator color={c.primary} accessibilityLabel="Bağlantılı eserler yükleniyor" />
      ) : (
        <>
          {relations.data!.items.map((relation) => (
            <Link
              key={`${relation.asset.id}-${relation.type.code}`}
              href={{ pathname: "/monuments/[id]", params: { id: relation.asset.id } }}
              asChild
            >
              <Pressable accessibilityRole="link" style={styles.relation}>
                <Text style={[typography.label, styles.link, { color: c.primary }]}>{relation.asset.name}</Text>
                <Text style={[typography.caption, { color: c.textSecondary }]}>
                  {relation.type.label} · {relation.description}
                </Text>
              </Pressable>
            </Link>
          ))}
          {relations.data!.items.length === 0 && <Caption>Henüz yayında bağlantılı eser yok.</Caption>}
          {relations.data!.unavailableCount > 0 && (
            <Caption>{`+${relations.data!.unavailableCount} bağlantılı eser yakında eklenecek.`}</Caption>
          )}
        </>
      )}
    </Section>
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

function Caption({ children }: { children: string }) {
  const c = useColors();
  return <Text style={[typography.caption, { color: c.textSecondary }]}>{children}</Text>;
}

const accessibilityStatus: Record<
  AccessibilityStatus,
  { label: string; icon: ComponentProps<typeof Ionicons>["name"] }
> = {
  yes: { label: "var", icon: "checkmark-circle" },
  partial: { label: "kısmen", icon: "remove-circle" },
  no: { label: "yok", icon: "close-circle" },
  // "unknown" means nobody has checked; it must never read as "accessible".
  unknown: { label: "bilgi yok", icon: "help-circle" },
};

/** Says the state in words, so it never depends on the icon or its color alone. */
function AccessibilityRow({ label, status }: { label: string; status: AccessibilityStatus }) {
  const c = useColors();
  const { label: statusLabel, icon } = accessibilityStatus[status];
  return (
    <View style={styles.row}>
      <Ionicons
        name={icon}
        size={24}
        color={status === "yes" ? c.primary : c.textSecondary}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text style={[typography.body, { color: c.text }]}>
        {label}: {statusLabel}
      </Text>
    </View>
  );
}

function InscriptionBlock({ inscription }: { inscription: InscriptionV2 }) {
  const c = useColors();
  const fields = [
    { label: "Transkripsiyon", value: inscription.transliteration },
    { label: "Günümüz Türkçesi", value: inscription.translation },
    { label: "Not", value: inscription.note },
  ];
  const date = [inscription.hijriYear && `H. ${inscription.hijriYear}`, inscription.gregorian]
    .filter(Boolean)
    .join(" / ");

  return (
    <View style={[styles.inscription, { borderColor: c.border }]}>
      {inscription.location && <Text style={[typography.label, { color: c.text }]}>{inscription.location}</Text>}
      {date !== "" && <Text style={[typography.data, { color: c.textSecondary }]}>{date}</Text>}
      {fields.map(({ label, value }) =>
        value === null ? null : (
          <View key={label} style={styles.field}>
            <Text style={[typography.label, { color: c.textSecondary }]}>{label}</Text>
            <Body>{value}</Body>
          </View>
        ),
      )}
    </View>
  );
}

function formatCoordinate(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`;
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
    padding: spacing.lg,
    gap: spacing.xl,
  },
  cover: {
    borderRadius: radius.lg,
    maxHeight: 420,
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
    gap: spacing.sm,
  },
  relation: {
    minHeight: touchTarget.min,
    paddingVertical: spacing.xs,
    gap: spacing.xxs,
  },
  link: {
    textDecorationLine: "underline",
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
});
