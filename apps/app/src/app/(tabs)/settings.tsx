import Ionicons from "@expo/vector-icons/Ionicons";
import {
  fontFamily,
  palette,
  radius,
  spacing,
  Text,
  touchTarget,
  useTheme,
} from "@vagabonds/ui";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import Head from "expo-router/head";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

import { DeleteAccount } from "@/components/delete-account";
import { AVATAR_BADGE, AvatarEditor } from "@/components/avatar-editor";
import { OpenBookLink } from "@/components/journal/open-book";
import {
  avatarUri,
  logout,
  refreshMe,
  useCommunity,
  useMyAchievements,
  useMyContributions,
  useWallet,
} from "@/data";
import { webTransition } from "@/lib/web-transition";
import { isAccount } from "@/lib/account-gate";
import { announce } from "@/lib/announce";
import { useSavedRoutes } from "@/lib/saved-routes";
import { useUnlockedAssets } from "@/lib/unlocked-assets";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { visuallyHidden } from "@/lib/visually-hidden";
import { useLang, useMessages } from "@/i18n";

type IconName = ComponentProps<typeof Ionicons>["name"];

const goldFaint = "rgba(231, 194, 106, 0.28)";
/** The portrait on the back of the passport. */
const PHOTO_W = 104;
const PHOTO_H = 132;
/** The eight-pointed Seljuk star: two squares, one turned 45°, on a 100 × 100 box. */
const STAR_SQUARE = "M22 22 H78 V78 H22 Z";

/**
 * Profil: the Anı Defteri lying open at the head of the page, the visitor's passport (name, account,
 * points, badges and visits) and its sections as one list, each row to its own page: Kaydettiklerim, Mühürlenen eserler, Rozetlerim, Bıraktığım Notlar and Sistem ayarları
 * (module 8). The passport is gül kurusu (dusty rose) and gold in both themes.
 */
export default function SettingsScreen() {
  const m = useMessages();
  const lang = useLang();
  const { colors: c, scheme } = useTheme();
  const { user } = useCommunity();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const signedIn = isAccount(user);
  // A wide web page sets the passport and the list side by side; the site's bar names the page.
  const { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && width >= 900;

  const signOut = signedIn && (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={m.profile.signOutHint}
      onPress={() => {
        void logout().then(() => announce(m.profile.signedOut));
      }}
      style={({
        pressed,
        hovered,
      }: {
        pressed: boolean;
        hovered?: boolean;
      }) => [
        styles.signOut,
        { borderColor: c.border },
        (pressed || hovered) && { backgroundColor: c.surfaceRaised },
      ]}
    >
      <Ionicons name="log-out-outline" size={17} color={c.text} />
      <Text variant="label">{m.profile.signOut}</Text>
    </Pressable>
  );

  // A moderator's or admin's account cannot be deleted (the API refuses it), so it is not offered.
  const deleteAccount = signedIn && user?.role === "visitor" && <DeleteAccount />;
  // Last on the page and quiet: they are there when looked for, not what the page is about.
  const account = signedIn && (
    <View style={[styles.accountFoot, { borderTopColor: c.border }]}>
      <Text variant="caption" color="textSecondary" style={styles.accountHead}>
        {m.profile.accountHead.toLocaleUpperCase(lang)}
      </Text>
      <View style={styles.accountRow}>
        {signOut}
        {deleteAccount}
      </View>
    </View>
  );

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.xl }}
    >
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Head>
        <title>{m.common.title(m.tabs.profile)}</title>
      </Head>

      {wide ? (
        <View style={[styles.wide, { paddingTop: insets.top + spacing.lg }]}>
          <View style={styles.hero}>
            <View style={styles.flex}>
              <Text style={[styles.overline, { color: c.highlightMark }]}>
                {m.profile.overline}
              </Text>
              <Text headingLevel={1} style={styles.heroTitle}>
                {m.profile.greeting(user?.nickname ?? m.profile.traveller)}
              </Text>
              <Text color="textSecondary">
                {m.profile.lead}
              </Text>
            </View>
          </View>
          <View style={styles.wideRow}>
            <View style={styles.wideSide}>
              <OpenBookLink />
              <Passport />
            </View>
            <View style={styles.wideMain}>
              <Sections />
              {account}
            </View>
          </View>
        </View>
      ) : (
        <View style={[styles.column, { paddingTop: insets.top + spacing.md }]}>
          {/* The tab bar names the page: the title is for screen readers only. */}
          <Text headingLevel={1} style={visuallyHidden}>
            {m.tabs.profile}
          </Text>

          <OpenBookLink />
          <Passport />
          <Sections />
          {account}
        </View>
      )}
    </ScrollView>
  );
}

