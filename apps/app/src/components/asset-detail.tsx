import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetDetail, AssetSection, Confidence, Media } from "@vagabonds/contracts";
import { cameraColors, fontFamily, palette, radius, SourceNote, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { Link, useNavigation, useRouter, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Linking,
  Modal,
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
import { AssetImage } from "@/components/asset-image";
import { BuildingIllustration } from "@/components/building-illustration";
import { VisitorPulse } from "@/components/visitor-pulse";
import { CAPSULE_SECONDS, captionAt, capsuleForSoundKey, capsules, formatSeconds } from "@/content/capsules";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { speak, stopSpeaking } from "@/lib/speak";
import { visitSealTarget } from "@/lib/visit-seal";
import { useA11ySettings } from "@/settings/a11y-settings";

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

/** Only what the sources state outright: no "Tahmini", "Tartışmalı" or "Rivayet" here. */
const isCertain = (confidence: Confidence | null) => confidence === null || confidence.code === "certain";

type Page =
  | { kind: "cover"; key: string; photo: Media | null }
  | { kind: "summary"; key: string; photo: Media | null; text: string }
  | { kind: "figures"; key: string; photo: Media | null; figures: Figure[]; founder: string | null }
  | { kind: "highlight"; key: string; photo: Media | null; number: number; total: number; title: string; hint: string | null; chapter: number }
  | { kind: "chapter"; key: string; photo: Media | null; chapter: number; title: string; sentence: string }
  | { kind: "end"; key: string; photo: Media | null };

interface Figure {
  value: string;
  unit: string | null;
  label: string;
}

/**
 * Eser kartı (modules 6 and 8) as full-screen pages, scrolled down one at a time like reels:
 * a photo and one sentence each, at the visitor's own pace. The dots at the side show where
 * they are. The last page holds what to do: directions, the camera experiences and sound.
 *
 * Only what the sources state for certain is told.
 */
export function AssetDetailView({ asset }: { asset: AssetDetail }) {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const chapters = useMemo(() => asset.sections.filter((s) => isCertain(s.confidence)), [asset]);
  const pages = useMemo(() => buildPages(asset, chapters), [asset, chapters]);
  const scroll = useRef<ScrollViewInstance>(null);
  const [height, setHeight] = useState(0);
  const [index, setIndex] = useState(0);
  const [reading, setReading] = useState<number | null>(null);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (height === 0) return;
    const at = Math.round(event.nativeEvent.contentOffset.y / height);
    if (at !== index) setIndex(at);
  };
  const close = () => {
    if (!router.canGoBack()) return router.replace("/monuments");
    // Opened from another tab (the map's cards, the assistant), the card is alone in the Eserler
    // stack: leave the list in its place, so the tab opens on the list next time, then go back.
    if (navigation.getState()?.routes.length === 1) navigation.dispatch({ type: "REPLACE", payload: { name: "index" } });
    router.back();
  };
  const last = pages[index]?.kind === "end";

  return (
    <View style={styles.screen} onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
      <StatusBar style="light" />

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
            <PageView key={page.key} page={page} height={height} active={i === index} asset={asset} onRead={setReading}>
              {page.kind === "end" && (
                <End asset={asset} onTop={() => scroll.current?.scrollTo({ y: 0, animated: true })} top={insets.top + spacing.xxxl + spacing.md} bottom={insets.bottom} />
              )}
            </PageView>
          ))}
        </ScrollView>
      )}

      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        <Text variant="caption" colorValue={ink.soft} numberOfLines={1} style={[styles.flex, styles.semibold]}>
          {index === 0 || last ? "" : asset.name}
        </Text>
        <Text variant="caption" colorValue={ink.soft} style={styles.mono} aria-hidden>
          {`${index + 1}/${pages.length}`}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Kapat" hitSlop={6} onPress={close} style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
          <Ionicons name="close" size={20} color={ink.text} />
        </Pressable>
      </View>

      {!last && (
        <View style={styles.dots} pointerEvents="none" aria-hidden>
          {pages.map((page, i) => (
            <View key={page.key} style={[styles.dot, i === index ? styles.dotOn : null]} />
          ))}
        </View>
      )}

      <Reader chapters={chapters} index={reading} onChange={setReading} assetName={asset.name} />
    </View>
  );
}

/* ───────────────────────── Pages ───────────────────────── */

