import { Button, cameraColors, cameraGlass, fontFamily, radius, spacing, Text } from "@vagabonds/ui";
import Head from "expo-router/head";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, G, Line, Path, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";

import { CameraTopBar, GlassIconButton } from "@/components/camera-chrome";
import { InscriptionReading } from "@/components/inscription-reading";
import { inscription, inscriptionReadAloud } from "@/content/camera";
import { speak } from "@/lib/speak";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useScreenReaderEnabled } from "@/lib/use-screen-reader";
import { useA11ySettings } from "@/settings/a11y-settings";

type Phase = "scanning" | "locked" | "revealed";

/** Scene in the design's 280×600 grid, scaled to cover the screen. */
const SCENE = { width: 280, height: 600 };
const PLAQUE = { x: 30, y: 112, width: 220, height: 130 };
const LOCK_MS = 1900;
const REVEAL_MS = 2700;

/**
 * Taşın Dili (module 2). Three states: searching (scan line), locked (gold
 * corners on the plaque, green dot) and revealed (the inscription glows, its
 * reading, meaning and the waqf's condition rise in a card below).
 *
 * Marker recognition is simulated until the AR prototype lands (Y5, H7).
 *
 * The camera-free reading mode (K7) opens instead on the web (no camera,
 * ADR 0001) and when a screen reader is on; on a phone it is one tap away.
 */
export default function InscriptionScreen() {
  const web = Platform.OS === "web";
  const screenReader = useScreenReaderEnabled();
  const [mode, setMode] = useState<"camera" | "reading">(web ? "reading" : "camera");

  // A screen reader cannot follow a scan line; start such users on the text.
  useEffect(() => {
    if (screenReader) setMode("reading");
  }, [screenReader]);

  return (
    <>
      <Head>
        <title>Taşın Dili · Vagabonds</title>
      </Head>
      {mode === "reading" ? (
        <InscriptionReading onUseCamera={web ? null : () => setMode("camera")} />
      ) : (
        <InscriptionCamera onReadAsText={() => setMode("reading")} />
      )}
    </>
  );
}