/**
 * The visitor's passport as its cover: gül kurusu leather, stitched at the edge, a gold-foil
 * frame and emblem, the Seljuk star blind-stamped large, and only the name and three numbers.
 */
/** Whether the passport has shown it can be turned this run (see `Passport`). */
let peeked = false;

function Passport() {
  const m = useMessages();
  const lang = useLang();
  const { user } = useCommunity();
  // The photo's path is signed for a day: a fresh one each time the card is shown.
  const accountId = isAccount(user) ? user.id : null;
  useEffect(() => {
    if (accountId) refreshMe().catch(() => undefined);
  }, [accountId]);
  const badges = useMyAchievements();
  const data = badges.status === "success" ? badges.data : null;
  const signedIn = isAccount(user);
  const name = user?.nickname ?? m.profile.traveller;
  const points = data?.totalPoints ?? 0;
  const earned = data ? data.items.filter((item) => item.earnedAt).length : 0;
  const visits = data?.visits ?? 0;
  // Without a server no account can be opened: the sample version's passport has no handle.
  const account = signedIn ? `@${user!.username}` : m.profile.sample;
  // The visitor's own photo and full name; without them the back shows the initial and the nickname.
  const holder = {
    photoUrl: avatarUri(user),
    fullName: user?.fullName ?? null,
  };
  const fullName = holder.fullName ?? name;

  // The cover is drawn at the card's measured size.
  const [size, setSize] = useState({ width: 0, height: 0 });
  const reduced = useReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const turn = useRef(new Animated.Value(0)).current;
  // The profile photo's sheet: from the badge on the photo, or a screen reader's action on the card.
  const [photoOpen, setPhotoOpen] = useState(false);
  /** Where the photo lies on the back, for the badge laid over its corner. */
  const [backBodyY, setBackBodyY] = useState(0);
  const [photoAt, setPhotoAt] = useState<{ x: number; y: number } | null>(null);

  const flip = () => {
    const next = !flipped;
    setFlipped(next);
    if (reduced) turn.setValue(next ? 1 : 0);
    else
      Animated.spring(turn, {
        toValue: next ? 1 : 0,
        friction: 9,
        tension: 40,
        useNativeDriver: true,
      }).start();
  };

  // Once per app run, the card turns a little and back, so it shows it can be turned.
  useEffect(() => {
    if (reduced || peeked) return;
    peeked = true;
    Animated.sequence([
      Animated.delay(900),
      Animated.timing(turn, {
        toValue: 0.12,
        duration: 380,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(turn, {
        toValue: 0,
        friction: 5,
        tension: 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, [reduced, turn]);

  const front = turn.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });
  const back = turn.interpolate({
    inputRange: [0, 1],
    outputRange: ["180deg", "360deg"],
  });
  const lift = turn.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.96, 1],
  });

  return (
    <View>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        flipped
          ? m.profile.passportBack(fullName, account)
          : m.profile.passport(name, account, points, earned, visits)
      }
      accessibilityHint={m.profile.flipHint}
      // The badge on the photo is inside the card, which a screen reader reads as one button: the card offers it too.
      accessibilityActions={signedIn ? [{ name: "changePhoto", label: m.profile.photo.change }] : undefined}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === "changePhoto") setPhotoOpen(true);
      }}
      onPress={flip}
    >
      <Animated.View
        style={[styles.passportShadow, { transform: [{ scale: lift }] }]}
      >
        <Animated.View
          style={[
            styles.passport,
            styles.face,
            { transform: [{ perspective: 1200 }, { rotateY: front }] },
          ]}
          onLayout={(e) => setSize(e.nativeEvent.layout)}
          pointerEvents={flipped ? "none" : "auto"}
        >
          <Cover width={size.width} height={size.height} />
          <Sheen width={size.width} height={size.height} />

          <View style={styles.coverHead}>
            <Emblem size={34} />
            <View style={styles.flex}>
              <Text colorValue={palette.altin200} style={styles.coverTitle}>
                {m.profile.passportTitle}
              </Text>
              <Text colorValue={palette.gece300} style={styles.coverIssuer}>
                {m.profile.issuer}
              </Text>
            </View>
            <FlipHint />
          </View>

          <View style={styles.holder}>
            <Text
              colorValue={palette.gece50}
              style={styles.name}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {name}
            </Text>
            <Text
              colorValue={palette.gece300}
              style={styles.account}
              numberOfLines={1}
            >
              {account}
            </Text>
          </View>

          <View style={styles.stats}>
            <Stat value={points} label={m.profile.points} gold />
            <Stat value={earned} label={m.profile.badges} ruled />
            <Stat value={visits} label={m.profile.visits} ruled />
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.passport,
            styles.face,
            styles.backFace,
            { transform: [{ perspective: 1200 }, { rotateY: back }] },
          ]}
          pointerEvents={flipped ? "auto" : "none"}
        >
          <Cover width={size.width} height={size.height} />
          <View style={styles.backBody} onLayout={(e) => setBackBodyY(e.nativeEvent.layout.y)}>
            <View style={styles.photo} onLayout={(e) => setPhotoAt({ x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y })}>
              <Svg
                width={PHOTO_W}
                height={PHOTO_H}
                style={StyleSheet.absoluteFill}
                aria-hidden
              >
                <Defs>
                  <FoilGradient id="photo-foil" />
                </Defs>
                <Rect
                  x={0.75}
                  y={0.75}
                  width={PHOTO_W - 1.5}
                  height={PHOTO_H - 1.5}
                  rx={14}
                  stroke="url(#photo-foil)"
                  strokeWidth={1.5}
                  fill="none"
                />
              </Svg>
              {holder.photoUrl ? (
                <Image
                  source={{ uri: holder.photoUrl }}
                  style={styles.photoImage}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : user ? (
                <Text
                  colorValue={palette.altin200}
                  style={styles.photoInitial}
                  aria-hidden
                >
                  {fullName.charAt(0).toLocaleUpperCase(lang)}
                </Text>
              ) : (
                <Ionicons
                  name="person"
                  size={44}
                  color={palette.altin200}
                  aria-hidden
                />
              )}
            </View>
            <View style={[styles.flex, styles.backFields]}>
              <View>
                <Text colorValue={palette.altin200} style={styles.backLabel}>
                  {m.profile.fullNameHead}
                </Text>
                <Text
                  colorValue={palette.gece50}
                  style={styles.backName}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                >
                  {fullName}
                </Text>
              </View>
              <View>
                <Text colorValue={palette.altin200} style={styles.backLabel}>
                  {m.profile.usernameHead}
                </Text>
                <Text
                  colorValue={palette.gece100}
                  style={styles.account}
                  numberOfLines={1}
                >
                  {account}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.backTurn}>
            <FlipHint />
          </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
    {/* Over the card and not in it: the card is a button, and a button cannot hold another. On the photo's corner, while the back is up. */}
    {/* It comes in once the back has turned all the way, and goes as it starts to turn away. */}
    {signedIn && photoAt && (
      <Animated.View
        pointerEvents={flipped ? "box-none" : "none"}
        accessibilityElementsHidden={!flipped}
        importantForAccessibility={flipped ? "auto" : "no-hide-descendants"}
        aria-hidden={!flipped}
        style={{
          position: "absolute",
          left: spacing.xl + photoAt.x + PHOTO_W - (AVATAR_BADGE * 2) / 3,
          top: backBodyY + photoAt.y + PHOTO_H - (AVATAR_BADGE * 2) / 3,
          opacity: turn.interpolate({ inputRange: [0, 0.9, 1], outputRange: [0, 0, 1], extrapolate: "clamp" }),
        }}
      >
        <AvatarEditor hasPhoto={holder.photoUrl !== null} open={photoOpen} onOpenChange={setPhotoOpen} />
      </Animated.View>
    )}
    </View>
  );
}