function buildPages(asset: AssetDetail, chapters: AssetSection[]): Page[] {
  const gallery = galleryOf(asset);
  const nameStems = new Set(stems(asset.name));
  const used = new Set<string>(gallery[0] ? [gallery[0].key] : []);
  /** The photo whose caption speaks of the same thing, else one not shown yet; each photo once while any is left. */
  const photoFor = (text?: string): Media | null => {
    if (gallery.length === 0) return null;
    const fresh = gallery.filter((m) => !used.has(m.key));
    const pool = fresh.length > 0 ? fresh : gallery;
    const wanted = text ? stems(text).filter((s) => !nameStems.has(s)) : [];
    const photo = pool.find((m) => stems(`${m.caption ?? ""} ${m.alt}`).some((w) => wanted.includes(w))) ?? pool[0]!;
    used.add(photo.key);
    return photo;
  };

  const pages: Page[] = [{ kind: "cover", key: "cover", photo: gallery[0] ?? null }];
  pages.push({ kind: "summary", key: "summary", photo: photoFor(), text: asset.summary });

  const figures = figuresOf(asset);
  const founder = asset.founder && isCertain(asset.founder.confidence) ? asset.founder.name : null;
  if (figures.length > 0) pages.push({ kind: "figures", key: "figures", photo: photoFor(), figures, founder });

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
      const title = chapter.title ?? "Tarihçe";
      pages.push({ kind: "chapter", key: `chapter-${chapter.id}`, photo: photoFor(title), chapter: i, title, sentence: firstSentence(chapter.body) });
    });

  pages.push({ kind: "end", key: "end", photo: gallery[0] ?? null });
  return pages;
}

/** The year it was built (when certain), then the record's certain measurements: three at most. */
function figuresOf(asset: AssetDetail): Figure[] {
  const figures: Figure[] = [];
  const year = builtYear(asset);
  if (year) figures.push({ value: year, unit: null, label: "Yapım yılı" });
  for (const fact of asset.facts) {
    if (figures.length === 3) break;
    if (fact.valueNum === null || !isCertain(fact.confidence)) continue;
    // No thousands dot under 10 000, so a year ("1573") never reads as "1.573".
    const value = fact.valueNum >= 10000 ? fact.valueNum.toLocaleString("tr-TR") : String(fact.valueNum);
    figures.push({ value, unit: fact.unit, label: fact.label });
  }
  return figures;
}

/**
 * When it was built, when the sources are sure of it: the first Gregorian year of the display
 * ("H. 802 / M. 1399-1400" → 1399; `startYear` is when building began), or the display itself
 * when it names no year ("XIV. yüzyıl").
 */
function builtYear(asset: AssetDetail): string | null {
  const dating = asset.dating;
  if (!dating?.display || !isCertain(dating.confidence)) return null;
  const year = dating.display.match(/M\.\s*(\d{3,4})/)?.[1] ?? dating.display.match(/\b\d{3,4}\b/)?.[0];
  return year ?? dating.display;
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
  children,
}: {
  page: Page;
  height: number;
  active: boolean;
  asset: AssetDetail;
  onRead: (chapter: number) => void;
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
    Animated.timing(enter, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [active, reduceMotion, enter]);

  return (
    <View style={[styles.page, { height }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [1.08, 1] }) }] }]}>
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
            { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] },
          ]}
        >
          <PageCopy page={page} asset={asset} onRead={onRead} />
        </Animated.View>
      )}
    </View>
  );
}

