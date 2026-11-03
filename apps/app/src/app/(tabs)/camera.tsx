import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetDetail, InscriptionV2, Media } from "@vagabonds/contracts";
import { cameraColors, cameraGlass, fontFamily, radius, spacing, Text, useTheme } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import Head from "expo-router/head";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { featuredInscription, INSCRIPTION_ASSET } from "@/ar/inscription-targets";
import { AssetImage } from "@/components/asset-image";
import { useAsset } from "@/data";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { visitSealTarget } from "@/lib/visit-seal";

/** The portal of Ulucami on its cover photo, as fractions of the photo: where Ziyaret Mührü's demo zooms in. */
const PORTAL = { x: 0.495, y: 0.67 };
/**
 * The lines of Azeb Bey Türbesi's door inscription on its photo (the one the camera recognizes),
 * as fractions of the photo: where Taşın Dili's demo locks on.
 */
const INSCRIPTION_PANEL = { x: 0.32, y: 0.47, width: 0.37, height: 0.3 };

/** Height of the title strip over the bottom of each card; the demos keep their action above it. */
const FOOTER = 108;

interface Mode {
  key: "seal" | "inscription";
  icon: ComponentProps<typeof Ionicons>["name"];
  /**
   * The asset whose photos the demo plays on. The card opens the experience on its own default
   * asset: Taşın Dili's camera needs an inscription with an AR target, which the demo's may lack.
   */
  asset: string;
  path: "/visit-seal" | "/inscription";
  title: string;
  description: string;
  web: string;
}

const modes: Mode[] = [
  {
    key: "seal",
    icon: "ribbon",
    asset: "bursa-osmangazi-ulucami",
    path: "/visit-seal",
    title: "Ziyaret Mührü",
    description: "Eserin belirli bir kısmını çek, orada olduğunu kanıtla ve sisi kaldır.",
    web: "Web'de: hangi kısmı çekeceğin gösterilir; mühür telefonda.",
  },
  {
    key: "inscription",
    icon: "scan",
    asset: INSCRIPTION_ASSET,
    path: "/inscription",
    title: "Taşın Dili",
    description: "Kitabeyi okut, günümüz Türkçesiyle oku.",
    web: "Web'de: kitabenin okunuşu ve günümüz Türkçesi doğrudan okunur.",
  },
];

/**
 * Kamera: the two camera experiences one under the other, each playing a short demo of
 * itself on a real monument, so what it does is seen before it is read.
 */
export default function CameraScreen() {
  const { colors: c } = useTheme();
  const web = Platform.OS === "web";
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: c.background,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: spacing.md,
        },
      ]}
    >
      <Head>
        <title>Kamera · Vagabonds</title>
      </Head>
      <View style={styles.column}>
        <Text variant="title" headingLevel={1}>
          Kamera
        </Text>
        {modes.map((mode) => (
          <ModeCard key={mode.key} mode={mode} web={web} />
        ))}
      </View>
    </View>
  );
}

/**
 * One experience: its demo fills the card, its name and a go button sit over the bottom on a dark
 * fade. The whole card opens it.
 */
function ModeCard({ mode, web }: { mode: Mode; web: boolean }) {
  const router = useRouter();
  const resource = useAsset(mode.asset);
  const asset = resource.status === "success" ? resource.data : null;
  const seal = asset ? visitSealTarget(asset) : null;
  // Taşın Dili plays on the photo its camera recognizes, so the demo is what the camera does.
  const inscription = asset ? featuredInscription(asset) : undefined;
  const inscriptionPhoto = asset?.media.find((m) => m.key === inscription?.arTargetMediaKey);
  const [box, setBox] = useState<Box>({ width: 0, height: 0 });
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(mode.path)}
      // The name is the visible title alone (WCAG 2.5.3, a voice command says it); what it does is the hint.
      accessibilityLabel={mode.title}
      accessibilityHint={web ? mode.web : mode.description}
      // The web drops the hint: there the visible caption is the card's description.
      aria-describedby={`camera-${mode.key}-hint`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardInner} onLayout={(e: LayoutChangeEvent) => setBox(e.nativeEvent.layout)}>
        <View style={StyleSheet.absoluteFill} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {box.width > 0 && asset?.cover ? (
            mode.key === "seal" ? (
              seal && <SealPreview asset={asset} cover={asset.cover} part={seal.part} box={box} />
            ) : (
              inscription &&
              inscriptionPhoto && <InscriptionPreview inscription={inscription} photo={inscriptionPhoto} box={box} />
            )
          ) : null}
          <Fade id={`fade-${mode.key}`} />
          <View style={styles.badge}>
            <Ionicons name={mode.icon} size={18} color={cameraColors.gold} />
          </View>
        </View>
        <View style={styles.footer}>
          <View style={styles.flex}>
            <Text variant="heading" colorValue={cameraColors.text} numberOfLines={1}>
              {mode.title}
            </Text>
            {/* The card's hint (its description on the web), so not read again as part of its name. */}
            <Text variant="caption" colorValue={cameraColors.textSecondary} numberOfLines={2} aria-hidden nativeID={`camera-${mode.key}-hint`}>
              {web ? mode.web : mode.description}
            </Text>
          </View>
          <View style={styles.go}>
            <Ionicons name="arrow-forward" size={20} color={cameraColors.onGold} aria-hidden accessibilityElementsHidden importantForAccessibility="no" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** The dark fade under a card's title, so it reads on any photo. */