/** The "Çevir" tag on both faces: the card is something to tap. */
function FlipHint() {
  const m = useMessages();
  return (
    <View style={styles.flipHint} aria-hidden>
      <Ionicons name="sync-outline" size={13} color={palette.altin200} />
      <Text colorValue={palette.altin200} style={styles.flipHintText}>
        {m.profile.flip}
      </Text>
    </View>
  );
}

function Stat({
  value,
  label,
  gold = false,
  ruled = false,
}: {
  value: number;
  label: string;
  gold?: boolean;
  /** A fine rule between it and the one before. */
  ruled?: boolean;
}) {
  return (
    <View style={[styles.stat, ruled && styles.statRuled]}>
      <Text
        colorValue={gold ? palette.altin200 : palette.gece50}
        style={styles.statValue}
      >
        {value}
      </Text>
      <Text colorValue={palette.gece300} style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

/** Gold foil: light, deep and light again across the stroke. */
function FoilGradient({ id }: { id: string }) {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <Stop offset="0" stopColor="#F6DE9C" />
      <Stop offset="0.45" stopColor={palette.altin600} />
      <Stop offset="0.7" stopColor={palette.altin200} />
      <Stop offset="1" stopColor={palette.altin700} />
    </LinearGradient>
  );
}

/** The emblem in gold foil: the Seljuk star in a ring. */
function Emblem({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <Defs>
        <FoilGradient id="emblem-foil" />
      </Defs>
      <Circle
        cx={50}
        cy={50}
        r={47}
        stroke="url(#emblem-foil)"
        strokeWidth={3}
        fill="none"
      />
      <G stroke="url(#emblem-foil)" strokeWidth={3.5} fill="none">
        <Path d={STAR_SQUARE} />
        <Path d={STAR_SQUARE} transform="rotate(45 50 50)" />
      </G>
      <Circle cx={50} cy={50} r={9} fill="url(#emblem-foil)" />
    </Svg>
  );
}

/**
 * The cover: leather (a deep gradient under a fine grain), stitching along the edge, a thin
 * gold-foil frame inside it, and the star blind-stamped large off the right edge.
 */
function Cover({ width, height }: { width: number; height: number }) {
  if (width === 0) return null;
  const star = height * 0.92;
  return (
    <View aria-hidden pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Keyed by size: on iOS a gradient keeps the size it was first drawn at. */}
      <Svg key={`${width}x${height}`} width={width} height={height}>
        <Defs>
          <LinearGradient id="leather" x1="0" y1="0" x2="1" y2="1">
            {/* Deep gül kurusu: light enough to read as rose, dark enough for the light text on it. */}
            <Stop offset="0" stopColor="#6B3442" />
            <Stop offset="0.55" stopColor="#582A37" />
            <Stop offset="1" stopColor="#341720" />
          </LinearGradient>
          <RadialGradient id="leather-light" cx="18%" cy="0%" r="80%">
            <Stop offset="0" stopColor={palette.gulkurusu300} stopOpacity={0.16} />
            <Stop offset="1" stopColor={palette.gulkurusu300} stopOpacity={0} />
          </RadialGradient>
          {/* Scattered, not on a grid, so it reads as leather and not as dotted paper. */}
          <Pattern
            id="grain"
            width={11}
            height={13}
            patternUnits="userSpaceOnUse"
          >
            <Circle
              cx={1.2}
              cy={2.1}
              r={0.5}
              fill="#FFFFFF"
              fillOpacity={0.028}
            />
            <Circle
              cx={6.7}
              cy={0.8}
              r={0.6}
              fill="#000000"
              fillOpacity={0.12}
            />
            <Circle
              cx={9.4}
              cy={5.3}
              r={0.45}
              fill="#FFFFFF"
              fillOpacity={0.022}
            />
            <Circle
              cx={3.8}
              cy={7.6}
              r={0.65}
              fill="#000000"
              fillOpacity={0.1}
            />
            <Circle
              cx={8.1}
              cy={10.9}
              r={0.5}
              fill="#FFFFFF"
              fillOpacity={0.025}
            />
            <Circle
              cx={0.6}
              cy={11.7}
              r={0.55}
              fill="#000000"
              fillOpacity={0.12}
            />
            <Circle
              cx={5.2}
              cy={4.4}
              r={0.4}
              fill="#000000"
              fillOpacity={0.08}
            />
          </Pattern>
          <FoilGradient id="frame-foil" />
        </Defs>
        <Rect width={width} height={height} fill="url(#leather)" />
        <Rect width={width} height={height} fill="url(#leather-light)" />
        <Rect width={width} height={height} fill="url(#grain)" />
        {/* Blind stamp: a shade darker below, a hair lighter above, like pressed leather. */}
        <G
          transform={`translate(${width - star * 0.68} ${(height - star) / 2}) scale(${star / 100})`}
          fill="none"
          strokeWidth={0.45}
        >
          <G stroke="#000000" strokeOpacity={0.4} transform="translate(0 0.35)">
            <Circle cx={50} cy={50} r={47} />
            <Path d={STAR_SQUARE} />
            <Path d={STAR_SQUARE} transform="rotate(45 50 50)" />
          </G>
          <G stroke={palette.altin200} strokeOpacity={0.14}>
            <Circle cx={50} cy={50} r={47} />
            <Circle cx={50} cy={50} r={40} strokeDasharray="1 2.5" />
            <Path d={STAR_SQUARE} />
            <Path d={STAR_SQUARE} transform="rotate(45 50 50)" />
            <Circle cx={50} cy={50} r={11} />
          </G>
        </G>
        <Rect
          x={7}
          y={7}
          width={width - 14}
          height={height - 14}
          rx={19}
          stroke="#FFFFFF"
          strokeOpacity={0.16}
          strokeWidth={1}
          strokeDasharray="5 4"
          fill="none"
        />
        <Rect
          x={14}
          y={14}
          width={width - 28}
          height={height - 28}
          rx={13}
          stroke="url(#frame-foil)"
          strokeOpacity={0.55}
          strokeWidth={0.8}
          fill="none"
        />
      </Svg>
    </View>
  );
}