function PageCopy({ page, asset, onRead }: { page: Page; asset: AssetDetail; onRead: (chapter: number) => void }) {
  switch (page.kind) {
    case "cover": {
      const meta = [builtYear(asset), `${asset.district}, ${asset.city.label}`].filter(Boolean).join("  ·  ");
      return (
        <>
          <View style={styles.kicker}>
            <Text variant="caption" colorValue={ink.onGold} style={styles.bold}>
              {asset.type.label}
            </Text>
          </View>
          <Text headingLevel={1} colorValue={ink.text} style={styles.coverTitle}>
            {asset.name}
          </Text>
          {asset.subtitle && (
            <Text variant="bodyLarge" colorValue={ink.soft} style={styles.italic}>
              {asset.subtitle}
            </Text>
          )}
          <Text variant="caption" colorValue={ink.soft} style={styles.semibold}>
            {meta}
          </Text>
          <ScrollHint />
        </>
      );
    }
    case "summary":
      return (
        <Text colorValue={ink.text} style={styles.statement}>
          {page.text}
        </Text>
      );
    case "figures":
      return (
        <View style={styles.figures}>
          {page.figures.map((figure) => (
            <View key={figure.label} accessible accessibilityLabel={`${figure.label}: ${figure.value} ${figure.unit ?? ""}`}>
              <Text colorValue={ink.gold} style={styles.figureValue}>
                {figure.value}
                {figure.unit && <Text colorValue={ink.gold} style={styles.figureUnit}>{` ${figure.unit}`}</Text>}
              </Text>
              <Text variant="label" colorValue={ink.soft}>
                {figure.label}
              </Text>
            </View>
          ))}
          {page.founder && (
            <Text colorValue={ink.text} style={styles.founder}>
              {`${page.founder} yaptırdı.`}
            </Text>
          )}
        </View>
      );
    case "highlight":
      return (
        <>
          <Text variant="overline" colorValue={ink.gold}>
            {`YERİNDE BAKIN · ${page.number}/${page.total}`}
          </Text>
          <Text colorValue={ink.text} style={styles.pageTitle}>
            {page.title}
          </Text>
          {page.hint && (
            <Text variant="bodyLarge" colorValue={ink.soft}>
              {page.hint}
            </Text>
          )}
          {page.chapter >= 0 && <ReadMore onPress={() => onRead(page.chapter)} />}
        </>
      );
    case "chapter":
      return (
        <>
          <Text variant="overline" colorValue={ink.gold}>
            {page.title.toLocaleUpperCase("tr")}
          </Text>
          <Text colorValue={ink.text} style={styles.statement}>
            {page.sentence}
          </Text>
          <ReadMore onPress={() => onRead(page.chapter)} />
        </>
      );
    case "end":
      return null;
  }
}

/** "Kaydır" with a chevron that bobs, so the first page says how to go on. Still when motion is reduced. */
function ScrollHint() {
  const reduceMotion = useReducedMotion();
  const [bob] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, reduceMotion]);

  return (
    <View style={styles.hint} aria-hidden>
      <Animated.View style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, 6] }) }] }}>
        <Ionicons name="chevron-down" size={22} color={ink.text} />
      </Animated.View>
      <Text variant="caption" colorValue={ink.soft} style={styles.semibold}>
        Keşfetmek için kaydır
      </Text>
    </View>
  );
}

function ReadMore({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.readMore, pressed && styles.pressed]}>
      <Text variant="label" colorValue={ink.text}>
        Devamını oku
      </Text>
      <Ionicons name="arrow-forward" size={16} color={ink.text} />
    </Pressable>
  );
}

/** The page's photo; the drawing when there is none or it fails to load. */
function Backdrop({ photo, id }: { photo: Media | null; id: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={StyleSheet.absoluteFill}>
      <BuildingIllustration mode="now" id={`page-${id}`} />
      {photo && !failed && <AssetImage media={photo} decorative fill onError={() => setFailed(true)} />}
    </View>
  );
}