function Fade({ id }: { id: string }) {
  return (
    <View pointerEvents="none" style={styles.fade}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={cameraColors.background} stopOpacity={0} />
            <Stop offset="0.55" stopColor={cameraColors.background} stopOpacity={0.75} />
            <Stop offset="1" stopColor={cameraColors.background} stopOpacity={0.95} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

interface Box {
  width: number;
  height: number;
}

/** Where a photo lands when it fills `box` like "cover", cropped around its focal point. */
function coverRect(media: Media, box: Box) {
  const width = Math.max(box.width, box.height * media.aspectRatio);
  const height = width / media.aspectRatio;
  const focal = media.focalPoint ?? { x: 0.5, y: 0.5 };
  return {
    left: (box.width - width) * focal.x,
    top: (box.height - height) * focal.y,
    width,
    height,
  };
}

/**
 * The shift that brings `point` (in box pixels) to `aim` at `zoom`, as far as the photo's edges
 * allow: zoomed about the box's centre, the photo always covers the box, never showing a gap.
 */
function zoomShift(rect: ReturnType<typeof coverRect>, box: Box, zoom: number, point: { x: number; y: number }, aim: { x: number; y: number }) {
  const cx = box.width / 2;
  const cy = box.height / 2;
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);
  const x = clamp(aim.x - cx - (point.x - cx) * zoom, box.width - cx - (rect.left + rect.width - cx) * zoom, -cx - (rect.left - cx) * zoom);
  const y = clamp(aim.y - cy - (point.y - cy) * zoom, box.height - cy - (rect.top + rect.height - cy) * zoom, -cy - (rect.top - cy) * zoom);
  return { x, y };
}

/** A photo drawn exactly in its cover rect, so points on it can be found again. */
function Photo({ media, box }: { media: Media; box: Box }) {
  return (
    <View style={[styles.photo, coverRect(media, box)]}>
      <AssetImage media={media} fill decorative />
    </View>
  );
}

/**
 * Runs `steps` one after another, forever, and reports which one is playing. With reduced
 * motion it shows the last step's phase and stops.
 */
function usePhases<P extends string>(steps: Array<[P, () => Animated.CompositeAnimation]>, reset: () => void, still: () => void): P {
  const reduceMotion = useReducedMotion();
  const last = steps[steps.length - 1]![0];
  const [phase, setPhase] = useState<P>(steps[0]![0]);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  useEffect(() => {
    if (reduceMotion) {
      still();
      setPhase(last);
      return;
    }
    let alive = true;
    let current: Animated.CompositeAnimation | null = null;
    const play = (i: number) => {
      if (!alive) return;
      if (i === 0) reset();
      const [name, make] = stepsRef.current[i]!;
      setPhase(name);
      current = make();
      current.start(({ finished }) => finished && play((i + 1) % stepsRef.current.length));
    };
    play(0);
    return () => {
      alive = false;
      current?.stop();
    };
    // The steps are rebuilt every render; the loop reads the latest through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  return phase;
}

const ease = Easing.inOut(Easing.cubic);
const timing = (value: Animated.Value, toValue: number, duration: number, native = false) =>
  Animated.timing(value, {
    toValue,
    duration,
    easing: ease,
    useNativeDriver: native,
  });

/**
 * Ziyaret Mührü in miniature: from the whole monument the viewfinder closes in on the one part
 * that carries the seal, the corners lock onto it, a short hold fills, and the seal comes down
 * like a stamp.
 */
function SealPreview({ asset, cover, part, box }: { asset: AssetDetail; cover: Media; part: string; box: Box }) {
  const zoom = useRef(new Animated.Value(0)).current;
  const lock = useRef(new Animated.Value(0)).current;
  const hold = useRef(new Animated.Value(0)).current;
  const stamp = useRef(new Animated.Value(0)).current;

  const phase = usePhases(
    [
      ["search", () => Animated.sequence([Animated.delay(500), Animated.parallel([timing(zoom, 1, 1600, true), timing(lock, 1, 1600, true)])])],
      ["hold", () => Animated.sequence([Animated.delay(150), timing(hold, 1, 1000)])],
      [
        "sealed",
        () =>
          Animated.sequence([
            Animated.spring(stamp, { toValue: 1, damping: 8, stiffness: 160, mass: 0.7, useNativeDriver: true }),
            Animated.delay(1700),
            Animated.parallel([timing(stamp, 0, 400, true), timing(lock, 0, 500, true), timing(zoom, 0, 900, true)]),
          ]),
      ],
    ],
    () => {
      zoom.setValue(0);
      lock.setValue(0);
      hold.setValue(0);
      stamp.setValue(0);
    },
    () => {
      zoom.setValue(1);
      lock.setValue(1);
      hold.setValue(1);
      stamp.setValue(1);
    },
  );

  // Zoom about the portal until it sits in the middle of the frame, where the seal comes down.
  const rect = coverRect(cover, box);
  const portal = { x: rect.left + PORTAL.x * rect.width, y: rect.top + PORTAL.y * rect.height };
  const ZOOM = 2.1;
  // The middle of the photo above the title strip, a little under the status chip.
  const centre = { x: box.width / 2, y: (box.height - FOOTER) / 2 + 14 };
  const end = zoomShift(rect, box, ZOOM, portal, centre);
  // Where the portal really lands, should the photo's edge stop it short of the centre.
  const target = { x: centre.x + (portal.x - centre.x) * ZOOM + end.x, y: centre.y + (portal.y - centre.y) * ZOOM + end.y };
  const scale = zoom.interpolate({ inputRange: [0, 1], outputRange: [1, ZOOM] });
  const shiftX = zoom.interpolate({ inputRange: [0, 1], outputRange: [0, end.x] });
  const shiftY = zoom.interpolate({ inputRange: [0, 1], outputRange: [0, end.y] });

  const frame = Math.min(box.width * 0.3, ((box.height - FOOTER) * 0.62) / 1.3, 140);
  const frameScale = lock.interpolate({ inputRange: [0, 1], outputRange: [1.9, 1] });
  const frameOpacity = lock.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] });
  const holdWidth = hold.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  const stampScale = stamp.interpolate({ inputRange: [0, 1], outputRange: [2.2, 1] });
  const stampOpacity = stamp.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] });
  const seal = Math.min(box.width * 0.46, (box.height - FOOTER) * 0.68);
  const locked = phase !== "search";

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: shiftX }, { translateY: shiftY }, { scale }] }]}>
        <Photo media={cover} box={box} />
      </Animated.View>
      <Spotlight rect={{ left: target.x - frame / 2, top: target.y - frame * 0.65, width: frame, height: frame * 1.3 }} box={box} opacity={lock} />

      <Animated.View
        style={[
          styles.lock,
          { width: frame, height: frame * 1.3, left: target.x - frame / 2, top: target.y - frame * 0.65 },
          { opacity: frameOpacity, transform: [{ scale: frameScale }] },
        ]}
      >
        {(["topLeft", "topRight", "bottomLeft", "bottomRight"] as const).map((corner) => (
          <View key={corner} style={[styles.corner, styles[corner], { borderColor: locked ? cameraColors.gold : cameraColors.text }]} />
        ))}
      </Animated.View>

      {phase === "hold" && (
        <View style={[styles.holdTrack, { width: frame, left: target.x - frame / 2, top: target.y + frame * 0.65 + spacing.sm }]}>
          <Animated.View style={[styles.holdBar, { width: holdWidth }]} />
        </View>
      )}

      <Animated.View
        style={[
          styles.stamp,
          { width: seal, height: seal, borderRadius: seal / 2, left: centre.x - seal / 2, top: centre.y - seal / 2 },
          { opacity: stampOpacity, transform: [{ scale: stampScale }, { rotate: "-12deg" }] },
        ]}
      >
        <View style={[styles.stampInner, { borderRadius: seal / 2 }]}>
          <Ionicons name="ribbon" size={seal * 0.2} color={cameraColors.gold} />
          <Text style={styles.stampLabel} colorValue={cameraColors.gold}>
            MÜHÜRLENDİ
          </Text>
        </View>
      </Animated.View>

      <Status
        done={phase === "sealed"}
        label={phase === "search" ? `Mühür kısmı: ${part}` : phase === "hold" ? "Tanındı, sabit tut" : `${asset.name} mühürlendi`}
      />
    </View>
  );
}

