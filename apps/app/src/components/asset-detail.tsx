import Ionicons from "@expo/vector-icons/Ionicons";
import type {
  AccessibilityStatus,
  AssetDetail,
  AssetFact,
  Confidence,
  InscriptionV2,
  SourceRef,
  TimelineEvent,
} from "@vagabonds/contracts";
import { radius, spacing, touchTarget, typography } from "@vagabonds/ui";
import { Link } from "expo-router";
import type { ComponentProps, PropsWithChildren, ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AssetImage } from "@/components/asset-image";
import { ConfidenceBadge, HeadingWithBadge, LegendBadge, SourceLine, SourceNote } from "@/components/provenance";
import { useAssetRelations } from "@/data";
import { languageProps, transliterationLanguage } from "@/lib/language";
import { useColors } from "@/theme";

const MAX_CONTENT_WIDTH = 720;

/**
 * Read-only detail of one asset. Everything that is not certain carries a badge,
 * and every claim shows the book and pages it comes from.
 */
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
      </View>

      <Body>{asset.summary}</Body>

      <Identity asset={asset} />

      {a11y.audioDescription && (
        <Section title="Mekânı tanı">
          <Body>{a11y.audioDescription}</Body>
        </Section>
      )}

      {asset.sections.map((section) => (
        <Section key={section.id} title={section.title ?? "Tarihçe"} confidence={section.confidence}>
          <Body>{section.body}</Body>
          <SourceNote sources={section.sources} />
        </Section>
      ))}

      {asset.facts.length > 0 && (
        <Section title="Bilgiler">
          {asset.facts.map((fact) => (
            <FactRow key={fact.key} fact={fact} />
          ))}
        </Section>
      )}

      {asset.timeline.length > 0 && (
        <Section title="Zaman çizelgesi">
          {asset.timeline.map((event) => (
            <TimelineRow key={event.id} event={event} />
          ))}
        </Section>
      )}

      {asset.legends.length > 0 && (
        <Section title="Rivayetler">
          <Caption>Halk arasında anlatılanlar. Tarihî bilgi olarak değil, rivayet olarak okunmalı.</Caption>
          {asset.legends.map((legend) => (
            <Block key={legend.id}>
              <Text style={[typography.label, { color: c.text }]}>{legend.title}</Text>
              <LegendBadge verdict={legend.verdict} />
              <Body>{legend.body}</Body>
              <SourceNote sources={legend.sources} />
            </Block>
          ))}
        </Section>
      )}

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

      {asset.sources.length > 0 && (
        <Section title="Kaynakça">
          {asset.sources.map((source) => (
            <SourceLine key={source.sourceId} source={source} />
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

/** Künye: when it was built, who had it built, who designed it, which waqf kept it. */
function Identity({ asset }: { asset: AssetDetail }) {
  const { dating, founder, architect, waqf } = asset;
  const architectName = architect?.name ?? null;
  const candidates = architect?.candidates ?? [];
  if (!dating?.display && !founder && !architectName && candidates.length === 0 && !waqf?.name) return null;

  return (
    <Section title="Künye">
      {dating?.display && (
        <IdentityRow label="Tarih" confidence={dating.confidence} sources={dating.sources}>
          <Body>{dating.display}</Body>
          {dating.basis && <Caption>{`Dayanak: ${dating.basis}`}</Caption>}
        </IdentityRow>
      )}
      {founder && (
        <IdentityRow label="Banî" confidence={founder.confidence} sources={founder.sources}>
          <Body>{founder.name}</Body>
          {/* The row is already labelled "Banî"; only show a role that says something else. */}
          {founder.role && founder.role.toLocaleLowerCase("tr") !== "banî" && <Caption>{founder.role}</Caption>}
        </IdentityRow>
      )}
      {architect && (architectName || candidates.length > 0) && (
        <IdentityRow label="Mimar" confidence={architect.confidence} sources={architect.sources}>
          {architectName ? (
            <Body>{architectName}</Body>
          ) : (
            <>
              <Caption>Kesin olarak bilinmiyor. Kaynaklarda adı geçenler:</Caption>
              {candidates.map((candidate) => (
                <Body key={candidate.name}>
                  {candidate.note ? `• ${candidate.name} (${candidate.note})` : `• ${candidate.name}`}
                </Body>
              ))}
            </>
          )}
        </IdentityRow>
      )}
      {waqf?.name && (
        <IdentityRow label="Vakıf" confidence={waqf.confidence} sources={waqf.sources}>
          <Body>{waqf.name}</Body>
          {waqf.conditions && <Body>{`Vakfiye şartı: ${waqf.conditions}`}</Body>}
          {waqf.deedExcerpt && <Body>{`Vakfiyeden: “${waqf.deedExcerpt}”`}</Body>}
          {waqf.landNote && <Caption>{waqf.landNote}</Caption>}
        </IdentityRow>
      )}
    </Section>
  );
}

function IdentityRow({
  label,
  confidence,
  sources,
  children,
}: PropsWithChildren<{ label: string; confidence: Confidence | null; sources: SourceRef[] }>) {
  const c = useColors();
  return (
    <Block>
      <View style={styles.labelRow}>
        <Text style={[typography.label, { color: c.textSecondary }]}>{label}</Text>
        <ConfidenceBadge confidence={confidence} />
      </View>
      {children}
      <SourceNote sources={sources} />
    </Block>
  );
}

function FactRow({ fact }: { fact: AssetFact }) {
  const c = useColors();
  const value = [fact.value, fact.unit].filter(Boolean).join(" ");
  return (
    <View style={styles.fact}>
      <View style={styles.labelRow}>
        <Text style={[typography.body, { color: c.textSecondary }]}>{fact.label}</Text>
        {value !== "" && <Text style={[typography.label, { color: c.text }]}>{value}</Text>}
        <ConfidenceBadge confidence={fact.confidence} />
      </View>
      {fact.note && <Caption>{fact.note}</Caption>}
      <SourceNote sources={fact.sources} compact />
    </View>
  );
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  const c = useColors();
  const when = event.year !== null ? String(event.year) : (event.date ?? event.hijri ?? "");
  return (
    <View style={styles.timelineRow}>
      <Text style={[typography.data, styles.year, { color: c.primary }]}>{when}</Text>
      <View style={styles.timelineBody}>
        <Text style={[typography.body, { color: c.text }]}>{event.title}</Text>
        <View style={styles.labelRow}>
          <Text style={[typography.caption, { color: c.textSecondary }]}>{event.type.label}</Text>
          <ConfidenceBadge confidence={event.confidence} />
        </View>
        {event.note && <Caption>{event.note}</Caption>}
        <SourceNote sources={event.sources} compact />
      </View>
    </View>
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
            <View key={`${relation.asset.id}-${relation.type.code}`} style={styles.relation}>
              <Link href={{ pathname: "/monuments/[id]", params: { id: relation.asset.id } }} asChild>
                <Pressable accessibilityRole="link" style={styles.relationLink}>
                  <Text style={[typography.label, styles.link, { color: c.primary }]}>{relation.asset.name}</Text>
                </Pressable>
              </Link>
              <View style={styles.labelRow}>
                <Text style={[typography.caption, { color: c.textSecondary }]}>{relation.type.label}</Text>
                <ConfidenceBadge confidence={relation.confidence} />
              </View>
              <Caption>{relation.description}</Caption>
              <SourceNote sources={relation.sources} />
            </View>
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

function Section({ title, confidence = null, children }: PropsWithChildren<{ title: string; confidence?: Confidence | null }>) {
  return (
    <View style={styles.section}>
      <HeadingWithBadge title={title} confidence={confidence} />
      {children}
    </View>
  );
}

function Block({ children }: { children: ReactNode }) {
  const c = useColors();
  return <View style={[styles.block, { borderColor: c.border }]}>{children}</View>;
}

/** `lang`: BCP 47 tag when the text is not Turkish, so screen readers switch voice. */
function Body({ children, lang }: { children: string; lang?: string }) {
  const c = useColors();
  return (
    <Text style={[typography.body, { color: c.text }]} {...languageProps(lang)}>
      {children}
    </Text>
  );
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
    {
      label: "Transkripsiyon",
      value: inscription.transliteration,
      lang: transliterationLanguage(inscription.language),
    },
    { label: "Günümüz Türkçesi", value: inscription.translation, lang: undefined },
    { label: "Not", value: inscription.note, lang: undefined },
  ];
  const date = [inscription.hijriYear && `H. ${inscription.hijriYear}`, inscription.gregorian]
    .filter(Boolean)
    .join(" / ");

  return (
    <Block>
      {inscription.location && <Text style={[typography.label, { color: c.text }]}>{inscription.location}</Text>}
      {date !== "" && <Text style={[typography.data, { color: c.textSecondary }]}>{date}</Text>}
      {fields.map(({ label, value, lang }) =>
        value === null ? null : (
          <View key={label} style={styles.field}>
            <Text style={[typography.label, { color: c.textSecondary }]}>{label}</Text>
            <Body lang={lang}>{value}</Body>
          </View>
        ),
      )}
      <SourceNote sources={inscription.sources} />
    </Block>
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
  block: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  labelRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
  fact: {
    gap: spacing.xxs,
  },
  timelineRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  year: {
    minWidth: 48,
  },
  timelineBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  relation: {
    gap: spacing.xxs,
  },
  relationLink: {
    minHeight: touchTarget.min,
    justifyContent: "center",
  },
  link: {
    textDecorationLine: "underline",
  },
  field: {
    gap: spacing.xxs,
  },
});
