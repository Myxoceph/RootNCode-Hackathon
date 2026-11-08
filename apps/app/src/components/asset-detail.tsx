import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetDetail, AssetSection, Media, Lang } from "@vagabonds/contracts";
import {
  cameraColors,
  fontFamily,
  palette,
  radius,
  SourceNote,
  spacing,
  Text,
  touchTarget,
  useTheme,
} from "@vagabonds/ui";
import { useNavigation, useRouter, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  Animated,
  Easing,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useHasInscriptions } from "@/ar/inscription-scope";
import { toggleCapsule, useCapsulePlayer } from "@/audio/capsule-player";
import { AssetGallery } from "@/components/asset-gallery";
import { AssetImage } from "@/components/asset-image";
import { BuildingIllustration } from "@/components/building-illustration";
import { VisitorPulse } from "@/components/visitor-pulse";
import {
  CAPSULE_SECONDS,
  captionAt,
  capsuleForSoundKey,
  capsuleWords,
  formatSeconds,
} from "@/content/capsules";
import { communityAvailable, useAssetRelations } from "@/data";
import { yearOfDating } from "@/lib/dating";
import { announce } from "@/lib/announce";
import {
  Editable,
  FrameLink,
  FrameModal,
  useFrameEditing,
} from "@/lib/in-frame";
import {
  isAssetUnlocked,
  relatedAssetsOf,
} from "@/lib/related-assets";
import { useUnlockedAssets } from "@/lib/unlocked-assets";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useWideWeb } from "@/lib/use-wide-web";
import { siteItems, SiteNav } from "@/components/web-nav-bar";
import {
  speakAnswer,
  stopAnswer,
  stopAnswerOf,
  useSpeaking,
} from "@/lib/voice";
import { visitSealTarget } from "@/lib/visit-seal";
import { useA11ySettings } from "@/settings/a11y-settings";
import { localeTag, useLang, useMessages, type Messages } from "@/i18n";

/** This page's words in the app's language; the page follows a change (`useLang` in `AssetDetailView`). */

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Chapters told as pages; the reader goes on from one to the next. */
const STORY_CHAPTERS = 3;

/** The pages stay dark in every theme, like the camera screens: they are photos first. */
const ink = {
  text: cameraColors.text,
  soft: cameraColors.textSecondary,
  gold: cameraColors.gold,
  onGold: cameraColors.onGold,
  glass: "rgba(255, 255, 255, 0.1)",
  edge: "rgba(255, 255, 255, 0.16)",
};
type Ink = {
  text: string;
  soft: string;
  gold: string;
  onGold: string;
  glass: string;
  edge: string;
};

/** The web article's words and cards below its photo, by theme; the photo band keeps `ink`. */
const ARTICLE_INK: Record<"light" | "dark", Ink & { page: string }> = {
  light: {
    page: palette.gece50,
    text: palette.gece950,
    soft: palette.gece600,
    gold: "#966F22",
    onGold: palette.white,
    glass: palette.white,
    edge: "rgba(11, 15, 24, 0.09)",
  },
  dark: { ...ink, page: palette.gece950 },
};

type Page =
  | { kind: "cover"; key: string; photo: Media | null }
  | { kind: "summary"; key: string; photo: Media | null; text: string }
  | {
      kind: "figures";
      key: string;
      photo: Media | null;
      figures: Figure[];
      founder: string | null;
    }
  | {
      kind: "highlight";
      key: string;
      photo: Media | null;
      number: number;
      total: number;
      title: string;
      hint: string | null;
      chapter: number;
    }
  | {
      kind: "chapter";
      key: string;
      photo: Media | null;
      chapter: number;
      id: string;
      title: string;
      sentence: string;
    }
  | { kind: "end"; key: string; photo: Media | null };

interface Figure {
  /** The record's field it shows, for the panel's editor. */
  field: string;
  value: string;
  unit: string | null;
  label: string;
}

/**
 * Eser kartı (modules 6 and 8) as full-screen pages, scrolled down one at a time like reels:
 * a photo and one sentence each, at the visitor's own pace. The dots at the side show where
 * they are. The last page holds what to do: directions, the camera experiences and sound.
 *
 * Whatever the book says is told, in its own words: "rivayete göre", "muhtemelen".
 */
export function AssetDetailView({
  asset,
  onClose,
}: {
  asset: AssetDetail;
  /** Replaces going back, e.g. in the admin panel's preview. */ onClose?: () => void;
}) {
  // A wide web page reads the card as an article (`AssetArticle`); the phone and the panel's preview keep the pages.
  const wide = useWideWeb();
  // The whole page is drawn again in a new language: its parts read their words through `m.asset`.
  useMessages();
  return wide && !onClose ? (
    <AssetArticle asset={asset} />
  ) : (
    <AssetStory asset={asset} onClose={onClose} />
  );
}