/** Dark at the top for the close button, clear in the middle, near-black under the words. */
function Scrim({ id, heavy }: { id: string; heavy: boolean }) {
  return (
    <View aria-hidden style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={`scrim-${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.gece1000} stopOpacity={heavy ? 0.82 : 0.55} />
            <Stop offset="0.2" stopColor={palette.gece1000} stopOpacity={heavy ? 0.86 : 0.15} />
            <Stop offset="0.35" stopColor={palette.gece1000} stopOpacity={heavy ? 0.9 : 0.5} />
            <Stop offset="0.55" stopColor={palette.gece1000} stopOpacity={heavy ? 0.93 : 0.86} />
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
  const rest = asset.media.filter((m) => (m.kind === "photo" || m.kind === "archive_photo") && m.key !== asset.cover?.key);
  return asset.cover ? [asset.cover, ...rest] : rest;
}

/** The dataset's fee codes; anything else is already a price in words. */
const fees: Record<string, string | null> = {
  free: "Ücretsiz",
  unknown: null,
};

/**
 * The last page, kept quiet: the name, one line of what the visit takes, directions, and the
 * experiences as a plain list. Scrolls on its own when it does not fit.
 */
function End({ asset, onTop, top, bottom }: { asset: AssetDetail; onTop: () => void; top: number; bottom: number }) {
  const raw = asset.visit.entranceFee;
  const fee = raw ? (raw in fees ? fees[raw] : raw) : null;
  const a11y = asset.accessibility;
  const stepFree = a11y.verified && a11y.stepFree !== "unknown" ? (a11y.stepFree === "no" ? "basamaklı giriş" : "basamaksız giriş") : null;
  const meta = [asset.visit.durationMin ? `~${asset.visit.durationMin} dk` : null, fee, stepFree, asset.district].filter(Boolean).join("  ·  ");
  const coords = asset.coordinates;

  return (
    <ScrollView style={StyleSheet.absoluteFill} nestedScrollEnabled contentContainerStyle={[styles.end, { paddingTop: top, paddingBottom: bottom + spacing.xxl }]}>
      <View style={styles.endInner}>
        <View style={styles.invite}>
          <Text variant="overline" colorValue={ink.gold}>
            KEŞFE ÇIK
          </Text>
          <Text headingLevel={2} colorValue={ink.text} style={styles.inviteTitle}>
            {asset.name}
          </Text>
          <Text variant="caption" colorValue={ink.soft} style={styles.semibold}>
            {meta}
          </Text>
          {asset.visit.notes && (
            <Text variant="caption" colorValue={ink.soft}>
              {asset.visit.notes}
            </Text>
          )}
          {coords && (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Yol tarifi al, harita uygulamasını açar"
              onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`)}
              style={({ pressed }) => [styles.directions, pressed && styles.pressed]}
            >
              <Ionicons name="navigate" size={18} color={ink.onGold} />
              <Text variant="label" colorValue={ink.onGold} style={styles.bold}>
                Yol tarifi al
              </Text>
            </Pressable>
          )}
        </View>

        <Experiences asset={asset} />
        {asset.visitorTips.length > 0 && <Tips asset={asset} />}

        <Pressable accessibilityRole="button" onPress={onTop} style={({ pressed }) => [styles.replay, pressed && styles.pressed]}>
          <Ionicons name="arrow-up" size={14} color={ink.soft} />
          <Text variant="caption" colorValue={ink.soft} style={styles.semibold}>
            Başa dön
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

/** The camera experiences, sound, spoken description and the assistant, a row each under hairlines. */
function Experiences({ asset }: { asset: AssetDetail }) {
  const { settings } = useA11ySettings();
  const player = useCapsulePlayer();
  const [describing, setDescribing] = useState(false);
  const soundKey = asset.ambientSound?.key ?? null;
  const capsuleType = soundKey ? capsuleForSoundKey(soundKey) : undefined;
  const playing = capsuleType !== undefined && player?.type === capsuleType ? player : null;
  const description = asset.accessibility.audioDescription;
  const inscriptions = useHasInscriptions(asset);

  const actions: Action[] = [];
  if (inscriptions) {
    actions.push({ key: "inscription", icon: "scan-outline", title: "Taşın Dili", hint: "Kitabeyi kamerayla oku", spoken: "Taşın Dili: kitabeyi kamerayla oku", href: { pathname: "/inscription", params: { asset: asset.id } } });
  }
  if (visitSealTarget(asset)) {
    const hint = "Eserde olduğunu kanıtla";
    actions.push({ key: "seal", icon: "ribbon-outline", title: "Ziyaret Mührü", hint, spoken: `Ziyaret Mührü: ${hint}`, href: { pathname: "/visit-seal", params: { asset: asset.id } } });
  }
  if (capsuleType) {
    // Only captions are announced; a counter that ticks every second would talk over everything.
    const hint = playing ? (settings.captions ? captionAt(capsuleType, playing.elapsed) : `${formatSeconds(playing.elapsed)} / ${formatSeconds(CAPSULE_SECONDS)}`) : capsules[capsuleType].name;
    actions.push({
      key: "sound",
      icon: playing ? "pause-outline" : "musical-notes-outline",
      title: playing ? "Durdur" : "Sesini dinle",
      hint,
      spoken: playing ? "Ses kapsülünü durdur" : `${capsules[capsuleType].name} ses kapsülünü çal`,
      onPress: () => toggleCapsule(capsuleType),
      on: !!playing,
    });
  }
  if (description) {
    actions.push({
      key: "describe",
      icon: describing ? "stop-outline" : "ear-outline",
      title: describing ? "Durdur" : "Sesli betimle",
      hint: "Mekânı gözünü kapatıp dinle",
      spoken: describing ? "Sesli betimlemeyi durdur" : "Mekânı sesli betimle",
      onPress: () => {
        if (describing) stopSpeaking();
        else speak(description);
        setDescribing(!describing);
      },
      on: describing,
    });
  }
  // Always offered: when no model answers, the assistant's screen says it is closed for now.
  actions.push({ key: "ask", icon: "sparkles-outline", title: "Sor", hint: "Asistan kaynağıyla cevaplar", spoken: `Bu eser hakkında sor: ${asset.name}, asistanı açar`, href: { pathname: "/assistant", params: { asset: asset.id, name: asset.name } } });
  return (
    <View style={styles.rows}>
      {actions.map((action) => (
        <Row key={action.key} action={action} live={action.key === "sound" && !!playing && settings.captions} />
      ))}
    </View>
  );
}