/**
 * Taşın Dili in miniature: the frame wanders over the wall like a hand-held phone, closes in
 * on the inscription, the corners lock, and the reading comes up: first the Ottoman,
 * then today's Turkish.
 */
function InscriptionPreview({ inscription, photo, box }: { inscription: InscriptionV2; photo: Media; box: Box }) {
  const settle = useRef(new Animated.Value(0)).current;
  const lock = useRef(new Animated.Value(0)).current;
  const card = useRef(new Animated.Value(0)).current;
  const turn = useRef(new Animated.Value(0)).current;

  const phase = usePhases(
    [
      ["search", () => Animated.sequence([Animated.delay(400), timing(settle, 1, 1600, true)])],
      ["found", () => Animated.sequence([timing(lock, 1, 350, true), Animated.delay(250), timing(card, 1, 500, true), Animated.delay(1300)])],
      [
        "read",
        () =>
          Animated.sequence([
            timing(turn, 1, 450, true),
            Animated.delay(2600),
            Animated.parallel([timing(card, 0, 400, true), timing(lock, 0, 400, true), timing(settle, 0, 900, true)]),
          ]),
      ],
    ],
    () => {
      settle.setValue(0);
      lock.setValue(0);
      card.setValue(0);
      turn.setValue(0);
    },
    () => {
      settle.setValue(1);
      lock.setValue(1);
      card.setValue(1);
      turn.setValue(1);
    },
  );

  // Settled, the inscription fills the upper part of the frame, above the reading card; before
  // that the view is wider and off to one side.
  const rect = coverRect(photo, box);
  const panel = {
    x: rect.left + (INSCRIPTION_PANEL.x + INSCRIPTION_PANEL.width / 2) * rect.width,
    y: rect.top + (INSCRIPTION_PANEL.y + INSCRIPTION_PANEL.height / 2) * rect.height,
    width: INSCRIPTION_PANEL.width * rect.width,
    height: INSCRIPTION_PANEL.height * rect.height,
  };
  // Never below 1: zoomed out, the photo would no longer cover the frame and leave a gap at its side.
  // On a short card the reading takes one line a language, leaving room for the frame above it.
  const stage = box.height - FOOTER;
  const compact = stage < 230;
  const free = stage - (compact ? 64 : 88);
  const ZOOM = Math.max(Math.min((box.width * 0.6) / panel.width, (free * 0.62) / panel.height), 1.05);
  const aim = { x: box.width / 2, y: free * 0.55 };
  const START = 1.14;
  const start = zoomShift(rect, box, START, { x: box.width * 0.46, y: box.height * 0.47 }, { x: box.width / 2, y: box.height / 2 });
  const end = zoomShift(rect, box, ZOOM, panel, aim);
  // Where the panel really lands, should the photo's edge stop it short of the aim.
  const landed = { x: box.width / 2 + (panel.x - box.width / 2) * ZOOM + end.x, y: box.height / 2 + (panel.y - box.height / 2) * ZOOM + end.y };
  const driftX = settle.interpolate({ inputRange: [0, 1], outputRange: [start.x, end.x] });
  const driftY = settle.interpolate({ inputRange: [0, 1], outputRange: [start.y, end.y] });
  const zoom = settle.interpolate({ inputRange: [0, 1], outputRange: [START, ZOOM] });
  const frame = { width: panel.width * ZOOM + 16, height: panel.height * ZOOM + 16 };
  const frameScale = lock.interpolate({ inputRange: [0, 1], outputRange: [1.12, 1] });
  const cardY = card.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  const ottoman = turn.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const found = phase !== "search";

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: driftX }, { translateY: driftY }, { scale: zoom }] }]}>
        <Photo media={photo} box={box} />
      </Animated.View>

      <Spotlight rect={{ left: landed.x - frame.width / 2, top: landed.y - frame.height / 2, width: frame.width, height: frame.height }} box={box} opacity={lock} />

      <Animated.View
        style={[
          styles.lock,
          { width: frame.width, height: frame.height, left: landed.x - frame.width / 2, top: landed.y - frame.height / 2 },
          { opacity: lock, transform: [{ scale: frameScale }] },
        ]}
      >
        {(["topLeft", "topRight", "bottomLeft", "bottomRight"] as const).map((corner) => (
          <View key={corner} style={[styles.corner, styles[corner], { borderColor: cameraColors.gold }]} />
        ))}
      </Animated.View>

      <Animated.View style={[styles.reading, { opacity: card, transform: [{ translateY: cardY }] }]}>
        <Animated.View style={[styles.cardLayer, { opacity: ottoman }]}>
          <Text variant="overline" colorValue={cameraColors.gold}>
            OKUNUŞ
          </Text>
          <Text style={styles.ottoman} colorValue={cameraColors.text} numberOfLines={compact ? 1 : 2}>
            {inscription.transliteration}
          </Text>
        </Animated.View>
        <Animated.View style={[styles.cardLayer, StyleSheet.absoluteFill, styles.cardTurned, { opacity: turn }]}>
          <Text variant="overline" colorValue={cameraColors.gold}>
            GÜNÜMÜZ TÜRKÇESİ
          </Text>
          <Text variant="caption" colorValue={cameraColors.text} numberOfLines={compact ? 1 : 2}>
            {inscription.translation}
          </Text>
        </Animated.View>
      </Animated.View>

      <Status done={found} label={found ? "Kitabe bulundu" : "Kitabe aranıyor"} />
    </View>
  );
}