/** Light catching the cover: a soft band that crosses it now and then. Still with reduced motion. */
function Sheen({ width, height }: { width: number; height: number }) {
  const reduced = useReducedMotion();
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced || width === 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(x, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(4800),
        Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, width, x]);

  if (reduced || width === 0) return null;
  const band = 140;
  const translateX = x.interpolate({
    inputRange: [0, 1],
    outputRange: [-band * 2, width + band],
  });
  return (
    <Animated.View
      aria-hidden
      pointerEvents="none"
      style={[
        styles.sheen,
        {
          width: band,
          height: height * 2,
          top: -height / 2,
          transform: [{ translateX }, { rotate: "18deg" }],
        },
      ]}
    >
      <Svg width={band} height="100%">
        <Defs>
          <LinearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="0.5" stopColor="#FFF4D6" stopOpacity={0.18} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={band} height="100%" fill="url(#sheen)" />
      </Svg>
    </Animated.View>
  );
}


const BADGE = 38;
const SMALL_CARD = 124;

/** An icon in the gold-foil frame the passport has, with nothing behind it. */
function FoilIcon({ name, size = BADGE }: { name: IconName; size?: number }) {
  const { colors: c } = useTheme();
  return (
    <View style={[styles.foilIcon, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill} aria-hidden>
        <Defs>
          <FoilGradient id="section-foil" />
        </Defs>
        <Rect x={0.75} y={0.75} width={size - 1.5} height={size - 1.5} rx={size * 0.32} stroke="url(#section-foil)" strokeWidth={1.5} fill="none" />
      </Svg>
      <Ionicons name={name} size={size * 0.5} color={c.highlightMark} />
    </View>
  );
}

interface Section {
  href: Href;
  icon: IconName;
  title: string;
  /** Set large. */
  value?: string | null;
  /** Beside it, small: out of how many, or of what. */
  unit?: string | undefined;
  note: string;
}

/** A card lifted off the page: shadow and no outline; in the dark theme its lighter surface does that. */
function SectionCard({ section, kind, style }: { section: Section; kind: "large" | "small" | "wide" | "short"; style?: object }) {
  const { colors: c, scheme } = useTheme();
  const router = useRouter();
  const { href, icon, title, value, unit, note } = section;
  const go = (
    <Ionicons name="arrow-forward" size={17} color={c.textSecondary} aria-hidden style={styles.cardArrow} />
  );
  const figure = value && (
    <View style={styles.cardFigure}>
      <Text numberOfLines={1} style={kind === "large" ? styles.cardValueLarge : styles.cardValue}>
        {value}
      </Text>
      {unit && (
        <Text numberOfLines={1} color="textSecondary" style={styles.cardUnit}>
          {unit}
        </Text>
      )}
    </View>
  );
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={[title, value && `${value}${unit ? ` ${unit}` : ""}`, note].filter(Boolean).join(", ")}
      onPress={() => router.push(href)}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.card,
        scheme === "light" && styles.cardLifted,
        { backgroundColor: c.surface },
        kind === "wide" || kind === "short" ? styles.cardInLine : styles.cardUpright,
        hovered && styles.cardHovered,
        pressed && styles.cardPressed,
        style,
      ]}
    >
      {kind === "wide" || kind === "short" ? (
        <>
          <FoilIcon name={icon} size={kind === "short" ? 34 : BADGE} />
          <Text numberOfLines={2} style={styles.cardLineTitle}>
            {title}
          </Text>
          {figure}
          {kind === "wide" && go}
        </>
      ) : (
        <>
          <View style={styles.cardHead}>
            <FoilIcon name={icon} />
            {go}
          </View>
          <View>
            {figure}
            <Text numberOfLines={2} style={styles.cardTitle}>
              {title}
            </Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

/**
 * What the visitor has gathered as cards of different sizes, what matters most the largest, each with its
 * number; then the two ways on, small. Colour stays with the book and the passport: here it is gold lines.
 */
function Sections() {
  const m = useMessages();
  const routes = useSavedRoutes();
  const sealed = useUnlockedAssets();
  const badges = useMyAchievements();
  const notes = useMyContributions();
  const { user } = useCommunity();
  const badgeData = badges.status === "success" ? badges.data : null;
  const noteCount =
    notes.status === "success" && notes.data ? notes.data.length : null;
  const wallet = useWallet();
  const walletData = wallet.status === "success" ? wallet.data : null;

  const staff = user?.role === "admin" || user?.role === "moderator";
  return (
    <View style={styles.sections}>
      <View style={styles.bento}>
        <SectionCard
          kind="large"
          style={styles.flex}
          section={{ href: "/profile/sealed", icon: "shield-checkmark-outline", title: m.profile.sealed, value: String(sealed.size), note: m.profile.sealedNote }}
        />
        <View style={[styles.flex, styles.sections]}>
          <SectionCard
            kind="small"
            section={{ href: "/profile/routes", icon: "bookmark-outline", title: m.profile.saved, value: String(routes.length), note: m.profile.savedNote }}
          />
          <SectionCard
            kind="small"
            section={{
              href: "/profile/badges",
              icon: "ribbon-outline",
              title: m.profile.badgesTitle,
              value: badgeData ? String(badgeData.items.filter((b) => b.earnedAt).length) : "–",
              unit: badgeData ? `/ ${badgeData.items.length}` : undefined,
              note: m.profile.badgesNote,
            }}
          />
        </View>
      </View>
      <SectionCard
        kind="wide"
        section={{
          href: "/profile/rewards",
          icon: "gift-outline",
          title: m.profile.rewards,
          value: walletData ? String(walletData.balance) : "–",
          unit: walletData ? m.profile.points : undefined,
          note: m.profile.rewardsNote,
        }}
      />
      <View style={styles.shortcuts}>
        <SectionCard
          kind="short"
          style={styles.shortcut}
          section={{ href: "/profile/notes", icon: "chatbubble-ellipses-outline", title: m.profile.notes, value: noteCount ? String(noteCount) : null, note: m.profile.notesNote }}
        />
        <SectionCard
          kind="short"
          style={styles.shortcut}
          section={{ href: "/profile/settings", icon: "settings-outline", title: m.profile.system, note: m.profile.systemNote }}
        />
        {/* Only moderators and admins: the panel the API lets them use. */}
        {staff && (
          <SectionCard
            kind="short"
            style={styles.shortcut}
            section={{ href: "/admin", icon: "shield-half-outline", title: m.profile.admin, note: m.profile.adminNote }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.8,
  },
  column: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  wide: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  hero: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.lg,
  },
  overline: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 12,
    letterSpacing: 2.4,
    marginBottom: spacing.xxs,
  },
  heroTitle: {
    fontFamily: fontFamily.display,
    fontSize: 44,
    lineHeight: 52,
    marginBottom: spacing.xxs,
  },
  wideRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xl,
  },
  sections: {
    gap: spacing.md,
  },
  bento: {
    flexDirection: "row",
    gap: spacing.md,
  },
  shortcuts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  shortcut: {
    flexGrow: 1,
    flexBasis: "45%",
  },
  card: {
    borderRadius: 24,
    padding: spacing.md,
    ...webTransition("transform", "160ms"),
  },
  cardLifted: {
    boxShadow: "0px 10px 28px rgba(20, 27, 41, 0.08), 0px 1px 3px rgba(20, 27, 41, 0.05)",
  },
  cardUpright: {
    minHeight: SMALL_CARD,
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  cardInLine: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardHovered: {
    transform: [{ translateY: -2 }],
  },
  cardPressed: {
    transform: [{ scale: 0.97 }],
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  // Pointing up and out: this leads somewhere.
  cardArrow: {
    transform: [{ rotate: "-45deg" }],
  },
  cardFigure: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.xxs,
  },
  cardValue: {
    fontFamily: fontFamily.sansBold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.5,
  },
  cardValueLarge: {
    fontFamily: fontFamily.sansBold,
    fontSize: 52,
    lineHeight: 58,
    letterSpacing: -1.5,
  },
  cardUnit: {
    flexShrink: 1,
    fontFamily: fontFamily.sansMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  cardTitle: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 14,
    lineHeight: 19,
  },
  cardLineTitle: {
    flex: 1,
    fontFamily: fontFamily.sansMedium,
    fontSize: 14,
    lineHeight: 19,
  },
  foilIcon: {
    alignItems: "center",
    justifyContent: "center",
  },
  wideColumn: {
    width: "100%",
    maxWidth: 1040,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  wideSide: {
    width: 440,
    gap: spacing.md,
  },
  wideMain: {
    flex: 1,
    minWidth: 0,
  },
  unseen: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
  },
  // The shadow falls from the card as it turns, not from the flat box around it: iOS draws a
  // shadow from what the box holds and the web's drop-shadow does too. Android's elevation would
  // draw the flat box behind the turning card, so there the card has none.
  passportShadow: {
    borderRadius: 26,
    ...Platform.select({
      ios: {
        shadowColor: palette.gece1000,
        shadowOpacity: 0.4,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 18 },
      },
      web: {
        filter: "drop-shadow(0 18px 22px rgba(5, 8, 14, 0.32))",
      } as object,
      default: {},
    }),
  },
  passport: {
    justifyContent: "space-between",
    gap: spacing.xl,
    minHeight: 236,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: goldFaint,
    backgroundColor: "#582A37",
    overflow: "hidden",
  },
  face: {
    backfaceVisibility: "hidden",
  },
  backFace: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
  },
  backBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  photo: {
    width: PHOTO_W,
    height: PHOTO_H,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  photoImage: {
    width: PHOTO_W - 6,
    height: PHOTO_H - 6,
    borderRadius: 11,
  },
  photoInitial: {
    fontFamily: fontFamily.display,
    fontSize: 52,
    lineHeight: 60,
  },
  backFields: {
    gap: spacing.md,
  },
  backLabel: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 2,
  },
  backName: {
    fontFamily: fontFamily.display,
    fontSize: 26,
    lineHeight: 32,
  },
  backTurn: {
    position: "absolute",
    top: spacing.xl,
    right: spacing.xl,
  },
  flipHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 26,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: goldFaint,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  flipHintText: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  sheen: {
    position: "absolute",
    left: 0,
  },
  coverHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  coverTitle: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 3,
  },
  coverIssuer: {
    fontFamily: fontFamily.display,
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: 1,
  },
  holder: {
    gap: 2,
  },
  name: {
    fontFamily: fontFamily.display,
    fontSize: 38,
    lineHeight: 46,
    textShadowColor: "rgba(0, 0, 0, 0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  account: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 0.3,
  },
  stats: {
    flexDirection: "row",
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: goldFaint,
  },
  stat: {
    flex: 1,
    gap: 1,
  },
  statRuled: {
    paddingLeft: spacing.md,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: goldFaint,
  },
  statValue: {
    fontFamily: fontFamily.sansBold,
    fontSize: 22,
    lineHeight: 28,
  },
  statLabel: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  accountFoot: {
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  accountHead: {
    fontFamily: fontFamily.sansSemiBold,
    letterSpacing: 1.6,
  },
  accountRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.full,
  },
});
