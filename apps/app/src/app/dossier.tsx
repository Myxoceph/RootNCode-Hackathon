import Ionicons from "@expo/vector-icons/Ionicons";
import type { AccessibilityStatus, AssetDetail, Media, TimelineEvent } from "@vagabonds/contracts";
import { fontFamily, radius, SourceNote, spacing, Text, touchTarget, useTheme, useUi } from "@vagabonds/ui";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import Head from "expo-router/head";
import { useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AssetImage } from "@/components/asset-image";
import { ResourceView } from "@/components/resource-view";
import { useAsset } from "@/data";
import { customBlocksOf } from "@/lib/dossier-custom";
import { DOSSIER_BLOCKS, dossierAfterOf, photosByPlace } from "@/lib/dossier-photos";
import { Editable, FrameLink, useFrameEditing, useInFrame } from "@/lib/in-frame";
import { centuryOf, paragraphsOf, readableDate, readingMinutes, sentencesOf } from "@/lib/reading";
import { RichText } from "@/lib/rich-text";
import { useReducedMotion } from "@/lib/use-reduced-motion";

type IconName = ComponentProps<typeof Ionicons>["name"];

/**
 * Eserin dosyası: everything the book says about an asset, on one page to read at ease. Nothing is
 * cut: long texts are set in short paragraphs, photos break them up, each block has its own band and
 * the bar on top always says where the reader is. A block with nothing in it does not show.
 */
/** The dossier of an asset already at hand, inside a frame: the admin panel's phone preview. */
export function DossierView({ asset }: { asset: AssetDetail }) {
  const { colors: c } = useTheme();
  return (
    <View style={[styles.flex, { backgroundColor: c.background }]}>
      <TopBar asset={asset.id} />
      <Dossier asset={asset} />
    </View>
  );
}

export default function DossierScreen() {
  const { asset: id } = useLocalSearchParams<{ asset?: string }>();
  const resource = useAsset(id ?? "");
  const { colors: c } = useTheme();
  return (
    <View style={[styles.flex, { backgroundColor: c.background }]}>
      <TopBar asset={id} />
      <ResourceView resource={resource}>
        {(asset) =>
          asset === null ? (
            <View style={styles.missing}>
              <Text>Eser bulunamadı.</Text>
            </View>
          ) : (
            <>
              <Head>
                <title>{`${asset.name}: Eserin dosyası · Vagabonds`}</title>
              </Head>
              <Dossier asset={asset} />
            </>
          )
        }
      </ResourceView>
    </View>
  );
}