function AssetStory({
  asset,
  onClose,
}: {
  asset: AssetDetail;
  onClose?: () => void;
}) {
  const lang = useLang();
  const m = useMessages();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const chapters = asset.sections;
  const pages = useMemo(() => buildPages(asset, chapters, m.asset, lang), [asset, chapters, m, lang]);
  const scroll = useRef<ScrollViewInstance>(null);
  const [height, setHeight] = useState(0);
  const [index, setIndex] = useState(0);
  const [reading, setReading] = useState<number | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const photos = useMemo(() => picturesOf(asset), [asset]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (height === 0) return;
    const at = Math.round(event.nativeEvent.contentOffset.y / height);
    if (at !== index) setIndex(at);
  };

  // The page counter is only drawn; a screen reader hears where it is when the page changes.
  const shownPage = useRef(0);
  useEffect(() => {
    if (index === shownPage.current || !pages[index]) return;
    shownPage.current = index;
    announce(
      m.asset.pageAnnounce(index + 1, pages.length, pageTitle(pages[index]!, asset, m.asset)),
    );
  }, [index, pages, asset]);
  const close = () => {
    if (onClose) return onClose();
    if (!router.canGoBack()) return router.replace("/monuments");
    // Opened from another tab (the map's cards, the assistant), the card is alone in the Eserler
    // stack: leave the list in its place, so the tab opens on the list next time, then go back.
    if (navigation.getState()?.routes.length === 1)
      navigation.dispatch({ type: "REPLACE", payload: { name: "index" } });
    router.back();
  };
  const last = pages[index]?.kind === "end";

  return (
    <View
      style={styles.screen}
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
    >
      <StatusBar style="light" />

      {/* Before the pages in the tree, so "Kapat" is reached first (WCAG 2.4.3); drawn over them by zIndex. */}
      <View
        style={[styles.top, { paddingTop: insets.top + spacing.sm }]}
        pointerEvents="box-none"
      >
        {/* Drawn as a reminder; a screen reader would hear the name again on every page. */}
        <Text
          variant="caption"
          colorValue={ink.soft}
          numberOfLines={1}
          style={[styles.flex, styles.semibold]}
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {index === 0 || last ? "" : asset.name}
        </Text>
        <Text
          variant="caption"
          colorValue={ink.soft}
          style={styles.mono}
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {`${index + 1}/${pages.length}`}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={m.common.close}
          hitSlop={6}
          onPress={close}
          style={({ pressed }) => [styles.round, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={20} color={ink.text} />
        </Pressable>
      </View>
      {height > 0 && (
        <ScrollView
          ref={scroll}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
        >
          {pages.map((page, i) => (
            <PageView
              key={page.key}
              page={page}
              height={height}
              active={i === index}
              asset={asset}
              onRead={setReading}
              photos={photos}
              onGallery={() => setGalleryOpen(true)}
            >
              {page.kind === "end" && (
                <End
                  asset={asset}
                  onTop={() =>
                    scroll.current?.scrollTo({ y: 0, animated: true })
                  }
                  top={insets.top + spacing.xxxl + spacing.md}
                  bottom={insets.bottom}
                />
              )}
            </PageView>
          ))}
        </ScrollView>
      )}

      {!last && (
        <View style={styles.dots} pointerEvents="none" aria-hidden>
          {pages.map((page, i) => (
            <View
              key={page.key}
              style={[styles.dot, i === index ? styles.dotOn : null]}
            />
          ))}
        </View>
      )}

      <Reader
        chapters={chapters}
        index={reading}
        onChange={setReading}
        assetName={asset.name}
      />
      <AssetGallery
        photos={photos}
        visible={galleryOpen}
        onClose={() => setGalleryOpen(false)}
      />
    </View>
  );
}

/* ───────────────────────── The web's article ───────────────────────── */

/**
 * Eser kartı on a wide web page, as an article instead of pages to scroll one by one: the site's
 * bar, the asset's photo as a wide band with its name and the ways to its photos, file and related
 * assets; then the story in a column (summary, figures, what to look at on site, every chapter in
 * full) and beside it what a visit needs (time, fee, entrance, directions), sound and the visitors'
 * tips. Dark in every theme, as the pages are: photos first.
 */
function AssetArticle({ asset }: { asset: AssetDetail }) {
  const lang = useLang();
  const m = useMessages();
  const router = useRouter();
  const { scheme } = useTheme();
  const look = ARTICLE_INK[scheme === "dark" ? "dark" : "light"];
  const [galleryOpen, setGalleryOpen] = useState(false);
  const photos = useMemo(() => picturesOf(asset), [asset]);
  const cover = galleryOf(asset)[0] ?? null;
  const figures = figuresOf(asset, m.asset, lang);
  const year = builtYear(asset);
  const place = `${asset.district}, ${asset.city.label}`;
  const raw = asset.visit.entranceFee;
  const fee = feeOf(raw, m.asset);
  const a11y = asset.accessibility;
  const stepFree =
    a11y.verified && a11y.stepFree !== "unknown"
      ? a11y.stepFree === "no"
        ? m.asset.stepped
        : m.asset.stepFree
      : null;
  const coords = asset.coordinates;
  const facts = [
    asset.visit.durationMin
      ? {
          icon: "time-outline" as IconName,
          label: m.asset.duration,
          value: m.asset.minutes(asset.visit.durationMin),
        }
      : null,
    fee
      ? { icon: "ticket-outline" as IconName, label: m.asset.entry, value: fee }
      : null,
    stepFree
      ? {
          icon: "accessibility-outline" as IconName,
          label: m.asset.access,
          value: stepFree,
        }
      : null,
    { icon: "location-outline" as IconName, label: m.asset.place, value: place },
  ].filter(
    (fact): fact is { icon: IconName; label: string; value: string } =>
      fact !== null,
  );
  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/monuments");

  return (
    <View style={[styles.article, { backgroundColor: look.page }]}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.articleScroll}
      >
        <SiteNav
          items={siteItems(m)}
          active="monuments"
          background="transparent"
          onPress={(item) =>
            router.navigate(
              siteItems(m).find((site) => site.name === item.name)!.href,
            )
          }
        />
        <View style={styles.articleColumn}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={m.asset.backToSites}
            onPress={back}
            style={({
              pressed,
              hovered,
            }: {
              pressed: boolean;
              hovered?: boolean;
            }) => [
              styles.articleBack,
              hovered && { backgroundColor: look.glass },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="chevron-back" size={16} color={look.soft} />
            <Text variant="label" colorValue={look.soft}>
              {m.asset.sites}
            </Text>
          </Pressable>

          <View style={styles.hero}>
            <Backdrop photo={cover} id="article-cover" />
            <Scrim id="article-cover" heavy={false} />
            <View style={styles.heroCopy}>
              <View style={styles.kicker}>
                <Text
                  variant="caption"
                  colorValue={ink.onGold}
                  style={styles.bold}
                >
                  {asset.type.label}
                </Text>
              </View>
              <Text
                headingLevel={1}
                colorValue={ink.text}
                style={styles.heroTitle}
              >
                {asset.name}
              </Text>
              {asset.subtitle && (
                <Text
                  variant="bodyLarge"
                  colorValue={ink.soft}
                  style={styles.italic}
                >
                  {asset.subtitle}
                </Text>
              )}
              <Text
                variant="caption"
                colorValue={ink.soft}
                style={styles.semibold}
              >
                {[year, place].filter(Boolean).join("  ·  ")}
              </Text>
              <View style={styles.heroActions}>
                {photos.length > 1 && (
                  <GalleryButton
                    photos={photos}
                    onPress={() => setGalleryOpen(true)}
                  />
                )}
                <DossierButton asset={asset} />
                <View style={styles.heroRelated}>
                  <RelatedButton asset={asset} />
                </View>
              </View>
            </View>
          </View>

          <View style={styles.articleRow}>
            <View style={styles.articleMain}>
              <Text colorValue={look.text} style={styles.lede}>
                {asset.summary}
              </Text>

              {figures.length > 0 && (
                <View style={styles.figureRow}>
                  {figures.map((figure) => (
                    <View
                      key={figure.label}
                      style={[
                        styles.figureCard,
                        { borderColor: look.edge, backgroundColor: look.glass },
                      ]}
                      accessible
                      accessibilityLabel={`${figure.label}: ${[figure.value, figure.unit].filter(Boolean).join(" ")}`}
                    >
                      <Text
                        colorValue={look.gold}
                        style={styles.figureCardValue}
                      >
                        {figure.value}
                        {figure.unit && (
                          <Text
                            colorValue={look.gold}
                            style={styles.figureUnit}
                          >{` ${figure.unit}`}</Text>
                        )}
                      </Text>
                      <Text variant="caption" colorValue={look.soft}>
                        {figure.label}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              {asset.founder?.name && (
                <Text colorValue={look.soft} style={styles.founderLine}>
                  {m.asset.founded(asset.founder.name)}
                </Text>
              )}

              {asset.highlights.length > 0 && (
                <View
                  style={[styles.articleSection, { borderTopColor: look.edge }]}
                >
                  <Text
                    variant="overline"
                    colorValue={look.gold}
                    headingLevel={2}
                  >
                    {m.asset.lookHere}
                  </Text>
                  <View style={styles.highlightList}>
                    {asset.highlights.map((highlight, i) => (
                      <View
                        key={`${highlight.title}-${i}`}
                        style={styles.highlightItem}
                      >
                        <Text
                          colorValue={look.gold}
                          style={styles.highlightNumber}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </Text>
                        <View style={styles.flex}>
                          <Text
                            colorValue={look.text}
                            style={styles.highlightTitle}
                          >
                            {highlight.title}
                          </Text>
                          {highlight.hint && (
                            <Text variant="caption" colorValue={look.soft}>
                              {highlight.hint}
                            </Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {asset.sections.map((section) => (
                <View
                  key={section.id}
                  style={[styles.articleSection, { borderTopColor: look.edge }]}
                >
                  <Text
                    colorValue={look.text}
                    headingLevel={2}
                    style={styles.sectionTitle}
                  >
                    {section.title ?? m.asset.history}
                  </Text>
                  {section.body
                    .split(/\n\s*\n/)
                    .filter((part) => part.trim() !== "")
                    .map((part, i) => (
                      <Text
                        key={i}
                        colorValue={look.soft}
                        style={styles.paragraph}
                      >
                        {part.trim()}
                      </Text>
                    ))}
                </View>
              ))}
            </View>

            <View style={styles.articleSide}>
              <View
                style={[
                  styles.sideCard,
                  { borderColor: look.edge, backgroundColor: look.glass },
                ]}
              >
                <Text
                  variant="overline"
                  colorValue={look.gold}
                  headingLevel={2}
                >
                  {m.asset.visit}
                </Text>
                {facts.map((fact) => (
                  <View key={fact.label} style={styles.factRow}>
                    <Ionicons name={fact.icon} size={18} color={look.gold} />
                    <Text
                      variant="caption"
                      colorValue={look.soft}
                      style={styles.factLabel}
                    >
                      {fact.label}
                    </Text>
                    <Text
                      variant="label"
                      colorValue={look.text}
                      style={styles.factValue}
                    >
                      {fact.value}
                    </Text>
                  </View>
                ))}
                {asset.visit.notes && (
                  <Text variant="caption" colorValue={look.soft}>
                    {asset.visit.notes}
                  </Text>
                )}
                {coords && (
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={m.asset.directionsLabel}
                    onPress={() =>
                      Linking.openURL(
                        `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`,
                      )
                    }
                    style={({ pressed }) => [
                      styles.directions,
                      { backgroundColor: look.gold },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="navigate" size={18} color={look.onGold} />
                    <Text
                      variant="label"
                      colorValue={look.onGold}
                      style={styles.bold}
                    >
                      {m.asset.directions}
                    </Text>
                  </Pressable>
                )}
              </View>
              <Experiences asset={asset} look={look} />
              <VisitorPulse asset={asset} look={look} />
            </View>
          </View>
        </View>
      </ScrollView>
      <AssetGallery
        photos={photos}
        visible={galleryOpen}
        onClose={() => setGalleryOpen(false)}
      />
    </View>
  );
}

/* ───────────────────────── Pages ───────────────────────── */

/** What a page is about, in a few words, for the announcement when it comes into view. */
function pageTitle(page: Page, asset: AssetDetail, w: Messages["asset"]): string {
  switch (page.kind) {
    case "cover":
      return asset.name;
    case "summary":
      return w.summary;
    case "figures":
      return w.figures;
    case "highlight":
      return w.highlightTitle(page.number, page.total, page.title);
    case "chapter":
      return page.title;
    case "end":
      return w.explore;
  }
}

function buildPages(asset: AssetDetail, chapters: AssetSection[], w: Messages["asset"], lang: Lang): Page[] {
  const gallery = galleryOf(asset);
  const nameStems = new Set(stems(asset.name));
  const used = new Set<string>(gallery[0] ? [gallery[0].key] : []);
  /** The photo whose caption speaks of the same thing, else one not shown yet; each photo once while any is left. */
  const photoFor = (text?: string): Media | null => {
    if (gallery.length === 0) return null;
    const fresh = gallery.filter((m) => !used.has(m.key));
    const pool = fresh.length > 0 ? fresh : gallery;
    const wanted = text ? stems(text).filter((s) => !nameStems.has(s)) : [];
    const photo =
      pool.find((m) =>
        stems(`${m.caption ?? ""} ${m.alt}`).some((w) => wanted.includes(w)),
      ) ?? pool[0]!;
    used.add(photo.key);
    return photo;
  };

  const pages: Page[] = [
    { kind: "cover", key: "cover", photo: gallery[0] ?? null },
  ];
  pages.push({
    kind: "summary",
    key: "summary",
    photo: photoFor(),
    text: asset.summary,
  });

  const figures = figuresOf(asset, w, lang);
  const founder = asset.founder?.name ?? null;
  if (figures.length > 0)
    pages.push({
      kind: "figures",
      key: "figures",
      photo: photoFor(),
      figures,
      founder,
    });

  const told = new Set<string>();
  asset.highlights.forEach((highlight, i) => {
    const chapter = chapters.findIndex((c) => c.id === highlight.sectionId);
    if (chapter >= 0) told.add(chapters[chapter]!.id);
    pages.push({
      kind: "highlight",
      key: `highlight-${i}`,
      photo: photoFor(highlight.title),
      number: i + 1,
      total: asset.highlights.length,
      title: highlight.title,
      hint: highlight.hint,
      chapter,
    });
  });

  chapters
    .map((chapter, i) => ({ chapter, i }))
    .filter(({ chapter }) => !told.has(chapter.id))
    .slice(0, STORY_CHAPTERS)
    .forEach(({ chapter, i }) => {
      const title = chapter.title ?? w.history;
      pages.push({
        kind: "chapter",
        key: `chapter-${chapter.id}`,
        photo: photoFor(title),
        chapter: i,
        id: chapter.id,
        title,
        sentence: firstSentence(chapter.body),
      });
    });

  pages.push({ kind: "end", key: "end", photo: gallery[0] ?? null });
  return pages;
}

/** The year it was built, then the record's measurements: three at most. */
function figuresOf(asset: AssetDetail, w: Messages["asset"], lang: Lang): Figure[] {
  const figures: Figure[] = [];
  const year = builtYear(asset);
  if (year)
    figures.push({
      field: "year",
      value: year,
      unit: null,
      label: w.built,
    });
  for (const fact of asset.facts) {
    if (figures.length === 3) break;
    if (fact.valueNum === null) continue;
    // No thousands dot under 10 000, so a year ("1573") never reads as "1.573".
    const value =
      fact.valueNum >= 10000
        ? fact.valueNum.toLocaleString(localeTag(lang))
        : String(fact.valueNum);
    figures.push({
      field: `fact:${fact.key}`,
      value,
      unit: fact.unit,
      label: fact.label,
    });
  }
  return figures;
}

/** When it was built: the record's own label, else the first Gregorian year of its dating, or the dating itself. */
function builtYear(asset: AssetDetail): string | null {
  return asset.yearLabel ?? yearOfDating(asset.dating?.display ?? null);
}

/** The first full sentence, skipping abbreviations like "H. 802"; cut at a word past 200 characters. */
function firstSentence(text: string): string {
  const ends = /[.!?](?=\s|$)/g;
  let match: RegExpExecArray | null;
  while ((match = ends.exec(text))) {
    const at = match.index;
    if (at < 40) continue;
    if (/(^|\s)\p{Lu}$/u.test(text.slice(Math.max(0, at - 3), at))) continue;
    const sentence = text.slice(0, at + 1);
    if (sentence.length <= 220) return sentence;
    break;
  }
  const cut = text.slice(0, 200);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

/** Word stems for matching a page to a photo: "Minareler" and "minare" both give "minar". */
function stems(text: string): string[] {
  return text
    .toLocaleLowerCase("tr")
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length >= 4)
    .map((w) => w.slice(0, 5));
}

/**
 * One full-screen page: its photo, a scrim and its words. When it scrolls into place its photo
 * settles and its words rise in.
 */
function PageView({
  page,
  height,
  active,
  asset,
  onRead,
  photos,
  onGallery,
  children,
}: {
  page: Page;
  height: number;
  active: boolean;
  asset: AssetDetail;
  onRead: (chapter: number) => void;
  photos: Media[];
  onGallery: () => void;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [enter] = useState(() => new Animated.Value(1));
  const end = page.kind === "end";

  useEffect(() => {
    if (!active || reduceMotion) {
      enter.setValue(1);
      return;
    }
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [active, reduceMotion, enter]);

  return (
    <View style={[styles.page, { height }]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [
              {
                scale: enter.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1.08, 1],
                }),
              },
            ],
          },
        ]}
      >
        <Backdrop photo={page.photo} id={page.key} />
      </Animated.View>
      <Scrim id={page.key} heavy={end} />

      {end ? (
        children
      ) : (
        <Animated.View
          style={[
            styles.copy,
            { paddingBottom: insets.bottom + spacing.xxxl },
            {
              opacity: enter,
              transform: [
                {
                  translateY: enter.interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <PageCopy
            page={page}
            asset={asset}
            onRead={onRead}
            photos={photos}
            onGallery={onGallery}
          />
        </Animated.View>
      )}
    </View>
  );
}

function PageCopy({
  page,
  asset,
  onRead,
  photos,
  onGallery,
}: {
  page: Page;
  asset: AssetDetail;
  onRead: (chapter: number) => void;
  photos: Media[];
  onGallery: () => void;
}) {
  const m = useMessages();
  const lang = useLang();
  const editing = useFrameEditing() !== null;
  switch (page.kind) {
    case "cover": {
      const year = builtYear(asset);
      const place = `${asset.district}, ${asset.city.label}`;
      return (
        <>
          {/* What the asset is, its name and where it stands read as one block, close together. */}
          <View style={styles.coverHead}>
          <Editable field="type" label="Türü" style={styles.kickerBox}>
            <View style={styles.kicker}>
              <Text
                variant="caption"
                colorValue={ink.onGold}
                style={styles.bold}
              >
                {asset.type.label}
              </Text>
            </View>
          </Editable>
          <Editable field="name" label="Adı">
            <Text
              headingLevel={1}
              colorValue={ink.text}
              style={styles.coverTitle}
            >
              {asset.name}
            </Text>
          </Editable>
          {asset.subtitle && (
            <Editable field="subtitle" label="Alt başlık">
              <Text
                variant="bodyLarge"
                colorValue={ink.soft}
                style={styles.italic}
              >
                {asset.subtitle}
              </Text>
            </Editable>
          )}
          {editing ? (
            // In the panel's editor the year and the place are picked apart; the app sets them as one line.
            <View style={styles.metaRow}>
              {year && (
                <Editable field="cover:year" label="Yapım yılı">
                  <Text
                    variant="caption"
                    colorValue={ink.soft}
                    style={styles.semibold}
                  >
                    {year}
                  </Text>
                </Editable>
              )}
              <Editable field="place" label="İlçe ve il">
                <Text
                  variant="caption"
                  colorValue={ink.soft}
                  style={styles.semibold}
                >
                  {place}
                </Text>
              </Editable>
            </View>
          ) : (
            <Text
              variant="caption"
              colorValue={ink.soft}
              style={styles.semibold}
            >
              {[year, place].filter(Boolean).join("  ·  ")}
            </Text>
          )}
          </View>
          {/* The ways on, all alike: icon and words from the left, the same gap between them. */}
          <View style={styles.coverButtons}>
          <View style={styles.coverActions}>
            {photos.length > 1 && (
              <Editable field="media" label="Fotoğraflar">
                <GalleryButton photos={photos} onPress={onGallery} />
              </Editable>
            )}
            <DossierButton asset={asset} />
            <DescribeButton asset={asset} />
          </View>
          <RelatedButton asset={asset} />
          </View>
          <ScrollHint />
        </>
      );
    }
    case "summary":
      return (
        <Editable field="summary" label="Kısa tanıtım">
          <Text colorValue={ink.text} style={styles.statement}>
            {page.text}
          </Text>
        </Editable>
      );
    case "figures":
      return (
        <View style={styles.figures}>
          {page.figures.map((figure) => (
            <Editable
              key={figure.label}
              field={figure.field}
              label={
                figure.field === "year" ? "Yapım yılı" : `Sayı: ${figure.label}`
              }
            >
              <View
                accessible
                accessibilityLabel={`${figure.label}: ${[figure.value, figure.unit].filter(Boolean).join(" ")}`}
              >
                <Text colorValue={ink.gold} style={styles.figureValue}>
                  {figure.value}
                  {figure.unit && (
                    <Text
                      colorValue={ink.gold}
                      style={styles.figureUnit}
                    >{` ${figure.unit}`}</Text>
                  )}
                </Text>
                <Text variant="label" colorValue={ink.soft}>
                  {figure.label}
                </Text>
              </View>
            </Editable>
          ))}
          {page.founder && (
            <Editable field="founder" label="Kim yaptırdı">
              <Text colorValue={ink.text} style={styles.founder}>
                {m.asset.founded(page.founder)}
              </Text>
            </Editable>
          )}
        </View>
      );
    case "highlight":
      return (
        <>
          <Text variant="overline" colorValue={ink.gold}>
            {m.asset.lookHereCount(page.number, page.total)}
          </Text>
          <Editable
            field={`highlight:${page.number - 1}:title`}
            label="Bakılacak yer: ne?"
          >
            <Text
              colorValue={ink.text}
              style={styles.pageTitle}
              headingLevel={2}
            >
              {page.title}
            </Text>
          </Editable>
          {page.hint && (
            <Editable
              field={`highlight:${page.number - 1}:hint`}
              label="Bakılacak yer: nerede?"
            >
              <Text variant="bodyLarge" colorValue={ink.soft}>
                {page.hint}
              </Text>
            </Editable>
          )}
          {page.chapter >= 0 && (
            <ReadMore title={page.title} onPress={() => onRead(page.chapter)} />
          )}
        </>
      );
    case "chapter":
      return (
        <>
          {/* Drawn in capitals, read as written: some readers spell out a word in capitals. */}
          <Editable field={`section:${page.id}:title`} label="Konunun başlığı">
            <Text
              variant="overline"
              colorValue={ink.gold}
              headingLevel={2}
              accessibilityLabel={page.title}
            >
              {page.title.toLocaleUpperCase(lang)}
            </Text>
          </Editable>
          <Editable field={`section:${page.id}:body`} label="Konunun metni">
            <Text colorValue={ink.text} style={styles.statement}>
              {page.sentence}
            </Text>
          </Editable>
          <ReadMore title={page.title} onPress={() => onRead(page.chapter)} />
        </>
      );
    case "end":
      return null;
  }
}

/** "Kaydır" with a chevron that bobs, so the first page says how to go on. Still when motion is reduced. */
function ScrollHint() {
  const m = useMessages();
  const reduceMotion = useReducedMotion();
  const [bob] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, reduceMotion]);

  return (
    <View style={styles.hint} aria-hidden>
      <Animated.View
        style={{
          transform: [
            {
              translateY: bob.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 6],
              }),
            },
          ],
        }}
      >
        <Ionicons name="chevron-down" size={22} color={ink.text} />
      </Animated.View>
      <Text variant="caption" colorValue={ink.soft} style={styles.semibold}>
        {m.asset.swipe}
      </Text>
    </View>
  );
}

/** The way into the gallery, showing what is in it: the next few photos as a small stack, on a gold edge. */
function GalleryButton({
  photos,
  onPress,
}: {
  photos: Media[];
  onPress: () => void;
}) {
  const m = useMessages();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={m.asset.photos(photos.length)}
      onPress={onPress}
      style={({ pressed }) => [styles.gallery, pressed && styles.pressed]}
    >
      <View style={styles.thumbs}>
        {photos.slice(1, 3).map((photo, i) => (
          <View
            key={photo.key}
            style={[styles.thumb, i > 0 && styles.thumbOver]}
          >
            <AssetImage media={photo} decorative fill />
          </View>
        ))}
      </View>
      <Text variant="caption" colorValue={ink.text} style={styles.bold}>
        {m.asset.photoCount(photos.length)}
      </Text>
    </Pressable>
  );
}

/** The way to everything the book says; the same on the first page and at the very end of the last. */
function DossierButton({
  asset,
  wide = false,
}: {
  asset: AssetDetail;
  wide?: boolean;
}) {
  const m = useMessages();
  return (
    <FrameLink href={{ pathname: "/dossier", params: { asset: asset.id } }}>
      {/* One flat style object: `Link asChild` takes neither a style function nor an array. */}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={m.asset.dossierLabel}
        style={wide ? styles.dossierWide : styles.dossier}
      >
        <Ionicons
          name="document-text-outline"
          size={wide ? 20 : 18}
          color={ink.gold}
        />
        <Text
          variant={wide ? "label" : "caption"}
          colorValue={ink.text}
          style={styles.bold}
        >
          {m.asset.dossier}
        </Text>
        {wide && <Ionicons name="chevron-forward" size={18} color={ink.gold} />}
      </Pressable>
    </FrameLink>
  );
}

/** How long the warning stands in for the button's words. */
const LOCKED_WARNING_MS = 3500;

/**
 * The way to the assets this one is related to; gone when the answer is that there are none. While
 * this asset is locked it does not open: pressed, it says why instead.
 */
function RelatedButton({ asset }: { asset: AssetDetail }) {
  const m = useMessages();
  const related = useAssetRelations(asset.id);
  const locked = !isAssetUnlocked(asset, useUnlockedAssets());
  const [warned, setWarned] = useState(false);
  useEffect(() => {
    if (!warned) return;
    const timer = setTimeout(() => setWarned(false), LOCKED_WARNING_MS);
    return () => clearTimeout(timer);
  }, [warned]);

  const entries =
    related.status === "success"
      ? relatedAssetsOf(related.data?.items ?? [])
      : null;
  if (entries?.length === 0) return null;
  const inside = (
    <>
      <Ionicons
        name={warned ? "alert-circle" : "link"}
        size={18}
        color={ink.gold}
        style={styles.relatedIcon}
      />
      <Text
        variant="caption"
        colorValue={ink.text}
        numberOfLines={2}
        style={[styles.bold, styles.flexText]}
      >
        {warned ? m.asset.lockedWarning : m.asset.related}
      </Text>
      <Ionicons
        name={locked ? "lock-closed" : "chevron-forward"}
        size={locked ? 16 : 18}
        color={ink.gold}
      />
    </>
  );
  if (locked) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={m.asset.relatedLocked}
        onPress={() => {
          setWarned(true);
          announce(m.asset.lockedWarning);
        }}
        style={styles.related}
      >
        {inside}
      </Pressable>
    );
  }
  return (
    <FrameLink
      href={{
        pathname: "/related",
        params: { asset: asset.id, name: asset.name },
      }}
    >
      {/* One flat style object: `Link asChild` takes neither a style function nor an array. */}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={
          entries
            ? m.asset.relatedCount(entries.length)
            : m.asset.related
        }
        style={styles.related}
      >
        {inside}
      </Pressable>
    </FrameLink>
  );
}

/** "Devamını oku" for one chapter; its name says which, as each page has one (WCAG 2.4.4). */
function ReadMore({ title, onPress }: { title: string; onPress: () => void }) {
  const m = useMessages();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={m.asset.readMoreLabel(title)}
      onPress={onPress}
      style={({ pressed }) => [styles.readMore, pressed && styles.pressed]}
    >
      <Text variant="label" colorValue={ink.text}>
        {m.asset.readMore}
      </Text>
      <Ionicons name="arrow-forward" size={16} color={ink.text} />
    </Pressable>
  );
}

/** The page's photo; the drawing when there is none or it fails to load. */
function Backdrop({ photo, id }: { photo: Media | null; id: string }) {
  const [failed, setFailed] = useState(false);
  const unique = useSvgId(id);
  return (
    <View style={StyleSheet.absoluteFill}>
      <BuildingIllustration mode="now" id={`page-${unique}`} />
      {photo && !failed && (
        <AssetImage
          media={photo}
          decorative
          fill
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}

/**
 * An SVG id no other page shares. On the web the page left behind stays in the document, hidden; a
 * gradient both pages name resolves to its hidden copy there, which draws nothing, and the words lose
 * their dark fade.
 */
function useSvgId(id: string): string {
  return `${id}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/** Dark at the top for the close button, clear in the middle, near-black under the words. */
function Scrim({ id: given, heavy }: { id: string; heavy: boolean }) {
  const id = useSvgId(given);
  return (
    <View aria-hidden style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={`scrim-${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop
              offset="0"
              stopColor={palette.gece1000}
              stopOpacity={heavy ? 0.82 : 0.55}
            />
            <Stop
              offset="0.2"
              stopColor={palette.gece1000}
              stopOpacity={heavy ? 0.86 : 0.15}
            />
            <Stop
              offset="0.35"
              stopColor={palette.gece1000}
              stopOpacity={heavy ? 0.9 : 0.5}
            />
            <Stop
              offset="0.55"
              stopColor={palette.gece1000}
              stopOpacity={heavy ? 0.93 : 0.86}
            />
            <Stop offset="1" stopColor={palette.gece1000} stopOpacity={0.97} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#scrim-${id})`} />
      </Svg>
    </View>
  );
}

/* ───────────────────────── Last page ───────────────────────── */

interface Action {
  key: string;
  icon: IconName;
  title: string;
  hint: string;
  spoken: string;
  href?: Href;
  onPress?: () => void;
  on?: boolean;
}

/** The photos to tell with, the cover first. */
function galleryOf(asset: AssetDetail): Media[] {
  const rest = asset.media.filter(
    (m) =>
      (m.kind === "photo" || m.kind === "archive_photo") &&
      m.key !== asset.cover?.key,
  );
  return asset.cover ? [asset.cover, ...rest] : rest;
}

/** Everything to look at in the gallery: the photos and the drawings (plans), the cover first. */
function picturesOf(asset: AssetDetail): Media[] {
  const rest = asset.media.filter(
    (m) =>
      (m.kind === "photo" ||
        m.kind === "archive_photo" ||
        m.kind === "drawing") &&
      m.key !== asset.cover?.key,
  );
  return asset.cover ? [asset.cover, ...rest] : rest;
}

/** The dataset's fee codes; anything else is already a price in words. */
function feeOf(raw: string | null | undefined, w: Messages["asset"]): string | null {
  if (!raw || raw === "unknown") return null;
  return raw === "free" ? w.free : raw;
}

/**
 * The last page, kept quiet: the name, one line of what the visit takes, directions, the
 * experiences as a plain list and the visitors' notes. Scrolls on its own when it does not fit.
 */
function End({
  asset,
  onTop,
  top,
  bottom,
}: {
  asset: AssetDetail;
  onTop: () => void;
  top: number;
  bottom: number;
}) {
  const m = useMessages();
  const lang = useLang();
  const raw = asset.visit.entranceFee;
  const fee = feeOf(raw, m.asset);
  const a11y = asset.accessibility;
  const stepFree =
    a11y.verified && a11y.stepFree !== "unknown"
      ? a11y.stepFree === "no"
        ? m.asset.stepped.toLocaleLowerCase(lang)
        : m.asset.stepFree.toLocaleLowerCase(lang)
      : null;
  const meta = [
    asset.visit.durationMin ? m.asset.minutes(asset.visit.durationMin) : null,
    fee,
    stepFree,
    asset.district,
  ]
    .filter(Boolean)
    .join("  ·  ");
  const coords = asset.coordinates;

  return (
    <ScrollView
      style={StyleSheet.absoluteFill}
      nestedScrollEnabled
      contentContainerStyle={[
        styles.end,
        { paddingTop: top, paddingBottom: bottom + spacing.xxl },
      ]}
    >
      <View style={styles.endInner}>
        <View style={styles.invite}>
          <Text variant="overline" colorValue={ink.gold}>
            {m.asset.exploreOverline}
          </Text>
          <Editable field="name" label="Adı">
            <Text
              headingLevel={2}
              colorValue={ink.text}
              style={styles.inviteTitle}
            >
              {asset.name}
            </Text>
          </Editable>
          {meta !== "" && (
            <Editable field="visit" label="Süre ve giriş">
              <Text
                variant="caption"
                colorValue={ink.soft}
                style={styles.semibold}
              >
                {meta}
              </Text>
            </Editable>
          )}
          {asset.visit.notes && (
            <Editable field="visit:notes" label="Ziyaret notu">
              <Text variant="caption" colorValue={ink.soft}>
                {asset.visit.notes}
              </Text>
            </Editable>
          )}
          {coords && (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={m.asset.directionsLabel}
              onPress={() =>
                Linking.openURL(
                  `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`,
                )
              }
              style={({ pressed }) => [
                styles.directions,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="navigate" size={18} color={ink.onGold} />
              <Text variant="label" colorValue={ink.onGold} style={styles.bold}>
                {m.asset.directions}
              </Text>
            </Pressable>
          )}
        </View>

        <Editable field="audio" label="Sesli anlatım ve ortam sesi">
          <Experiences asset={asset} />
        </Editable>
        <Editable field="tip" label="İpuçları">
          <VisitorPulse asset={asset} />
        </Editable>

        <Pressable
          accessibilityRole="button"
          onPress={onTop}
          style={({ pressed }) => [styles.replay, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-up" size={14} color={ink.soft} />
          <Text variant="caption" colorValue={ink.soft} style={styles.semibold}>
            {m.asset.toTop}
          </Text>
        </Pressable>

        <DossierButton asset={asset} wide />
      </View>
    </ScrollView>
  );
}

/**
 * The asset's spoken architectural description, read in EVREN's voice as Rehber's answers (the phone's voice
 * when it cannot be reached). Offered only while "Sesli mimari betimleme" is on in Sistem ayarları. The first
 * page and the experiences share one reading: started on one, the other shows it playing and stops it.
 */
function useAssetDescription(asset: AssetDetail) {
  const { settings } = useA11ySettings();
  const key = `description:${asset.id}`;
  const describing = useSpeaking() === key;
  // Leaving the page ends its description (its Durdur button goes with it), not another screen's reading.
  useEffect(() => () => stopAnswerOf((reading) => reading === key), [key]);
  // Turned off while it reads: the reading stops with its button.
  useEffect(() => {
    if (!settings.audioDescription) stopAnswerOf((reading) => reading === key);
  }, [settings.audioDescription, key]);
  const description = settings.audioDescription ? asset.accessibility.audioDescription : null;
  const toggleDescription = () => {
    if (!description) return;
    if (describing) stopAnswer();
    else void speakAnswer(key, description);
  };
  return { description, describing, toggleDescription };
}

/** The spoken description on the first page, beside the dossier: there from the start, not only at the end. */
function DescribeButton({ asset }: { asset: AssetDetail }) {
  const m = useMessages();
  const { description, describing, toggleDescription } = useAssetDescription(asset);
  if (!description) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={describing ? m.asset.stopDescribing : `${m.asset.describe}: ${m.asset.describeHint}`}
      accessibilityState={{ selected: describing }}
      onPress={toggleDescription}
      style={({ pressed }) => [styles.dossier, pressed && styles.pressed]}
    >
      <Ionicons name={describing ? "stop-outline" : "ear-outline"} size={18} color={ink.gold} />
      <Text variant="caption" colorValue={ink.text} style={styles.bold}>
        {describing ? m.common.stop : m.asset.describe}
      </Text>
    </Pressable>
  );
}

/** The camera experiences, sound, spoken description and the assistant, a row each under hairlines. */
function Experiences({
  asset,
  look = ink,
}: {
  asset: AssetDetail;
  look?: Ink;
}) {
  const lang = useLang();
  const m = useMessages();
  const { settings } = useA11ySettings();
  const player = useCapsulePlayer();
  const { description, describing, toggleDescription } = useAssetDescription(asset);
  const soundKey = asset.ambientSound?.key ?? null;
  const capsuleType = soundKey ? capsuleForSoundKey(soundKey) : undefined;
  const playing =
    capsuleType !== undefined && player?.type === capsuleType ? player : null;
  const opened = isAssetUnlocked(asset, useUnlockedAssets());
  const inscriptions = useHasInscriptions(asset);

  const actions: Action[] = [];
  // Taşın Dili and Ziyaret Mührü need the camera: phone features (ADR 0001).
  const phone = Platform.OS !== "web";
  // Taşın Dili and Taşa Sor in one: the camera looks for the inscriptions and offers the assistant
  // when none is found. An asset with none to look for opens on asking at once.
  if (phone) {
    actions.push({
      key: "inscription",
      icon: "scan-outline",
      title: m.asset.inscription,
      // No inscription the camera can find: the row asks the assistant only, and says so.
      hint: inscriptions ? m.asset.inscriptionHint : m.asset.inscriptionAskHint,
      spoken: `${m.asset.inscription}: ${inscriptions ? m.asset.inscriptionHint : m.asset.inscriptionAskHint}`,
      href: inscriptions
        ? { pathname: "/inscription", params: { asset: asset.id } }
        : { pathname: "/stone-ask", params: { asset: asset.id, name: asset.name } },
    });
  }
  // Kitabe Gönüllüleri: an inscription that is not in the list goes to an expert from its photo
  // (on the web chosen from the files). Only with the API: sample data has nowhere to send it.
  if (communityAvailable) {
    actions.push({
      key: "propose",
      icon: "document-text-outline",
      title: m.asset.propose,
      hint: m.asset.proposeHint,
      spoken: `${m.asset.propose}: ${m.asset.proposeHint}`,
      href: { pathname: "/inscription-propose", params: { asset: asset.id } },
    });
  }
  // An unlocked asset needs no seal.
  if (phone && visitSealTarget(asset, lang) && !opened) {
    const hint = capsuleType ? m.asset.sealHintSound : m.asset.sealHint;
    actions.push({
      key: "seal",
      icon: "ribbon-outline",
      title: m.asset.seal,
      hint,
      spoken: `${m.asset.seal}: ${hint}`,
      href: { pathname: "/visit-seal", params: { asset: asset.id } },
    });
  }
  // On a phone the sound is earned: the sealed asset opens its sequence again, an unsealed one offers the seal above.
  const sealable = phone && visitSealTarget(asset, lang) !== null;
  if (phone && opened) {
    const hint = capsuleType ? m.asset.reliveHintSound : m.asset.reliveHint;
    actions.push({
      key: "relive",
      icon: "hourglass-outline",
      title: m.asset.relive,
      hint,
      spoken: `${m.asset.relive}: ${hint}`,
      href: { pathname: "/seal-sequence", params: { asset: asset.id } },
    });
  } else if (capsuleType && !sealable) {
    // Only captions are announced; a counter that ticks every second would talk over everything.
    const hint = playing
      ? settings.captions
        ? captionAt(capsuleType, playing.elapsed, lang)
        : `${formatSeconds(playing.elapsed)} / ${formatSeconds(CAPSULE_SECONDS)}`
      : capsuleWords(capsuleType, lang).name;
    actions.push({
      key: "sound",
      icon: playing ? "pause-outline" : "musical-notes-outline",
      title: playing ? m.common.stop : m.asset.playSound,
      hint,
      // The words on the row come first, so voice control finds it by what it shows (WCAG 2.5.3).
      spoken: playing
        ? m.asset.stopSound
        : m.asset.playSoundLabel(capsuleWords(capsuleType, lang).name),
      onPress: () => toggleCapsule(capsuleType),
      on: !!playing,
    });
  }
  if (description) {
    actions.push({
      key: "describe",
      icon: describing ? "stop-outline" : "ear-outline",
      title: describing ? m.common.stop : m.asset.describe,
      hint: m.asset.describeHint,
      spoken: describing
        ? m.asset.stopDescribing
        : `${m.asset.describe}: ${m.asset.describeHint}`,
      onPress: toggleDescription,
      on: describing,
    });
  }

  // Always offered: when no model answers, the assistant's screen says it is closed for now.
  actions.push({
    key: "ask",
    icon: "sparkles-outline",
    title: m.asset.ask,
    hint: m.asset.askHint,
    spoken: m.asset.askLabel(asset.name),
    href: {
      pathname: "/assistant",
      params: { asset: asset.id, name: asset.name },
    },
  });
  return (
    <View style={[styles.rows, { borderTopColor: look.edge }]}>
      {actions.map((action) => (
        <Row
          key={action.key}
          action={action}
          look={look}
          live={action.key === "sound" && !!playing && settings.captions}
        />
      ))}
    </View>
  );
}

function Row({
  action,
  live,
  look,
}: {
  action: Action;
  live: boolean;
  look: Ink;
}) {
  const content = (
    <>
      <Ionicons name={action.icon} size={22} color={look.gold} />
      <View style={styles.flex}>
        <Text variant="label" colorValue={look.text}>
          {action.title}
        </Text>
        <Text
          variant="caption"
          colorValue={look.soft}
          numberOfLines={2}
          accessibilityLiveRegion={live ? "polite" : "none"}
        >
          {action.hint}
        </Text>
      </View>
      <Ionicons
        name={
          action.href
            ? "chevron-forward"
            : action.on
              ? "radio-button-on"
              : "play-circle-outline"
        }
        size={18}
        color={action.on ? look.gold : look.soft}
      />
    </>
  );
  if (action.href) {
    return (
      <FrameLink href={action.href}>
        {/* One flat style object: `Link asChild` takes neither a style function nor an array. */}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={action.spoken}
          style={StyleSheet.flatten([
            styles.row,
            { borderBottomColor: look.edge },
          ])}
        >
          {content}
        </Pressable>
      </FrameLink>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.spoken}
      onPress={action.onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: look.edge },
        pressed && styles.pressed,
      ]}
    >
      {content}
    </Pressable>
  );
}

/* ───────────────────────── Reader ───────────────────────── */

/** One chapter on a quiet page of its own: large text, its source, then the next chapter. */
function Reader({
  chapters,
  index,
  onChange,
  assetName,
}: {
  chapters: AssetSection[];
  index: number | null;
  onChange: (index: number | null) => void;
  assetName: string;
}) {
  const m = useMessages();
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const chapter = index !== null ? chapters[index] : undefined;
  const next = index !== null ? chapters[index + 1] : undefined;
  const close = () => onChange(null);

  return (
    <FrameModal
      visible={!!chapter}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={close}
    >
      {chapter && index !== null && (
        <View
          style={[
            styles.flex,
            { backgroundColor: c.background, paddingTop: insets.top },
          ]}
        >
          <View style={styles.readerBar}>
            <Text
              variant="caption"
              color="textSecondary"
              numberOfLines={1}
              style={[styles.flex, styles.mono]}
            >
              {`${assetName} · ${index + 1}/${chapters.length}`}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={m.common.close}
              hitSlop={6}
              onPress={close}
              style={[styles.round, { backgroundColor: c.surfaceRaised }]}
            >
              <Ionicons name="close" size={20} color={c.text} />
            </Pressable>
          </View>
          <View
            style={[styles.progress, { backgroundColor: c.border }]}
            aria-hidden
          >
            <View
              style={[
                styles.progress,
                {
                  backgroundColor: c.highlightMark,
                  width: `${((index + 1) / chapters.length) * 100}%`,
                },
              ]}
            />
          </View>

          <ScrollView
            key={chapter.id}
            contentContainerStyle={[
              styles.readerBody,
              { paddingBottom: insets.bottom + spacing.xxxl },
            ]}
          >
            <Text variant="title" headingLevel={1}>
              {chapter.title ?? m.asset.history}
            </Text>
            <Text style={styles.prose}>{chapter.body}</Text>
            <SourceNote compact sources={chapter.sources} />

            {next ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={m.asset.nextChapterLabel(next.title ?? m.asset.history)}
                onPress={() => onChange(index + 1)}
                style={({ pressed }) => [
                  styles.next,
                  { backgroundColor: c.surface, borderColor: c.border },
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.flex}>
                  <Text variant="caption" color="textSecondary">
                    {m.asset.nextChapter}
                  </Text>
                  <Text variant="label">{next.title ?? m.asset.history}</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color={c.text} />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={close}
                style={({ pressed }) => [
                  styles.done,
                  { backgroundColor: c.text },
                  pressed && styles.pressed,
                ]}
              >
                <Text variant="label" colorValue={c.background}>
                  {m.asset.done}
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      )}
    </FrameModal>
  );
}

const relatedButton = {
  flexDirection: "row",
  alignItems: "center",
  alignSelf: "stretch",
  gap: spacing.sm,
  minHeight: 48,
  paddingLeft: spacing.xs,
  paddingRight: spacing.md,
  borderRadius: radius.full,
  backgroundColor: "rgba(6, 8, 13, 0.6)",
  borderColor: ink.gold,
  borderWidth: 1.5,
} as const;

const dossierButton = {
  flexDirection: "row",
  alignItems: "center",
  alignSelf: "flex-start",
  gap: spacing.xs,
  minHeight: 48,
  paddingHorizontal: spacing.lg,
  borderRadius: radius.full,
  backgroundColor: "rgba(6, 8, 13, 0.6)",
  borderColor: ink.gold,
  borderWidth: 1.5,
} as const;

const styles = StyleSheet.create({
  article: {
    flex: 1,
    backgroundColor: palette.gece950,
  },
  articleScroll: {
    paddingBottom: spacing.xxxl,
  },
  articleColumn: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  articleBack: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 2,
    marginLeft: -spacing.sm,
    paddingVertical: spacing.xxs,
    paddingLeft: spacing.xs,
    paddingRight: spacing.sm,
    borderRadius: radius.full,
  },
  hero: {
    minHeight: 480,
    // Under the photo and its fade: the words stay on dark while either is still on its way.
    backgroundColor: palette.gece900,
    justifyContent: "flex-end",
    borderRadius: 28,
    overflow: "hidden",
  },
  heroCopy: {
    maxWidth: 720,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  heroTitle: {
    fontFamily: fontFamily.display,
    fontSize: 60,
    lineHeight: 68,
  },
  heroActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  heroRelated: {
    minWidth: 340,
  },
  articleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xxl,
    marginTop: spacing.lg,
  },
  articleMain: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xl,
  },
  articleSide: {
    width: 360,
    gap: spacing.lg,
    position: "sticky" as "relative",
    top: spacing.lg,
  },
  lede: {
    fontFamily: fontFamily.display,
    fontSize: 26,
    lineHeight: 38,
  },
  figureRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  figureCard: {
    flex: 1,
    gap: spacing.xxs,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: ink.edge,
    backgroundColor: ink.glass,
  },
  figureCardValue: {
    fontFamily: fontFamily.display,
    fontSize: 36,
    lineHeight: 42,
  },
  founderLine: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    marginTop: -spacing.md,
  },
  articleSection: {
    gap: spacing.md,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: ink.edge,
  },
  sectionTitle: {
    fontFamily: fontFamily.display,
    fontSize: 30,
    lineHeight: 38,
  },
  paragraph: {
    fontFamily: fontFamily.sans,
    fontSize: 17,
    lineHeight: 28,
  },
  highlightList: {
    gap: spacing.md,
  },
  highlightItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  highlightNumber: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 26,
    // At least this wide, so the titles line up; wider with "Büyük metin" rather than broken in two.
    minWidth: 32,
  },
  highlightTitle: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 17,
    lineHeight: 24,
  },
  sideCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: ink.edge,
    backgroundColor: ink.glass,
  },
  factRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  factLabel: {
    width: 84,
  },
  factValue: {
    flex: 1,
    textAlign: "right",
  },
  screen: {
    flex: 1,
    backgroundColor: cameraColors.background,
  },
  flex: {
    flex: 1,
  },
  mono: {
    fontFamily: fontFamily.mono,
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
  pressed: {
    opacity: 0.7,
  },

  page: {
    overflow: "hidden",
  },
  top: {
    position: "absolute",
    zIndex: 2,
    elevation: 2,
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  round: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(6, 8, 13, 0.35)",
  },
  dots: {
    position: "absolute",
    right: spacing.sm,
    top: "35%",
    gap: 6,
    alignItems: "center",
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
  },
  dotOn: {
    height: 16,
    backgroundColor: palette.white,
  },

  copy: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.md,
    paddingLeft: spacing.xl,
    paddingRight: spacing.xxl,
    maxWidth: 640 + spacing.xl * 2,
    width: "100%",
    alignSelf: "center",
  },
  kickerBox: {
    alignSelf: "flex-start",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  kicker: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
    backgroundColor: ink.gold,
  },
  coverTitle: {
    fontFamily: fontFamily.display,
    fontSize: 52,
    lineHeight: 58,
  },
  hint: {
    alignItems: "center",
    gap: spacing.xxs,
    marginTop: spacing.xl,
    alignSelf: "center",
  },
  statement: {
    fontFamily: fontFamily.display,
    fontSize: 27,
    lineHeight: 37,
  },
  pageTitle: {
    fontFamily: fontFamily.display,
    fontSize: 38,
    lineHeight: 46,
  },
  figures: {
    gap: spacing.xl,
  },
  figureValue: {
    fontFamily: fontFamily.display,
    fontSize: 64,
    lineHeight: 70,
  },
  figureUnit: {
    fontFamily: fontFamily.display,
    fontSize: 28,
  },
  founder: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 30,
  },
  coverHead: {
    gap: spacing.xs,
  },
  coverButtons: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  coverActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  // The ones on the cover share out the row's width, so it ends where the button under it does; their
  // words start from the left, as the related assets' button under them does.
  dossier: {
    ...dossierButton,
    alignSelf: "auto",
    flexGrow: 1,
    justifyContent: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  dossierWide: {
    ...dossierButton,
    minHeight: 56,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  gallery: {
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: spacing.sm,
    minHeight: 48,
    paddingLeft: spacing.xs,
    paddingRight: spacing.md,
    borderRadius: radius.full,
    backgroundColor: "rgba(6, 8, 13, 0.6)",
    borderColor: ink.gold,
    borderWidth: 1.5,
  },
  related: relatedButton,
  relatedIcon: {
    marginLeft: spacing.md - spacing.xs,
  },
  flexText: {
    flex: 1,
  },
  thumbs: {
    flexDirection: "row",
  },
  thumb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: palette.gece1000,
    backgroundColor: palette.gece1000,
  },
  thumbOver: {
    marginLeft: -14,
  },
  readMore: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.sm,
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: ink.glass,
    borderColor: ink.edge,
    borderWidth: StyleSheet.hairlineWidth,
  },

  end: {
    flexGrow: 1,
    justifyContent: "flex-end",
    paddingHorizontal: spacing.xl,
  },
  endInner: {
    gap: spacing.xxl,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  invite: {
    gap: spacing.sm,
  },
  inviteTitle: {
    fontFamily: fontFamily.display,
    fontSize: 44,
    lineHeight: 50,
  },
  directions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 56,
    marginTop: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: ink.gold,
  },
  rows: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ink.edge,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    minHeight: 68,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ink.edge,
  },
  replay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: touchTarget.min,
  },

  readerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  progress: {
    height: 2,
  },
  readerBody: {
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    maxWidth: 640 + spacing.xl * 2,
    width: "100%",
    alignSelf: "center",
  },
  prose: {
    fontFamily: fontFamily.sans,
    fontSize: 19,
    lineHeight: 32,
  },
  next: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  done: {
    minHeight: touchTarget.min + spacing.sm,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
