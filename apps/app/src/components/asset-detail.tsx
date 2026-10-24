import Ionicons from "@expo/vector-icons/Ionicons";
import type {
  AccessibilityStatus,
  AssetDetail,
  AssetRelationsResponse,
  AssetFact,
  Confidence,
  InscriptionV2,
  SourceRef,
  TimelineEvent,
  VisitorTipV2,
} from "@vagabonds/contracts";
import {
  ConfidenceBadge,
  fontFamily,
  legendVerdictLabel,
  radius,
  SourceNote,
  spacing,
  Text,
  touchTarget,
  useTheme,
} from "@vagabonds/ui";
import { Link } from "expo-router";
import { useState, type ComponentProps, type PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { toggleCapsule, useCapsulePlayer } from "@/audio/capsule-player";
import { AssetImage } from "@/components/asset-image";
import { BuildingIllustration } from "@/components/building-illustration";
import { CAPSULE_SECONDS, captionAt, capsuleForSoundKey, capsules, formatSeconds } from "@/content/capsules";
import { useAssetRelations, type ResourceWithRetry } from "@/data";
import { transliterationLanguage } from "@/lib/language";
import { useA11ySettings } from "@/settings/a11y-settings";

type Tab = "story" | "tips" | "access";

const tabs: Array<{ key: Tab; label: string }> = [
  { key: "story", label: "Hikâye" },
  { key: "tips", label: "Ziyaretçi Notları" },
  { key: "access", label: "Ulaşım" },
];

/**
 * Eser kartı (modules 6 and 8). Physical access sits at the top. Visitor notes
 * open first when there are any (field notes first, encyclopedia second);
 * most records have none yet, so those open on the story.
 *
 * Everything that is not certain carries a confidence badge, and every claim
 * shows the book and pages it comes from.
 */
export function AssetDetailView({ asset }: { asset: AssetDetail }) {
  const { colors: c } = useTheme();
  const [tab, setTab] = useState<Tab>(asset.visitorTips.length > 0 ? "tips" : "story");
  const [coverFailed, setCoverFailed] = useState(false);
  // Fetched here, not in the story tab, so switching tabs does not refetch or lose it.
  const relations = useAssetRelations(asset.id);
  const meta = [asset.datingDisplay, asset.type.label, `${asset.district}, ${asset.city.label}`].filter(Boolean).join(" · ");

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.hero}>
        {/* The drawing stays underneath; a photo that is missing or fails to load is removed, so it shows. */}
        <BuildingIllustration mode="now" id={`hero-${asset.id}`} />
        {asset.cover && !coverFailed && (
          <AssetImage media={asset.cover} style={styles.heroImage} onError={() => setCoverFailed(true)} />
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.intro}>
          <Text variant="title" headingLevel={1}>
            {asset.name}
          </Text>
          {asset.subtitle && <Text color="textSecondary">{asset.subtitle}</Text>}
          <Text variant="caption" color="textSecondary" style={styles.mono}>
            {meta}
          </Text>
        </View>

        <View style={styles.access} accessibilityLabel="Fiziksel erişim" accessibilityRole="summary">
          <AccessTile icon="trending-up-outline" title="Rampa" status={asset.accessibility.ramp} />
          <AccessTile icon="walk-outline" title="Basamaksız giriş" status={asset.accessibility.stepFree} />
        </View>

        <View accessibilityRole="tablist" style={[styles.tabs, { borderBottomColor: c.border }]}>
          {tabs.map(({ key, label }) => {
            const on = key === tab;
            return (
              <Pressable
                key={key}
                nativeID={`tab-${key}`}
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

        <View role="tabpanel" aria-labelledby={`tab-${tab}`} style={styles.panel}>
          {tab === "story" && <Story asset={asset} relations={relations} />}
          {tab === "tips" && <Tips tips={asset.visitorTips} />}
          {tab === "access" && <Access asset={asset} />}
        </View>

        <MiniPlayer soundKey={asset.ambientSound?.key ?? null} />
      </View>
    </ScrollView>
  );
}

const accessStatus: Record<AccessibilityStatus, { short: string; spoken: string }> = {
  yes: { short: "Var", spoken: "var" },
  partial: { short: "Kısmen", spoken: "kısmen var" },
  no: { short: "Yok", spoken: "yok" },
  // "unknown" means nobody has checked; it must never read as "accessible".
  unknown: { short: "Bilgi yok", spoken: "bilgi yok" },
};

/** Says the state in words, so it never depends on the icon or its color alone. */
function AccessTile({
  icon,
  title,
  status,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  title: string;
  status: AccessibilityStatus;
}) {
  const { colors: c } = useTheme();
  const color = status === "yes" ? c.primary : status === "no" ? c.warning : c.textSecondary;
  return (
    <View
      style={[styles.tile, { backgroundColor: c.surface, borderColor: c.border }]}
      accessible
      accessibilityLabel={`${title}: ${accessStatus[status].spoken}`}
    >
      <Ionicons name={icon} size={22} color={color} />
      <Text variant="label">{accessStatus[status].short}</Text>
      <Text variant="caption" color="textSecondary" style={styles.centerText}>
        {title}
      </Text>
    </View>
  );
}

function Story({ asset, relations }: { asset: AssetDetail; relations: ResourceWithRetry<AssetRelationsResponse | null> }) {
  return (
    <>
      <Text>{asset.summary}</Text>
      {asset.accessibility.audioDescription && (
        <Section title="Mekânı tanı">
          <Text>{asset.accessibility.audioDescription}</Text>
        </Section>
      )}
      <Identity asset={asset} />
      {asset.sections.map((section) => (
        <Section key={section.id} title={section.title ?? "Tarihçe"} confidence={section.confidence}>
          <Text>{section.body}</Text>
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
          <Text variant="caption" color="textSecondary">
            Halk arasında anlatılanlar. Tarihî bilgi olarak değil, rivayet olarak okunmalı.
          </Text>
          {asset.legends.map((legend) => (
            <Block key={legend.id}>
              <Text variant="label">{legend.title}</Text>
              <View style={styles.row}>
                <ConfidenceBadge confidence={{ code: "legend", label: "Rivayet" }} />
                <Text variant="caption" color="textSecondary">
                  {legendVerdictLabel[legend.verdict]}
                </Text>
              </View>
              <Text>{legend.body}</Text>
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
      <RelatedAssets relations={relations} />
      {asset.sources.length > 0 && (
        <Section title="Kaynakça">
          <SourceNote sources={asset.sources} />
        </Section>
      )}
    </>
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
          <Text>{dating.display}</Text>
          {dating.basis && (
            <Text variant="caption" color="textSecondary">{`Dayanak: ${dating.basis}`}</Text>
          )}
        </IdentityRow>
      )}
      {founder && (
        <IdentityRow label="Banî" confidence={founder.confidence} sources={founder.sources}>
          <Text>{founder.name}</Text>
          {/* The row is already labelled "Banî"; only show a role that says something else. */}
          {founder.role && founder.role.toLocaleLowerCase("tr") !== "banî" && (
            <Text variant="caption" color="textSecondary">
              {founder.role}
            </Text>
          )}
        </IdentityRow>
      )}
      {architect && (architectName || candidates.length > 0) && (
        <IdentityRow label="Mimar" confidence={architect.confidence} sources={architect.sources}>
          {architectName ? (
            <Text>{architectName}</Text>
          ) : (
            <>
              <Text variant="caption" color="textSecondary">
                Kesin olarak bilinmiyor. Kaynaklarda adı geçenler:
              </Text>
              {candidates.map((candidate) => (
                <Text key={candidate.name}>
                  {candidate.note ? `• ${candidate.name} (${candidate.note})` : `• ${candidate.name}`}
                </Text>
              ))}
            </>
          )}
        </IdentityRow>
      )}
      {waqf?.name && (
        <IdentityRow label="Vakıf" confidence={waqf.confidence} sources={waqf.sources}>
          <Text>{waqf.name}</Text>
          {waqf.conditions && <Text>{`Vakfiye şartı: ${waqf.conditions}`}</Text>}
          {waqf.deedExcerpt && <Text>{`Vakfiyeden: “${waqf.deedExcerpt}”`}</Text>}
          {waqf.landNote && (
            <Text variant="caption" color="textSecondary">
              {waqf.landNote}
            </Text>
          )}
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
  return (
    <Block>
      <View style={styles.row}>
        <Text variant="label" color="textSecondary">
          {label}
        </Text>
        {confidence && <ConfidenceBadge confidence={confidence} />}
      </View>
      {children}
      <SourceNote sources={sources} />
    </Block>
  );
}

function FactRow({ fact }: { fact: AssetFact }) {
  const value = [fact.value, fact.unit].filter(Boolean).join(" ");
  return (
    <View style={styles.fact}>
      <View style={styles.row}>
        <Text color="textSecondary">{fact.label}</Text>
        {value !== "" && <Text variant="label">{value}</Text>}
        <ConfidenceBadge confidence={fact.confidence} />
      </View>
      {fact.note && (
        <Text variant="caption" color="textSecondary">
          {fact.note}
        </Text>
      )}
      <SourceNote compact sources={fact.sources} />
    </View>
  );
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  const when = event.year !== null ? String(event.year) : (event.date ?? event.hijri ?? "");
  return (
    <View style={styles.timelineRow}>
      <Text variant="data" color="primary" style={styles.year}>
        {when}
      </Text>
      <View style={styles.timelineBody}>
        <Text>{event.title}</Text>
        <View style={styles.row}>
          <Text variant="caption" color="textSecondary">
            {event.type.label}
          </Text>
          <ConfidenceBadge confidence={event.confidence} />
        </View>
        {event.note && (
          <Text variant="caption" color="textSecondary">
            {event.note}
          </Text>
        )}
        <SourceNote compact sources={event.sources} />
      </View>
    </View>
  );
}

function RelatedAssets({ relations }: { relations: ResourceWithRetry<AssetRelationsResponse | null> }) {
  const { colors: c } = useTheme();

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
                  <Text variant="label" color="primary" style={styles.underline}>
                    {relation.asset.name}
                  </Text>
                </Pressable>
              </Link>
              <View style={styles.row}>
                <Text variant="caption" color="textSecondary">
                  {relation.type.label}
                </Text>
                <ConfidenceBadge confidence={relation.confidence} />
              </View>
              <Text variant="caption" color="textSecondary">
                {relation.description}
              </Text>
              <SourceNote compact sources={relation.sources} />
            </View>
          ))}
          {relations.data!.items.length === 0 && (
            <Text variant="caption" color="textSecondary">
              Henüz yayında bağlantılı eser yok.
            </Text>
          )}
          {relations.data!.unavailableCount > 0 && (
            <Text variant="caption" color="textSecondary">
              {`+${relations.data!.unavailableCount} bağlantılı eser yakında eklenecek.`}
            </Text>
          )}
        </>
      )}
    </Section>
  );
}

const tipOrigin: Record<VisitorTipV2["origin"], string> = {
  field_visit: "Saha ziyareti",
  visitor_reviews_summary: "Ziyaretçi yorumlarından özet",
  official: "Resmî bilgi",
};

const tipAccents = ["warning", "highlight", "primary", "success"] as const;

function Tips({ tips }: { tips: VisitorTipV2[] }) {
  const { colors: c } = useTheme();
  if (tips.length === 0) return <Text color="textSecondary">Bu eser için henüz ziyaretçi notu yok.</Text>;

  return (
    <View accessibilityRole="list" style={styles.tips}>
      {tips.map((tip, i) => {
        const accent = c[tipAccents[i % tipAccents.length] ?? "primary"];
        const meta = [tipOrigin[tip.origin], tip.collectedAt && formatDate(tip.collectedAt)].filter(Boolean).join(" · ");
        return (
          <View key={`${tip.origin}-${tip.text}`} style={[styles.tip, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[styles.tipIcon, { backgroundColor: c.surfaceRaised }]}>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={16}
                color={accent}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            </View>
            <View style={styles.flex}>
              <Text>{tip.text}</Text>
              <Text variant="caption" color="textSecondary">
                {meta}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Access({ asset }: { asset: AssetDetail }) {
  const { colors: c } = useTheme();
  const a11y = asset.accessibility;
  const coords = asset.coordinates;
  const rows: Array<{ label: string; value: string; spoken?: string; mono?: boolean }> = [
    ...(coords
      ? [
          {
            label: "Konum",
            value: `${formatCoordinate(coords.lat, "K", "G")} · ${formatCoordinate(coords.lng, "D", "B")}${coords.verified ? "" : " (yaklaşık)"}`,
            spoken: `Enlem ${coords.lat}, boylam ${coords.lng}${coords.verified ? "" : ", yaklaşık"}`,
            mono: true,
          },
        ]
      : []),
    ...(asset.address ? [{ label: "Adres", value: asset.address }] : []),
    { label: "Tekerlekli sandalye", value: accessStatus[a11y.wheelchair].short },
    { label: "Basamaksız giriş", value: accessStatus[a11y.stepFree].short },
    { label: "Rampa", value: accessStatus[a11y.ramp].short },
    { label: "Engelli tuvaleti", value: accessStatus[a11y.toilet].short },
    ...(asset.visit.durationMin ? [{ label: "Ziyaret süresi", value: `yaklaşık ${asset.visit.durationMin} dk` }] : []),
    ...(asset.visit.entranceFee ? [{ label: "Giriş ücreti", value: asset.visit.entranceFee }] : []),
  ];

  return (
    <View style={styles.kv}>
      {rows.map((row) => (
        <View
          key={row.label}
          style={[styles.kvRow, { borderBottomColor: c.border }]}
          accessible
          accessibilityLabel={`${row.label}: ${row.spoken ?? row.value}`}
        >
          <Text variant="caption" color="textSecondary" style={styles.kvLabel}>
            {row.label}
          </Text>
          <Text style={[styles.flex, row.mono && styles.mono]}>{row.value}</Text>
        </View>
      ))}
      {a11y.notes && <Text>{a11y.notes}</Text>}
      {asset.visit.notes && <Text>{asset.visit.notes}</Text>}
      {!a11y.verified && (
        <Text variant="caption" color="textSecondary">
          Erişim bilgileri yerinde doğrulanmadı. Gitmeden önce teyit etmeni öneririz.
        </Text>
      )}
    </View>
  );
}

/** Plays the sound capsule for the asset's ambient sound; hidden when none fits yet. */
function MiniPlayer({ soundKey }: { soundKey: string | null }) {
  const { colors: c } = useTheme();
  const { settings } = useA11ySettings();
  const player = useCapsulePlayer();
  const type = soundKey ? capsuleForSoundKey(soundKey) : undefined;
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
        {/* Only captions are announced; a counter that ticks every second would talk over everything. */}
        <Text
          variant="caption"
          colorValue={c.background}
          accessibilityLiveRegion={mine && settings.captions ? "polite" : "none"}
        >
          {line}
        </Text>
      </View>
    </View>
  );
}

/** A section heading with the confidence badge beside it, wrapping under it on narrow screens. */
function Section({ title, confidence = null, children }: PropsWithChildren<{ title: string; confidence?: Confidence | null }>) {
  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <Text variant="heading" headingLevel={2}>
          {title}
        </Text>
        {confidence && <ConfidenceBadge confidence={confidence} />}
      </View>
      {children}
    </View>
  );
}

function Block({ children }: PropsWithChildren) {
  const { colors: c } = useTheme();
  return <View style={[styles.block, { borderColor: c.border, backgroundColor: c.surface }]}>{children}</View>;
}

function InscriptionBlock({ inscription }: { inscription: InscriptionV2 }) {
  const fields = [
    {
      label: "Transkripsiyon",
      value: inscription.transliteration,
      language: transliterationLanguage(inscription.language),
    },
    { label: "Günümüz Türkçesi", value: inscription.translation, language: undefined },
    { label: "Not", value: inscription.note, language: undefined },
  ];
  const date = [inscription.hijriYear && `H. ${inscription.hijriYear}`, inscription.gregorian].filter(Boolean).join(" / ");

  return (
    <Block>
      {inscription.location && <Text variant="label">{inscription.location}</Text>}
      {date !== "" && (
        <Text variant="data" color="textSecondary">
          {date}
        </Text>
      )}
      {fields.map(({ label, value, language }) =>
        value === null ? null : (
          <View key={label} style={styles.field}>
            <Text variant="label" color="textSecondary">
              {label}
            </Text>
            <Text language={language}>{value}</Text>
          </View>
        ),
      )}
      <SourceNote sources={inscription.sources} />
    </Block>
  );
}

/** `iso` is a date without a time ("2025-06-01"); read as UTC so it never shifts a day west of Greenwich. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
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
  heroImage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    height: "100%",
    // The hero has a fixed height; the photo is cropped to it around its focal point.
    aspectRatio: undefined,
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
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
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  block: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
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
  field: {
    gap: spacing.xxs,
  },
});