function InscriptionCamera({ onReadAsText }: { onReadAsText: () => void }) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { settings } = useA11ySettings();
  const [phase, setPhase] = useState<Phase>("scanning");
  const [size, setSize] = useState({ width: 0, height: 0 });
  const scan = useRef(new Animated.Value(0)).current;
  const card = useRef(new Animated.Value(0)).current;
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const run = useCallback(() => {
    timers.current.forEach(clearTimeout);
    card.setValue(0);
    if (reduceMotion) {
      setPhase("revealed");
      card.setValue(1);
      return;
    }
    setPhase("scanning");
    timers.current = [
      setTimeout(() => {
        setPhase("locked");
        AccessibilityInfo.announceForAccessibility("Kitabe tanındı, hedef kilitli");
      }, LOCK_MS),
      setTimeout(() => {
        setPhase("revealed");
        AccessibilityInfo.announceForAccessibility("Kitabe çözüldü. Meal ve vakfiye şartı aşağıda.");
        Animated.timing(card, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      }, REVEAL_MS),
    ];
  }, [card, reduceMotion]);

  useEffect(() => {
    run();
    return () => timers.current.forEach(clearTimeout);
  }, [run]);

  useEffect(() => {
    if (phase !== "scanning" || reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scan, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scan, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, reduceMotion, scan]);

  // Same mapping as the SVG's "xMidYMid slice", so overlays line up with the plaque.
  const s = Math.max(size.width / SCENE.width, size.height / SCENE.height) || 1;
  const ox = (size.width - SCENE.width * s) / 2;
  const oy = (size.height - SCENE.height * s) / 2;
  const toY = (y: number) => y * s + oy;
  const cardTop = Math.max(insets.top + 260, toY(300));

  const status = phase === "scanning" ? "Kitabe aranıyor…" : "Kitabe tanındı · hedef kilitli";

  return (
    <View style={styles.screen} onLayout={(e) => setSize(e.nativeEvent.layout)}>
      <Wall phase={phase} />

      {phase === "scanning" && size.width > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.scanLine,
            {
              left: 24 * s + ox,
              right: 24 * s + ox,
              top: toY(96),
              transform: [{ translateY: scan.interpolate({ inputRange: [0, 1], outputRange: [0, 160 * s] }) }],
            },
          ]}
        />
      )}

      <View style={[styles.top, { top: insets.top + spacing.sm }]}>
        <CameraTopBar title="Taşın Dili" subtitle="Giriş kapısının üzerindeki kitabeye odaklan">
          <GlassIconButton icon="document-text-outline" label="Kamerasız oku" onPress={onReadAsText} />
        </CameraTopBar>
      </View>

      <View style={[styles.status, { top: Math.min(toY(262), cardTop - 52) }]} accessibilityRole="text" accessibilityLiveRegion="polite">
        <View style={[styles.dot, { backgroundColor: phase === "scanning" ? cameraColors.textSecondary : "#5FD3A4" }]} />
        <Text variant="caption" colorValue={cameraColors.text}>
          {status}
        </Text>
      </View>

      <Animated.View
        style={[
          styles.card,
          {
            top: cardTop,
            bottom: insets.bottom + spacing.sm,
            transform: [{ translateY: card.interpolate({ inputRange: [0, 1], outputRange: [size.height, 0] }) }],
          },
        ]}
        accessibilityElementsHidden={phase !== "revealed"}
        importantForAccessibility={phase === "revealed" ? "auto" : "no-hide-descendants"}
      >
        <ScrollView contentContainerStyle={styles.cardContent}>
          <Text variant="overline" colorValue={cameraColors.textSecondary} style={styles.center}>
            ORİJİNAL HAT · ARAPÇA
          </Text>
          <Text variant="inscription" colorValue={cameraColors.gold} style={styles.center} language="ar">
            {inscription.lines.join("\n")}
          </Text>
          <Text variant="caption" colorValue={cameraColors.textSecondary} style={[styles.center, styles.italic]}>
            {inscription.transcription}
          </Text>
          <Section title="SADELEŞTİRİLMİŞ MEAL">
            <Text colorValue={cameraColors.text}>{inscription.meaning}</Text>
          </Section>
          <Section title="VAKFİYENİN ŞARTI">
            <View style={styles.quote}>
              <Text variant="bodyLarge" colorValue={cameraColors.text} style={styles.quoteText}>
                {`“${inscription.waqfCondition}”`}
              </Text>
            </View>
          </Section>
          <View style={styles.buttons}>
            <Button
              label="Yeniden tara"
              onPress={run}
              colors={[cameraGlass, cameraColors.text, "rgba(255,255,255,0.16)"]}
              style={styles.flex}
            />
            {settings.audioDescription && (
              <Button
                label="Sesli oku"
                onPress={() => speak(inscriptionReadAloud)}
                colors={[cameraColors.gold, cameraColors.onGold]}
                style={styles.flex}
              />
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="overline" colorValue={cameraColors.textSecondary} headingLevel={2}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/** The wall, the arched door and the plaque, with the gold glow once the plaque is recognized. */
function Wall({ phase }: { phase: Phase }) {
  const locked = phase !== "scanning";
  // Corner marks: wide while searching, snapped onto the plaque once locked.
  const box = locked ? { l: 22, r: 258, t: 104, b: 250 } : { l: 10, r: 270, t: 80, b: 284 };
  const k = 22;
  const corner = locked ? cameraColors.gold : cameraColors.text;
  const arabic = { fontFamily: fontFamily.arabic, fontSize: 25, textAnchor: "middle" as const };

  // Hidden on a wrapping View: react-native-svg passes accessibility props on to the DOM on the web.
  return (
    <View aria-hidden style={StyleSheet.absoluteFill}>
      <Svg
        style={StyleSheet.absoluteFill}
        viewBox={`0 0 ${SCENE.width} ${SCENE.height}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <Defs>
          <RadialGradient id="stone" cx="50%" cy="28%" r="80%">
            <Stop offset="0" stopColor="#968b7b" />
            <Stop offset="0.6" stopColor="#544b40" />
            <Stop offset="1" stopColor="#26221d" />
          </RadialGradient>
        </Defs>
        <Rect width={SCENE.width} height={SCENE.height} fill="url(#stone)" />
        {Array.from({ length: 14 }, (_, i) => (
          <Line key={`h${i}`} x1={0} x2={SCENE.width} y1={i * 44} y2={i * 44} stroke="rgba(0,0,0,0.28)" strokeWidth={2} />
        ))}
        {Array.from({ length: 4 }, (_, i) => (
          <Line key={`v${i}`} y1={0} y2={SCENE.height} x1={i * 88} x2={i * 88} stroke="rgba(0,0,0,0.2)" strokeWidth={2} />
        ))}
        <Path d="M56 622V346a84 84 0 0 1 168 0V622z" fill="#191613" stroke="#7a6f60" strokeWidth={9} />

        <G transform={`translate(${PLAQUE.x} ${PLAQUE.y})`}>
          <Rect x={2} y={2} width={216} height={126} rx={3} fill="#B9AD97" stroke="#857A68" strokeWidth={3} />
          <Rect x={10} y={10} width={200} height={110} fill="none" stroke="#857A68" strokeWidth={1.2} />
          <Line x1={16} y1={66} x2={204} y2={66} stroke="#857A68" strokeWidth={0.9} />
          <SvgText x={110.8} y={48.8} fill="#D8CDB8" {...arabic}>{inscription.lines[0]}</SvgText>
          <SvgText x={110} y={48} fill="#5B5243" {...arabic}>{inscription.lines[0]}</SvgText>
          <SvgText x={110.8} y={102.8} fill="#D8CDB8" {...arabic}>{inscription.lines[1]}</SvgText>
          <SvgText x={110} y={102} fill="#5B5243" {...arabic}>{inscription.lines[1]}</SvgText>
          {locked && (
            <G>
              <Rect x={2} y={2} width={216} height={126} rx={3} fill="rgba(231,194,106,0.1)" stroke={cameraColors.gold} strokeWidth={1} />
              <SvgText x={110} y={48} fill="#F6D98E" {...arabic}>{inscription.lines[0]}</SvgText>
              <SvgText x={110} y={102} fill="#F6D98E" {...arabic}>{inscription.lines[1]}</SvgText>
            </G>
          )}
        </G>

        <G stroke={corner} strokeWidth={3} fill="none">
          <Path d={`M${box.l} ${box.t + k}V${box.t}H${box.l + k}`} />
          <Path d={`M${box.r - k} ${box.t}H${box.r}V${box.t + k}`} />
          <Path d={`M${box.l} ${box.b - k}V${box.b}H${box.l + k}`} />
          <Path d={`M${box.r - k} ${box.b}H${box.r}V${box.b - k}`} />
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: cameraColors.background,
    overflow: "hidden",
  },
  flex: {
    flex: 1,
  },
  center: {
    textAlign: "center",
  },
  italic: {
    fontFamily: fontFamily.mono,
    fontStyle: "italic",
  },
  top: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    maxWidth: 720,
    alignSelf: "center",
  },
  scanLine: {
    position: "absolute",
    height: 2,
    backgroundColor: cameraColors.gold,
    shadowColor: cameraColors.gold,
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  status: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: cameraGlass,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  card: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    maxWidth: 720,
    alignSelf: "center",
    backgroundColor: cameraColors.panel,
    borderRadius: radius.xl + 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  cardContent: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  section: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  quote: {
    borderLeftWidth: 2,
    borderLeftColor: cameraColors.gold,
    paddingLeft: spacing.md,
  },
  quoteText: {
    fontFamily: fontFamily.display,
  },
  buttons: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