function TopBar({ asset }: { asset?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const frame = useInFrame();
  const back = () => {
    if (frame) frame.back();
    else if (router.canGoBack()) router.back();
    else if (asset) router.replace({ pathname: "/monuments/[id]", params: { id: asset } });
    else router.replace("/monuments");
  };
  return (
    <View style={[styles.topBar, { paddingTop: insets.top + spacing.xs }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Geri" hitSlop={6} onPress={back} style={[styles.back, { backgroundColor: c.surfaceRaised }]}>
        <Ionicons name="chevron-back" size={22} color={c.text} />
      </Pressable>
      <Text variant="label" numberOfLines={1} style={styles.flex}>
        Eserin dosyası
      </Text>
    </View>
  );
}

interface Block {
  key: string;
  title: string;
  body: ReactNode;
  /** Photos set after it. */
  photos?: Media[];
}

/** For the panel's editor: the record's field an empty block would show, and what it is called. */
const EMPTY_FIELDS: Record<string, [string, string] | undefined> = {
  identity: ["year", "Tarih ve yaptıran"],
  history: ["section", "Hikâye"],
  timeline: ["event", "Önemli tarihler"],
  people: ["person", "Kişiler"],
  waqf: ["waqf", "Vakıf"],
  inscriptions: ["inscription", "Kitabeler"],
  facts: ["fact", "Sayılar"],
  legends: ["legend", "Rivayetler"],
};

/** In the panel's editor with its samples on, an empty block still shows, to say where it would go. */
function blocksOf(asset: AssetDetail, placeholders = false): Block[] {
  const blocks = withCustom(asset, blockBodies(asset, placeholders));
  const placed = photosByPlace(asset, blocks.map((b) => b.key));
  return blocks.map((block) => ({ ...block, ...(block.key === "history" && asset.sections.length > 0 && { body: <History asset={asset} placed={placed} /> }), photos: placed.get(block.key) }));
}

/**
 * The admin's own blocks, each after the block it names, in the order they were added; one whose
 * block is not drawn follows the nearest drawn block before it. Kaynakça stays last.
 */
function withCustom(asset: AssetDetail, blocks: Block[]): Block[] {
  const out = [...blocks];
  const placed = new Map<string, number>();
  for (const custom of customBlocksOf(asset)) {
    if (!custom.title.trim() && !custom.body.trim()) continue;
    const keys = out.map((b) => b.key);
    let anchor = custom.after;
    if (!keys.includes(anchor)) {
      const at = DOSSIER_BLOCKS.indexOf(anchor as (typeof DOSSIER_BLOCKS)[number]);
      anchor = DOSSIER_BLOCKS.slice(0, at < 0 ? DOSSIER_BLOCKS.length : at + 1).reverse().find((key) => keys.includes(key)) ?? keys.filter((k) => k !== "sources").pop() ?? "";
    }
    const index = keys.indexOf(anchor) + 1 + (placed.get(anchor) ?? 0);
    placed.set(anchor, (placed.get(anchor) ?? 0) + 1);
    out.splice(index, 0, {
      key: `custom:${custom.id}`,
      title: custom.title.trim() || "Yeni bölüm",
      body: (
        <Editable field={`custom:${custom.id}`} label="Eklenen bölüm">
          {custom.body.trim() ? <RichText source={custom.body} /> : <Text color="textSecondary">Bölümün metni burada görünür.</Text>}
        </Editable>
      ),
    });
  }
  return out;
}

function blockBodies(asset: AssetDetail, placeholders: boolean): Block[] {
  const candidates: Array<[string, string, ReactNode | null]> = [
    ["identity", "Künye", identity(asset)],
    ["history", "Tarihçe", asset.sections.length > 0 ? <History asset={asset} /> : null],
    ["timeline", "Zaman çizelgesi", asset.timeline.length > 0 ? <Timeline events={asset.timeline} /> : null],
    ["people", "Kişiler", asset.people.length > 0 ? <People asset={asset} /> : null],
    ["waqf", "Vakıf", waqf(asset) && <Editable field="waqf" label="Vakıf">{waqf(asset)}</Editable>],
    ["inscriptions", "Kitabeler", asset.inscriptions.length > 0 ? <Inscriptions asset={asset} /> : null],
    ["facts", "Ölçüler", factsOf(asset).length > 0 ? <Facts asset={asset} /> : null],
    ["legends", "Rivayetler", asset.legends.length > 0 ? <Legends asset={asset} /> : null],
    ["accessibility", "Erişilebilirlik", <Editable key="access" field="access" label="Engelli erişimi"><Access asset={asset} /></Editable>],
    ["sources", "Kaynakça", asset.sources.length > 0 ? <Sources asset={asset} /> : null],
  ];
  return candidates.flatMap(([key, title, body]) => {
    if (body) return [{ key, title, body }];
    const empty = EMPTY_FIELDS[key];
    if (placeholders && empty) {
      return [{ key, title, body: <Editable field={empty[0]} label={empty[1]}><Text color="textSecondary">Henüz eklenmedi. Uygulamada bu kısım görünmez.</Text></Editable> }];
    }
    return [];
  });
}

function wordsOf(asset: AssetDetail): number {
  const texts = [...asset.sections.map((s) => s.body), ...asset.legends.map((l) => l.body), ...asset.timeline.map((e) => `${e.title} ${e.note ?? ""}`), ...asset.inscriptions.map((i) => i.translation ?? "")];
  return texts.join(" ").split(/\s+/).length;
}

function Dossier({ asset }: { asset: AssetDetail }) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const scroll = useRef<ScrollViewInstance>(null);
  const nav = useRef<ScrollViewInstance>(null);
  const positions = useRef<Record<string, number>>({});
  const chips = useRef<Record<string, number>>({});
  const navHeight = useRef(0);
  const edit = useFrameEditing();
  const placeholders = edit?.samples ?? false;
  const blocks = useMemo(() => blocksOf(asset, placeholders), [asset, placeholders]);
  const [active, setActive] = useState(blocks[0]?.key);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const line = event.nativeEvent.contentOffset.y + navHeight.current + spacing.xl;
    const current = [...blocks].reverse().find((block) => (positions.current[block.key] ?? Infinity) <= line)?.key ?? blocks[0]?.key;
    if (current && current !== active) {
      setActive(current);
      nav.current?.scrollTo({ x: Math.max(0, (chips.current[current] ?? 0) - spacing.xl), animated: !reduceMotion });
    }
  };
  const goTo = (key: string) => scroll.current?.scrollTo({ y: (positions.current[key] ?? 0) - navHeight.current, animated: !reduceMotion });

  return (
    <ScrollView ref={scroll} style={{ backgroundColor: c.background }} stickyHeaderIndices={[1]} scrollEventThrottle={32} onScroll={onScroll} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxxl }}>
      <Intro asset={asset} />

      <View
        style={[styles.nav, { backgroundColor: c.background, borderBottomColor: c.border }]}
        onLayout={(event) => {
          navHeight.current = event.nativeEvent.layout.height;
        }}
      >
        <ScrollView ref={nav} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navRow} accessibilityLabel="İçindekiler">
          {blocks.map((block) => {
            const on = block.key === active;
            return (
              <Pressable
                key={block.key}
                accessibilityRole="button"
                accessibilityLabel={`${block.title} bölümüne git`}
                aria-current={on ? "true" : undefined}
                onLayout={(event) => {
                  chips.current[block.key] = event.nativeEvent.layout.x;
                }}
                onPress={() => goTo(block.key)}
                style={[styles.tab, { borderBottomColor: on ? c.highlightMark : "transparent" }]}
              >
                <Text variant="caption" colorValue={on ? c.text : c.textSecondary} style={on ? styles.bold : styles.semibold}>
                  {block.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {blocks.map((block, index) => (
        <View
          key={block.key}
          style={[styles.band, { backgroundColor: index % 2 === 0 ? c.background : c.surface }]}
          onLayout={(event) => {
            positions.current[block.key] = event.nativeEvent.layout.y;
          }}
        >
          <View style={styles.column}>
            <View style={styles.blockHead}>
              <View style={styles.blockMark} aria-hidden>
                <Text variant="caption" color="textSecondary" style={styles.blockNumber}>
                  {String(index + 1).padStart(2, "0")}
                </Text>
                <View style={[styles.blockRule, { backgroundColor: c.highlightMark }]} />
              </View>
              <Text variant="display" headingLevel={2}>
                {block.title}
              </Text>
            </View>
            {block.body}
            {block.photos && <PlacedPhotos photos={block.photos} place={block.key} />}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

/** The page opens on words alone: what the place is, its name, and how much there is to read. */
function Intro({ asset }: { asset: AssetDetail }) {
  const minutes = readingMinutes(wordsOf(asset));
  const counts = [`~${minutes} dk okuma`, asset.sections.length > 0 ? `${asset.sections.length} bölüm` : null, asset.timeline.length > 0 ? `${asset.timeline.length} olay` : null].filter(Boolean).join("  ·  ");
  return (
    <View style={styles.intro}>
      <View style={styles.introColumn}>
        <Text variant="overline" color="textSecondary">
          {`${asset.type.label} · ${asset.district}, ${asset.city.label}`.toLocaleUpperCase("tr")}
        </Text>
        <Text variant="display" headingLevel={1}>
          {asset.name}
        </Text>
        <Text variant="caption" color="textSecondary" style={styles.semibold}>
          {counts}
        </Text>
      </View>
    </View>
  );
}

/* ───────────────────────── Text ───────────────────────── */

/** Long text set for reading: short paragraphs, the opening sentence a little stronger to skim by. */
function Prose({ text, lead = false }: { text: string; lead?: boolean }) {
  const { textScale } = useUi();
  const size = { fontSize: 17 * textScale, lineHeight: 28 * textScale };
  return (
    <View style={styles.prose}>
      {paragraphsOf(text).map((paragraph, index) => {
        const first = lead && index === 0 ? sentencesOf(paragraph)[0] : undefined;
        return (
          <Text key={index} style={size}>
            {first ? (
              <>
                <Text style={[size, styles.semibold]}>{first}</Text>
                {paragraph.slice(first.length)}
              </>
            ) : (
              paragraph
            )}
          </Text>
        );
      })}
    </View>
  );
}

function Info({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.info}>
      <Ionicons name={icon} size={20} color={c.textSecondary} style={styles.infoIcon} />
      <View style={styles.flex}>
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
        {typeof children === "string" ? <Text variant="label">{children}</Text> : children}
      </View>
    </View>
  );
}

function AssetLink({ id, name }: { id: string; name: string }) {
  const { colors: c } = useTheme();
  return (
    <FrameLink href={{ pathname: "/monuments/[id]", params: { id } }}>
      <Pressable accessibilityRole="link" style={styles.link}>
        <Text variant="label" colorValue={c.primary} style={styles.underline}>
          {name}
        </Text>
      </Pressable>
    </FrameLink>
  );
}

/* ───────────────────────── Blocks ───────────────────────── */

function identity(asset: AssetDetail): ReactNode | null {
  const { dating, founder, architect, alternateNames, address, neighborhood, parent, children } = asset;
  const rows: ReactNode[] = [];
  // The record's own words for the date; else the year it was built, as the pages show it.
  const date = dating?.display ?? (dating?.startYear != null ? String(dating.startYear) : null);
  if (dating && date) {
    rows.push(
      <Editable key="date" field="year" label="Tarih">
        <Info icon="calendar-outline" label="Tarih">
          <Text variant="label">{date}</Text>
          {dating.basis && (
            <Text variant="caption" color="textSecondary">
              {dating.basis}
            </Text>
          )}
        </Info>
      </Editable>,
    );
  }
  if (founder) {
    rows.push(
      <Editable key="founder" field="founder" label="Kim yaptırdı">
        <Info icon="person-outline" label="Banî">
          {founder.role && !/^ban[iî]$/i.test(founder.role) ? `${founder.name} (${founder.role})` : founder.name}
        </Info>
      </Editable>,
    );
  }
  if (architect?.name) {
    rows.push(
      <Editable key="architect" field="architect" label="Mimarı">
        <Info icon="construct-outline" label="Mimar">
          {architect.name}
        </Info>
      </Editable>,
    );
  }
  if (architect && architect.candidates.length > 0) {
    rows.push(
      <Editable key="candidates" field="architect:candidates" label="Mimar adayları">
      <Info icon="construct-outline" label="Mimar adayları">
        <View style={styles.tight}>
          {architect.candidates.map((one) => (
            <View key={one.name}>
              <Text variant="label">{one.name}</Text>
              {one.note && (
                <Text variant="caption" color="textSecondary">
                  {one.note}
                </Text>
              )}
            </View>
          ))}
        </View>
      </Info>
      </Editable>,
    );
  }
  if (alternateNames.length > 0) {
    rows.push(
      <Editable key="names" field="altNames" label="Başka adları">
      <Info icon="pricetag-outline" label="Diğer adları">
        <View style={styles.tight}>
          {alternateNames.map((one) => (
            <View key={one.name}>
              <Text variant="label">{one.name}</Text>
              {one.note && (
                <Text variant="caption" color="textSecondary">
                  {one.note}
                </Text>
              )}
            </View>
          ))}
        </View>
      </Info>
      </Editable>,
    );
  }
  const place = [address, neighborhood].filter(Boolean).join(", ");
  if (place) {
    rows.push(
      <Editable key="place" field="address" label="Açık adres">
        <Info icon="location-outline" label="Adres">
          {place}
        </Info>
      </Editable>,
    );
  }
  if (parent) {
    rows.push(
      <Editable key="parent" field="parent" label="Bağlı olduğu külliye">
        <Info icon="git-merge-outline" label="Bağlı olduğu yapı">
          <AssetLink id={parent.id} name={parent.name} />
        </Info>
      </Editable>,
    );
  }
  if (children.length > 0) {
    rows.push(
      <Info key="children" icon="git-branch-outline" label="Bağlı yapılar">
        <View accessibilityRole="list">
          {children.map((child) => (
            <AssetLink key={child.id} id={child.id} name={child.name} />
          ))}
        </View>
      </Info>,
    );
  }
  return rows.length > 0 ? <View style={styles.rows}>{rows}</View> : null;
}

const stems = (text: string) =>
  text
    .toLocaleLowerCase("tr")
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length >= 4)
    .map((word) => word.slice(0, 5));

/**
 * A photo for every second chapter, the one whose caption speaks of the same thing when there is one.
 * Photos set in a place of their own are left to it.
 */
function photosForChapters(asset: AssetDetail): Map<string, Media> {
  const free = asset.media.filter((m) => (m.kind === "photo" || m.kind === "archive_photo" || m.kind === "drawing") && m.key !== asset.cover?.key && !dossierAfterOf(m));
  const chosen = new Map<string, Media>();
  asset.sections.forEach((section, index) => {
    if (index % 2 === 0 || free.length === 0) return;
    const wanted = stems(`${section.title ?? ""}`);
    const at = free.findIndex((m) => stems(`${m.caption ?? ""} ${m.alt}`).some((word) => wanted.includes(word)));
    const [photo] = free.splice(Math.max(at, 0), 1);
    if (photo) chosen.set(section.id, photo);
  });
  return chosen;
}

/** Photos set in the dossier by hand, after a block or a chapter; pressing one in the editor opens its question. */
function PlacedPhotos({ photos, place }: { photos: Media[]; place: string }) {
  return (
    <Editable field={`photo-in:${place}`} label="Dosyadaki fotoğraf">
      <View style={styles.placed}>
        {photos.map((photo) => (
          <View key={photo.key} style={styles.figure}>
            <View style={[styles.figurePhoto, { aspectRatio: Math.max(photo.aspectRatio, 1) }]}>
              <AssetImage media={photo} fill />
            </View>
            {photo.caption && (
              <Text variant="caption" color="textSecondary">
                {photo.caption}
              </Text>
            )}
          </View>
        ))}
      </View>
    </Editable>
  );
}

function History({ asset, placed }: { asset: AssetDetail; placed?: Map<string, Media[]> }) {
  const { textScale } = useUi();
  const photos = useMemo(() => photosForChapters(asset), [asset]);
  return (
    <View style={styles.chapters}>
      {asset.sections.map((section) => {
        const photo = photos.get(section.id);
        return (
          <View key={section.id} style={styles.chapter}>
            {section.title && (
              <Editable field={`section:${section.id}:title`} label="Konunun başlığı">
                <Text headingLevel={3} style={[styles.chapterTitle, { fontSize: 21 * textScale, lineHeight: 28 * textScale }]}>
                  {section.title}
                </Text>
              </Editable>
            )}
            <Editable field={`section:${section.id}:body`} label="Konunun metni">
              <Prose text={section.body} lead />
            </Editable>
            <SourceNote compact sources={section.sources} />
            {placed?.get(`section:${section.id}`) && <PlacedPhotos photos={placed.get(`section:${section.id}`)!} place={`section:${section.id}`} />}
            {photo && (
              <View style={styles.figure}>
                <View style={[styles.figurePhoto, { aspectRatio: Math.max(photo.aspectRatio, 1) }]}>
                  <AssetImage media={photo} fill />
                </View>
                {photo.caption && (
                  <Text variant="caption" color="textSecondary">
                    {photo.caption}
                  </Text>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const hijriText = (hijri: string) => (/^h/i.test(hijri) ? hijri : `H. ${hijri}`);

/** Grouped by century, so a long list reads as a few short ones. */
function Timeline({ events }: { events: TimelineEvent[] }) {
  const { colors: c } = useTheme();
  const groups: Array<{ century: string | null; events: TimelineEvent[] }> = [];
  for (const event of events) {
    const century = event.year !== null ? centuryOf(event.year) : null;
    const last = groups[groups.length - 1];
    if (last && last.century === century) last.events.push(event);
    else groups.push({ century, events: [event] });
  }
  return (
    <View style={styles.centuries}>
      {groups.map((group, index) => (
        <View key={`${group.century}-${index}`} style={styles.tight}>
          {group.century && (
            <Text variant="overline" color="textSecondary">
              {group.century.toLocaleUpperCase("tr")}
            </Text>
          )}
          <View accessibilityRole="list">
            {group.events.map((event, at) => {
              const meta = [event.date ? readableDate(event.date) : null, event.hijri ? hijriText(event.hijri) : null, event.type.label !== event.title ? event.type.label : null].filter(Boolean).join("  ·  ");
              const lastOne = at === group.events.length - 1;
              return (
                <Editable key={event.id} field={`event:${event.id}`} label="Olay">
                <View style={styles.event}>
                  <Text variant="label" style={styles.eventYear}>
                    {event.year !== null ? String(event.year) : ""}
                  </Text>
                  <View style={styles.eventRail}>
                    <View style={[styles.eventDot, { backgroundColor: c.highlightMark }]} />
                    {!lastOne && <View style={[styles.eventLine, { backgroundColor: c.border }]} />}
                  </View>
                  <View style={styles.eventBody}>
                    <Text variant="label">{event.title}</Text>
                    {meta !== "" && (
                      <Text variant="caption" color="textSecondary">
                        {meta}
                      </Text>
                    )}
                    {event.note && <Text variant="caption">{event.note}</Text>}
                  </View>
                </View>
                </Editable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

function People({ asset }: { asset: AssetDetail }) {
  const { colors: c } = useTheme();
  return (
    <View accessibilityRole="list" style={styles.rows}>
      {asset.people.map((person, index) => (
        <Editable key={`${person.name}-${index}`} field={`person:${index}`} label="Kişi">
        <View style={styles.person} accessible accessibilityLabel={person.role ? `${person.name}, ${person.role}` : person.name}>
          <View style={[styles.initial, { backgroundColor: c.surfaceRaised }]}>
            <Text variant="label">{person.name.charAt(0).toLocaleUpperCase("tr")}</Text>
          </View>
          <View style={styles.flex}>
            <Text variant="label">{person.name}</Text>
            {person.role && (
              <Text variant="caption" color="textSecondary">
                {person.role}
              </Text>
            )}
          </View>
        </View>
        </Editable>
      ))}
    </View>
  );
}

function waqf(asset: AssetDetail): ReactNode | null {
  const record = asset.waqf;
  if (!record || !(record.name || record.deedDate || record.deedExcerpt || record.conditions || record.landNote)) return null;
  return <Waqf record={record} />;
}

function Waqf({ record }: { record: NonNullable<AssetDetail["waqf"]> }) {
  const { colors: c } = useTheme();
  const { textScale } = useUi();
  return (
    <View style={styles.rows}>
      {record.name && <Info icon="business-outline" label="Vakıf">{record.name}</Info>}
      {record.deedDate && <Info icon="calendar-outline" label="Vakfiye tarihi">{record.deedDate}</Info>}
      {record.deedExcerpt && (
        <View style={[styles.quote, { borderLeftColor: c.highlightMark }]}>
          <Text variant="caption" color="textSecondary">
            Vakfiyeden
          </Text>
          <Text style={[styles.quoteText, { fontSize: 19 * textScale, lineHeight: 30 * textScale }]}>{record.deedExcerpt}</Text>
        </View>
      )}
      {record.conditions && (
        <View style={styles.tight}>
          <Text variant="label" headingLevel={3}>
            Vakfın şartları
          </Text>
          <Prose text={record.conditions} />
        </View>
      )}
      {record.landNote && (
        <View style={styles.tight}>
          <Text variant="label" headingLevel={3}>
            Arazi
          </Text>
          <Prose text={record.landNote} />
        </View>
      )}
    </View>
  );
}

function Inscriptions({ asset }: { asset: AssetDetail }) {
  const { colors: c } = useTheme();
  return (
    <View accessibilityRole="list" style={styles.rows}>
      {asset.inscriptions.map((inscription) => {
        const date = [inscription.gregorian, inscription.hijriYear !== null ? `H. ${inscription.hijriYear}` : null].filter(Boolean).join("  ·  ");
        const about = [inscription.script, inscription.author].filter(Boolean).join("  ·  ");
        const camera: Href = { pathname: "/inscription", params: { asset: asset.id } };
        return (
          <Editable key={inscription.id} field={`inscription:${inscription.id}`} label="Kitabe">
          <View style={[styles.card, { backgroundColor: c.surfaceRaised }]}>
            {inscription.location && <Text variant="label">{inscription.location}</Text>}
            {(date !== "" || about !== "") && (
              <Text variant="caption" color="textSecondary">
                {[date, about].filter(Boolean).join("  ·  ")}
              </Text>
            )}
            {inscription.translation && <Prose text={inscription.translation} />}
            {inscription.transliteration && (
              <View style={styles.tight}>
                <Text variant="caption" color="textSecondary">
                  Okunuşu
                </Text>
                <Text variant="caption" style={styles.italic}>
                  {inscription.transliteration}
                </Text>
              </View>
            )}
            {inscription.note && <Text variant="caption">{inscription.note}</Text>}
            {inscription.arTarget && Platform.OS !== "web" && (
              <FrameLink href={camera}>
                <Pressable accessibilityRole="link" accessibilityLabel={`Kamerayla oku: ${inscription.location ?? "kitabe"}`} style={styles.cameraLink}>
                  <Ionicons name="scan-outline" size={18} color={c.primary} />
                  <Text variant="label" colorValue={c.primary}>
                    Kamerayla oku
                  </Text>
                </Pressable>
              </FrameLink>
            )}
          </View>
          </Editable>
        );
      })}
    </View>
  );
}

function factsOf(asset: AssetDetail) {
  return asset.facts.flatMap((fact) => {
    const raw = fact.value ?? (fact.valueNum !== null ? String(fact.valueNum) : null);
    if (raw === null) return [];
    return [{ ...fact, shown: fact.unit && !raw.endsWith(fact.unit) ? `${raw} ${fact.unit}` : raw }];
  });
}

/** Numbers as tiles, to take in at a glance. */
function Facts({ asset }: { asset: AssetDetail }) {
  const { colors: c } = useTheme();
  return (
    <View accessibilityRole="list" style={styles.tiles}>
      {factsOf(asset).map((fact) => (
        <Editable key={fact.key} field={`fact:${fact.key}`} label={`Sayı: ${fact.label}`} style={[styles.tileBox, fact.shown.length > 14 || fact.note ? styles.tileWide : null]}>
        <View style={[styles.tile, fact.shown.length > 14 || fact.note ? styles.tileWide : null, { backgroundColor: c.surfaceRaised }]}>
          <Text variant="heading" style={styles.factValue}>
            {fact.shown}
          </Text>
          <Text variant="caption" color="textSecondary">
            {fact.label}
          </Text>
          {fact.note && <Text variant="caption">{fact.note}</Text>}
        </View>
        </Editable>
      ))}
    </View>
  );
}

function Legends({ asset }: { asset: AssetDetail }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.rows}>
      {asset.legends.map((legend) => (
        <Editable key={legend.id} field={`legend:${legend.id}`} label="Rivayet">
          <View style={[styles.card, { backgroundColor: c.surfaceRaised }]}>
            <Text variant="heading" headingLevel={3}>
              {legend.title}
            </Text>
            <Prose text={legend.body} />
            <SourceNote compact sources={legend.sources} />
          </View>
        </Editable>
      ))}
    </View>
  );
}

const accessText: Record<AccessibilityStatus, string> = { yes: "Var", partial: "Kısmen", no: "Yok", unknown: "Bilgi yok" };

/** An unchecked "unknown" reads as no information, never as accessible. */
function Access({ asset }: { asset: AssetDetail }) {
  const a = asset.accessibility;
  const rows: Array<[string, IconName, AccessibilityStatus]> = [
    ["Tekerlekli sandalye", "accessibility-outline", a.wheelchair],
    ["Basamaksız giriş", "walk-outline", a.stepFree],
    ["Rampa", "trending-up-outline", a.ramp],
    ["Tuvalet", "water-outline", a.toilet],
  ];
  const known = rows.some(([, , status]) => status !== "unknown");
  return (
    <View style={styles.rows}>
      {known ? (
        rows.map(([label, icon, status]) => (
          <Info key={label} icon={icon} label={label}>
            {accessText[status]}
          </Info>
        ))
      ) : (
        <Text>Bilgi yok</Text>
      )}
      {known && !a.verified && (
        <Text variant="caption" color="textSecondary">
          Yerinde doğrulanmadı.
        </Text>
      )}
      {a.notes && <Prose text={a.notes} />}
    </View>
  );
}

function Sources({ asset }: { asset: AssetDetail }) {
  const { colors: c } = useTheme();
  return (
    <View accessibilityRole="list" style={styles.tight}>
      {asset.sources.map((source, index) => {
        const text = source.pages ? `${source.title} · s. ${source.pages}` : source.title;
        const { url } = source;
        return url ? (
          <Pressable key={`${source.sourceId}-${index}`} accessibilityRole="link" onPress={() => Linking.openURL(url)} style={styles.link}>
            <Text variant="caption" colorValue={c.primary} style={styles.underline}>
              {text}
            </Text>
          </Pressable>
        ) : (
          <Text key={`${source.sourceId}-${index}`} variant="caption">
            {text}
          </Text>
        );
      })}
    </View>
  );
}

const COLUMN = 640;

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  back: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  missing: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  flex: {
    flex: 1,
  },
  semibold: {
    fontFamily: fontFamily.sansSemiBold,
  },
  bold: {
    fontFamily: fontFamily.sansBold,
  },
  italic: {
    fontStyle: "italic",
  },
  intro: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  introColumn: {
    gap: spacing.sm,
    maxWidth: COLUMN,
    width: "100%",
    alignSelf: "center",
  },
  nav: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navRow: {
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  tab: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    borderBottomWidth: 3,
  },
  band: {
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  column: {
    gap: spacing.xl,
    maxWidth: COLUMN,
    width: "100%",
    alignSelf: "center",
  },
  blockHead: {
    gap: spacing.sm,
  },
  blockMark: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  blockNumber: {
    fontFamily: fontFamily.monoMedium,
    letterSpacing: 1,
  },
  blockRule: {
    width: 32,
    height: 3,
    borderRadius: 2,
  },
  rows: {
    gap: spacing.xl,
  },
  tight: {
    gap: spacing.sm,
  },
  info: {
    flexDirection: "row",
    gap: spacing.md,
  },
  infoIcon: {
    marginTop: 2,
  },
  chapters: {
    gap: spacing.xxxl,
  },
  centuries: {
    gap: spacing.sm,
  },
  factValue: {
    // The display face's "1" reads as "I": "11 m" would look like "II m".
    fontFamily: fontFamily.sansSemiBold,
  },
  chapter: {
    gap: spacing.md,
  },
  chapterTitle: {
    fontFamily: fontFamily.display,
  },
  prose: {
    gap: spacing.md,
  },
  figure: {
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  placed: {
    gap: spacing.md,
  },
  figurePhoto: {
    width: "100%",
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  link: {
    minHeight: touchTarget.min,
    justifyContent: "center",
  },
  underline: {
    textDecorationLine: "underline",
  },
  event: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  eventYear: {
    width: 48,
    fontFamily: fontFamily.mono,
  },
  eventRail: {
    width: 12,
    alignItems: "center",
  },
  eventDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 7,
  },
  eventLine: {
    flex: 1,
    width: 2,
    marginTop: spacing.xxs,
  },
  eventBody: {
    flex: 1,
    gap: spacing.xxs,
    paddingBottom: spacing.xl,
  },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  initial: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  quote: {
    gap: spacing.xs,
    paddingLeft: spacing.lg,
    borderLeftWidth: 3,
  },
  quoteText: {
    fontFamily: fontFamily.display,
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  cameraLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: touchTarget.min,
  },
  tiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    gap: spacing.xxs,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  tileWide: {
    flexBasis: "100%",
  },
  /** The tile's place in the row while the panel's editor wraps it. */
  tileBox: {
    flexGrow: 1,
    flexBasis: "45%",
  },
});