function Row({ action, live }: { action: Action; live: boolean }) {
  const content = (
    <>
      <Ionicons name={action.icon} size={22} color={ink.gold} />
      <View style={styles.flex}>
        <Text variant="label" colorValue={ink.text}>
          {action.title}
        </Text>
        <Text variant="caption" colorValue={ink.soft} numberOfLines={2} accessibilityLiveRegion={live ? "polite" : "none"}>
          {action.hint}
        </Text>
      </View>
      <Ionicons name={action.href ? "chevron-forward" : action.on ? "radio-button-on" : "play-circle-outline"} size={18} color={action.on ? ink.gold : ink.soft} />
    </>
  );
  if (action.href) {
    return (
      <Link href={action.href} asChild>
        {/* One flat style object: `Link asChild` takes neither a style function nor an array. */}
        <Pressable accessibilityRole="link" accessibilityLabel={action.spoken} style={styles.row}>
          {content}
        </Pressable>
      </Link>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={action.spoken} onPress={action.onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

/** Visitors' field notes, on the theme's own surface (the notes and their form are themed). */
function Tips({ asset }: { asset: AssetDetail }) {
  const { colors: c } = useTheme();
  return (
    <View style={[styles.tips, { backgroundColor: c.background }]}>
      <VisitorPulse asset={asset} />
    </View>
  );
}

/* ───────────────────────── Reader ───────────────────────── */

/** One chapter on a quiet page of its own: large text, its source, then the next chapter. */
function Reader({ chapters, index, onChange, assetName }: { chapters: AssetSection[]; index: number | null; onChange: (index: number | null) => void; assetName: string }) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const chapter = index !== null ? chapters[index] : undefined;
  const next = index !== null ? chapters[index + 1] : undefined;
  const close = () => onChange(null);

  return (
    <Modal visible={!!chapter} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
      {chapter && index !== null && (
        <View style={[styles.flex, { backgroundColor: c.background, paddingTop: insets.top }]}>
          <View style={styles.readerBar}>
            <Text variant="caption" color="textSecondary" numberOfLines={1} style={[styles.flex, styles.mono]}>
              {`${assetName} · ${index + 1}/${chapters.length}`}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Kapat" hitSlop={6} onPress={close} style={[styles.round, { backgroundColor: c.surfaceRaised }]}>
              <Ionicons name="close" size={20} color={c.text} />
            </Pressable>
          </View>
          <View style={[styles.progress, { backgroundColor: c.border }]} aria-hidden>
            <View style={[styles.progress, { backgroundColor: c.highlightMark, width: `${((index + 1) / chapters.length) * 100}%` }]} />
          </View>

          <ScrollView key={chapter.id} contentContainerStyle={[styles.readerBody, { paddingBottom: insets.bottom + spacing.xxxl }]}>
            <Text variant="title" headingLevel={1}>
              {chapter.title ?? "Tarihçe"}
            </Text>
            <Text style={styles.prose}>{chapter.body}</Text>
            <SourceNote compact sources={chapter.sources} />

            {next ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Sonraki bölüm: ${next.title ?? "Tarihçe"}`}
                onPress={() => onChange(index + 1)}
                style={({ pressed }) => [styles.next, { backgroundColor: c.surface, borderColor: c.border }, pressed && styles.pressed]}
              >
                <View style={styles.flex}>
                  <Text variant="caption" color="textSecondary">
                    Sonraki bölüm
                  </Text>
                  <Text variant="label">{next.title ?? "Tarihçe"}</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color={c.text} />
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" onPress={close} style={({ pressed }) => [styles.done, { backgroundColor: c.text }, pressed && styles.pressed]}>
                <Text variant="label" colorValue={c.background}>
                  Bitti
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  tips: {
    padding: spacing.lg,
    borderRadius: radius.xl,
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