/**
 * Dims everything around the focus frame, so the locked part stands out and the corners read on
 * any photo. Four bands around `rect`; `opacity` fades them in with the lock.
 */
function Spotlight({ rect: raw, box, opacity }: { rect: { left: number; top: number; width: number; height: number }; box: Box; opacity: Animated.AnimatedInterpolation<number> | Animated.Value }) {
  // Whole pixels, so the four bands meet without a seam.
  const rect = { left: Math.round(raw.left), top: Math.round(raw.top), width: Math.round(raw.width), height: Math.round(raw.height) };
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <View style={[styles.dim, { left: 0, right: 0, top: 0, height: Math.max(rect.top, 0) }]} />
      <View style={[styles.dim, { left: 0, right: 0, top: bottom, bottom: 0 }]} />
      <View style={[styles.dim, { left: 0, width: Math.max(rect.left, 0), top: rect.top, height: rect.height }]} />
      <View style={[styles.dim, { left: right, right: 0, top: rect.top, height: rect.height }]} />
    </Animated.View>
  );
}

/** The state of the preview in the corner of the viewfinder, like a camera's focus readout. */
function Status({ label, done }: { label: string; done: boolean }) {
  return (
    <View style={styles.status}>
      {done ? (
        <Ionicons name="checkmark-circle" size={14} color={cameraColors.gold} />
      ) : (
        <View style={[styles.statusDot, { backgroundColor: cameraColors.text }]} />
      )}
      <Text style={styles.statusLabel} colorValue={cameraColors.text}>
        {label.toLocaleUpperCase("tr")}
      </Text>
    </View>
  );
}

const CORNER = 26;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  column: {
    flex: 1,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  card: {
    flex: 1,
    minHeight: 260,
    borderRadius: 28,
    backgroundColor: cameraColors.panel,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  cardInner: {
    flex: 1,
    borderRadius: 28,
    overflow: "hidden",
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: FOOTER + 48,
  },
  badge: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: cameraGlass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(221,181,92,0.6)",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: FOOTER,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  flex: {
    flex: 1,
    gap: spacing.xxs,
  },
  go: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: cameraColors.gold,
  },
  photo: {
    position: "absolute",
  },
  status: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: cameraGlass,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginHorizontal: 3,
  },
  statusLabel: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.2,
  },
  holdTrack: {
    position: "absolute",
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  holdBar: {
    height: "100%",
    backgroundColor: cameraColors.gold,
  },
  stamp: {
    position: "absolute",
    padding: 6,
    borderWidth: 3,
    borderColor: cameraColors.gold,
    backgroundColor: "rgba(10,14,22,0.55)",
  },
  stampInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: cameraColors.gold,
  },
  stampLabel: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 2,
  },
  lock: {
    position: "absolute",
  },
  corner: {
    position: "absolute",
    width: CORNER,
    height: CORNER,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  dim: {
    position: "absolute",
    backgroundColor: "rgba(6,8,13,0.55)",
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: radius.md,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: radius.md,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: radius.md,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: radius.md,
  },
  reading: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: FOOTER,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: "rgba(10,14,22,0.82)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(221,181,92,0.5)",
  },
  cardLayer: {
    gap: spacing.xxs,
  },
  cardTurned: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  ottoman: {
    fontFamily: fontFamily.display,
    fontSize: 15,
    lineHeight: 21,
  },
});
