import Ionicons from "@expo/vector-icons/Ionicons";
import type { ChatCitation, ChatResponse, TripPlanResponse, Lang } from "@vagabonds/contracts";
import { fontFamily, palette, radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { useRouter, type Href } from "expo-router";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Animated, Easing, Pressable, Share, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient as SvgGradient, Rect, Stop } from "react-native-svg";

import { answerLines, answerParts, followUps, type FollowUpTopic, type LinePart } from "@/lib/chat";
import { inkFor } from "@/lib/route-ink";
import { routeKey, savedKindOf, useSavedRoutes } from "@/lib/saved-routes";
import { speakAnswer, stopAnswer, useSpeaking } from "@/lib/voice";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useLang, useMessages, type Messages } from "@/i18n";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Where a source opens. The food list is local for now, so a dish opens the list, not the dish. */
function citationTarget(citation: ChatCitation, m: Messages): { href: Href; action: string } | null {
  switch (citation.kind) {
    case "asset":
      return { href: { pathname: "/monuments/[id]", params: { id: citation.id } }, action: m.rehber.openSite };
    case "dish":
      return { href: "/route/food", action: m.rehber.openFood };
    case "trip":
      return { href: "/route", action: m.rehber.openRoutes };
    case "weather":
    // The route map opens from the answer's transit attachment (YIGIT.md §11).
    case "transit":
      return null;
  }
}

const citationIcon: Record<ChatCitation["kind"], IconName> = {
  asset: "business",
  dish: "restaurant",
  trip: "git-branch",
  weather: "partly-sunny",
  transit: "bus",
};

/** Fades and lifts its children in once, when `animate`; still when motion is reduced. */
function Appear({ animate, children, style }: { animate: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReducedMotion();
  const [t] = useState(() => new Animated.Value(animate ? 0 : 1));
  useEffect(() => {
    if (reduceMotion) t.setValue(1);
    else Animated.timing(t, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [t, reduceMotion]);
  return (
    <Animated.View style={[style, { opacity: t, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** The visitor's line: a grey bubble on the right, rising in when just sent. */
export function UserMessage({ text, animate = false }: { text: string; animate?: boolean }) {
  const m = useMessages();
  const { colors: c } = useTheme();
  return (
    <Appear animate={animate} style={[styles.user, { backgroundColor: c.surfaceRaised }]}>
      <View accessible accessibilityLabel={m.rehber.you(text)}>
        <Text style={styles.body}>{text}</Text>
      </View>
    </Appear>
  );
}

/**
 * What the wait is about, for a question: the steps the assistant usually takes, said one after
 * another as the seconds pass. The API answers in one go, so these follow the clock, not the model.
 */
function waitingSteps(question: string, m: Messages, lang: Lang): ReadonlyArray<[afterSeconds: number, text: string]> {
  const q = question.toLocaleLowerCase(lang);
  const w = m.rehber.wait;
  // Turkish and English words for the same topics.
  const topic = /hava|yağmur|sıcak|derece|\b(weather|rain(y|ing)?|hot|cold|degrees?)\b/.test(q)
    ? w.weather
    : /nasıl gid|ulaşım|otobüs|tramvay|yol tarifi|\b(get to|transit|bus(es)?|trams?|directions?)\b/.test(q)
      ? w.transit
      : /rota|gezi|plan|gün|\b(routes?|trips?|days?)\b/.test(q)
        ? w.trip
        : /yemek|lezzet|ye[nr]|tatlı|mutfa|\b(eat|food|dish(es)?|desserts?|cuisine)\b/.test(q)
          ? w.food
          : w.records;
  return [
    [0, w.understanding],
    [3, topic],
    [9, w.sources],
    [17, w.comparing],
    [26, w.writing],
    [40, w.long],
  ];
}

/**
 * While the answer is being written: a breathing dot and a line saying what is going on, which
 * changes as the wait grows, so a long answer never looks stuck. Still when motion is reduced.
 */
export function Thinking({ question }: { question: string }) {
  const lang = useLang();
  const m = useMessages();
  const { colors: c } = useTheme();
  const reduceMotion = useReducedMotion();
  const [t] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(1));
  const [steps] = useState(() => waitingSteps(question, m, lang));
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, reduceMotion]);

  // Each step at its second; the line fades over to the next.
  useEffect(() => {
    const timers = steps.slice(1).map(([after], i) =>
      setTimeout(() => {
        if (reduceMotion) return setStep(i + 1);
        Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
          setStep(i + 1);
          Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
        });
      }, after * 1000),
    );
    return () => timers.forEach(clearTimeout);
  }, [steps, fade, reduceMotion]);

  const text = steps[step]![1];
  return (
    <View style={styles.answer}>
      <Byline />
      <View
        style={[styles.bubble, styles.thinking, { backgroundColor: c.background, borderColor: c.border }]}
        accessible
        accessibilityLabel={m.rehber.preparingLabel(text)}
        accessibilityLiveRegion="polite"
      >
        <Animated.View
          style={[styles.pulse, { backgroundColor: c.text, transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.1] }) }] }]}
        />
        <Animated.View style={{ opacity: fade, flexShrink: 1 }}>
          <Text variant="caption" color="textSecondary">
            {text}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

/** A line cut into what it shows one after another: words, the spaces between them, and markers. */
function lineTokens(parts: readonly LinePart[]): LinePart[] {
  return parts.flatMap((part): LinePart[] =>
    part.kind === "text"
      ? part.text
          .split(/(\s+)/)
          .filter(Boolean)
          .map((text) => ({ ...part, text }))
      : [part],
  );
}

/**
 * How many of `total` tokens show: all of them, or, when `animate`, a few more every frame until
 * all do, so a fresh answer writes itself out as chat apps' answers do. Any answer takes about two
 * seconds at most. All at once when motion is reduced.
 */
function useReveal(total: number, animate: boolean): number {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(animate ? 0 : total);
  useEffect(() => {
    if (reduceMotion || shown >= total) {
      if (shown !== total) setShown(total);
      return;
    }
    const step = Math.max(3, Math.ceil(total / 60));
    const timer = setTimeout(() => setShown((n) => Math.min(total, n + step)), 32);
    return () => clearTimeout(timer);
  }, [shown, total, reduceMotion]);
  return shown;
}

/**
 * One answer, as plain text across the column: the text without its `[n]` markers, its sources
 * as small grey pills under it, and a row of quiet actions under it; a trip answer is only its
 * "Rota oluşturuldu" card. A fresh one (`animate`) writes itself out, the rest rising in after it. An
 * answer without sources is marked as general conversation, so it never reads as information
 * about a site.
 */
export function AssistantMessage({
  response,
  animate = false,
  onFollowUp,
}: {
  response: ChatResponse;
  animate?: boolean;
  onFollowUp?: (question: string) => void;
}) {
  const m = useMessages();
  const { colors: c } = useTheme();
  // Read aloud in EVREN's voice (lib/voice.ts); a spoken question's answer starts on its own.
  const reading = useSpeaking() === response.answer;
  // The markers stay out of the text, the space before each with them; the pills name the sources.
  const parts = answerParts(response.answer, response.citations)
    .filter((part) => part.kind === "text")
    .map((part, i, all) => (i < all.length - 1 && /^[.,;:!?)]/.test(all[i + 1]!.text) ? { ...part, text: part.text.trimEnd() } : part));
  const plain = parts.map((part) => part.text).join("");
  const [lines] = useState(() => answerLines(parts).map((line) => (line.kind === "gap" ? line : { ...line, parts: lineTokens(line.parts) })));
  const total = lines.reduce((sum, line) => sum + (line.kind === "gap" ? 0 : line.parts.length), 0);
  const shown = useReveal(total, animate);
  const done = shown >= total;


  // A trip answer is shown as the card alone: the plan is in Kaydettiklerim, not told in words here.
  const trip = response.attachments.trip;
  if (trip) {
    return (
      <View style={styles.answer}>
        <Byline />
        <Appear animate={animate}>
          <TripCreated trip={trip} />
        </Appear>
        {onFollowUp && <FollowUps response={response} animate={animate} onAsk={onFollowUp} />}
      </View>
    );
  }

  // Each line takes its share of what shows so far, in order.
  let left = shown;
  const drawn: ReactNode[] = [];
  for (const [i, line] of lines.entries()) {
    if (left <= 0) break;
    if (line.kind === "gap") {
      drawn.push(<View key={i} style={styles.gap} />);
      continue;
    }
    const text = (
      <Text style={[styles.body, line.kind !== "paragraph" && styles.flex]}>
        {line.parts.slice(0, left).map((part, j) =>
          part.kind === "ref" ? null : part.bold ? (
            <Text key={j} style={styles.bold}>
              {part.text}
            </Text>
          ) : (
            part.text
          ),
        )}
      </Text>
    );
    left -= line.parts.length;
    drawn.push(
      line.kind === "paragraph" ? (
        <View key={i}>{text}</View>
      ) : (
        <View key={i} style={styles.item}>
          <Text style={[styles.body, styles.marker, line.kind === "number" && styles.number]}>{line.kind === "number" ? `${line.number}.` : "•"}</Text>
          {text}
        </View>
      ),
    );
  }

  return (
    <View style={styles.answer}>
      <Byline />
      <View style={[styles.bubble, { backgroundColor: c.background, borderColor: c.border }]}>
        <View accessible accessibilityLabel={`${m.tabs.rehber}: ${plain}`} style={styles.lines}>
          {drawn}
        </View>

        {done && response.grounded && (
          <Appear animate={animate} style={styles.extras}>
            <View style={styles.sources}>
              {response.citations.map((citation) => (
                <SourceChip key={citation.ref} citation={citation} />
              ))}
            </View>
          </Appear>
        )}
      </View>

      {done && (
        <Appear animate={animate}>
          <SavedNote response={response} />
        </Appear>
      )}

      {done && (
        <Appear animate={animate}>
          <View style={styles.actions}>
            <ActionButton
              icon={reading ? "stop-circle-outline" : "volume-high-outline"}
              title={reading ? m.common.stop : m.common.listen}
              label={reading ? m.rehber.stopReading : m.rehber.readAloud}
              onPress={() => {
                if (reading) stopAnswer();
                else void speakAnswer(response.answer, plain);
              }}
            />
            <ActionButton
              icon="share-social-outline"
              title={m.rehber.share}
              label={m.rehber.shareLabel}
              onPress={() => void Share.share({ message: plain }).catch(() => {})}
            />
            {!response.grounded && (
              <Text variant="caption" color="textSecondary" style={styles.note}>
                {m.rehber.ungrounded}
              </Text>
            )}
          </View>
        </Appear>
      )}

      {done && onFollowUp && <FollowUps response={response} animate={animate} onAsk={onFollowUp} />}
    </View>
  );
}

const followUpIcon: Record<FollowUpTopic, IconName> = {
  food: "restaurant-outline",
  transit: "bus-outline",
  weather: "partly-sunny-outline",
  trip: "map-outline",
};

/**
 * What to ask next, under the last answer: a few questions as soft pills, each as wide as its
 * words and sent with a tap.
 */
function FollowUps({ response, animate, onAsk }: { response: ChatResponse; animate: boolean; onAsk: (question: string) => void }) {
  const m = useMessages();
  const lang = useLang();
  const { colors: c } = useTheme();
  const offers = followUps(response, lang);
  if (offers.length === 0) return null;
  return (
    <Appear animate={animate} style={styles.followUps}>
      <Text variant="caption" color="textSecondary" style={styles.followUpsTitle}>
        {m.rehber.alsoAsk}
      </Text>
      {offers.map((offer) => (
        <Pressable
          key={offer.topic}
          accessibilityRole="button"
          accessibilityLabel={m.rehber.askLabel(offer.question)}
          // Drawn 38pt tall; the target is 44.
          hitSlop={{ top: 3, bottom: 3 }}
          onPress={() => onAsk(offer.question)}
          style={({ pressed }) => [styles.followUp, { borderColor: c.border, backgroundColor: pressed ? c.surfaceRaised : c.surface }]}
        >
          <Ionicons name={followUpIcon[offer.topic]} size={16} color={c.highlight} />
          <Text style={[styles.followUpText, { color: c.text }]}>{offer.label}</Text>
        </Pressable>
      ))}
    </Appear>
  );
}

/** "Rehber" over its answers, with its small round mark. */
function Byline() {
  const m = useMessages();
  const { colors: c } = useTheme();
  return (
    <View style={styles.byline} aria-hidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.avatar, { backgroundColor: c.text }]}>
        <Ionicons name="sparkles" size={12} color={c.background} />
      </View>
      <Text variant="caption" style={styles.bold}>
        {m.rehber.title}
      </Text>
    </View>
  );
}

/** A quiet icon under an answer: drawn 36pt, its target 44. */
function ActionButton({ icon, title, label, onPress }: { icon: IconName; title: string; label: string; onPress: () => void }) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      // Drawn 34pt tall; the target is 44.
      hitSlop={{ top: 5, bottom: 5 }}
      onPress={onPress}
      style={({ pressed }) => [styles.action, { borderColor: c.border, backgroundColor: pressed ? c.surfaceRaised : c.surface }]}
    >
      <Ionicons name={icon} size={16} color={c.textSecondary} />
      <Text variant="caption" color="textSecondary" style={styles.actionTitle}>
        {title}
      </Text>
    </Pressable>
  );
}

function SourceChip({ citation }: { citation: ChatCitation }) {
  const m = useMessages();
  const { colors: c } = useTheme();
  const router = useRouter();
  const target = citationTarget(citation, m);
  const content = (
    <>
      <Ionicons name={citationIcon[citation.kind]} size={12} color={c.textSecondary} />
      <Text variant="caption" numberOfLines={1} style={styles.chipTitle}>
        {citation.title}
      </Text>
    </>
  );
  const look = [styles.chip, { backgroundColor: c.surface, borderColor: c.border }];

  if (!target) {
    return (
      <View style={look} accessible accessibilityLabel={m.rehber.source(citation.title)}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={m.rehber.sourceAction(citation.title, target.action)}
      onPress={() => router.push(target.href)}
      // The pill is drawn small; the target stays 44pt tall.
      hitSlop={{ top: 8, bottom: 8 }}
      style={({ pressed }) => [look, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

/** Under an answer Kaydettiklerim holds: that it was kept, and the way there. Nothing while it is not (yet) in the list. */
function SavedNote({ response }: { response: ChatResponse }) {
  const msg = useMessages();
  const { colors: c } = useTheme();
  const router = useRouter();
  const kind = savedKindOf(useSavedRoutes(), response);
  if (!kind) return null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={msg.rehber.savedLabel}
      onPress={() => router.push({ pathname: "/profile/routes", params: { tab: kind } })}
      style={({ pressed }) => [styles.savedNote, pressed && styles.pressed]}
    >
      <Ionicons name="bookmark" size={14} color={c.highlightMark} />
      <Text variant="caption" color="textSecondary">
        {msg.rehber.saved}
      </Text>
    </Pressable>
  );
}

/** A trip's walking distance, "850 m" or "2,4 km". */
function distance(meters: number, m: Messages): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1).replace(".", m.rehber.decimal)} km` : `${meters} m`;
}

const tripDuration = (duration: TripPlanResponse["duration"], m: Messages): string =>
  duration === "half" ? m.rehber.halfDay : m.rehber.days(Number(duration));

/**
 * A trip answer, shown instead of its words: "Rota oluşturuldu" on the city's ink, the plan's
 * name, its length, stops and walk, the stops as dots on a line, and the way to the saved plan
 * (lib/chat.ts keeps it in Profil · Kaydettiklerim).
 */
function TripCreated({ trip }: { trip: TripPlanResponse }) {
  const m = useMessages();
  const { colors: c } = useTheme();
  const router = useRouter();
  const saved = useSavedRoutes().find((route) => route.kind === "trip" && routeKey(route) === routeKey({ kind: "trip", trip }));
  const [light, deep] = inkFor(trip.city.code);
  const stops = trip.days.reduce((sum, day) => sum + day.items.filter((item) => item.kind === "stop").length, 0);
  const meters = trip.days.reduce((sum, day) => sum + day.totals.walkMeters, 0);
  const title = m.rehber.tripTitle(trip.city.label);
  const dots = Math.min(Math.max(0, stops - 2), 6);

  return (
    <View style={[styles.created, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View
        style={styles.createdBand}
        accessible
        accessibilityLabel={m.rehber.tripCreatedLabel(title, tripDuration(trip.duration, m), stops, distance(meters, m))}
      >
        {/* Sized outright: on the web an SVG without a width keeps its 300px default, not its box's. */}
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} aria-hidden>
          <Defs>
            <SvgGradient id="created-ink" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={light} />
              <Stop offset="1" stopColor={deep} />
            </SvgGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#created-ink)" />
          <Circle cx="92%" cy="15%" r={56} stroke={palette.altin200} strokeOpacity={0.12} fill="none" />
          <Circle cx="92%" cy="15%" r={36} stroke={palette.altin200} strokeOpacity={0.1} strokeDasharray="2 4" fill="none" />
        </Svg>
        <View style={styles.createdHead}>
          <Ionicons name="checkmark-circle" size={18} color={palette.altin200} />
          <Text colorValue={palette.altin200} style={styles.createdKicker}>
            {m.rehber.tripCreated}
          </Text>
        </View>
        <Text colorValue={palette.white} style={styles.createdTitle}>
          {title}
        </Text>
        <View style={styles.createdChips}>
          {[tripDuration(trip.duration, m), m.rehber.stops(stops), distance(meters, m)].map((chip) => (
            <View key={chip} style={styles.createdChip}>
              <Text colorValue={palette.gece50} style={styles.createdChipText}>
                {chip}
              </Text>
            </View>
          ))}
        </View>
        {stops > 0 && (
          <View style={styles.createdLine} aria-hidden>
            <Ionicons name="flag" size={15} color={palette.altin200} />
            {stops > 1 &&
              Array.from({ length: dots + 1 }, (_, i) => (
                <View key={i} style={styles.createdLeg}>
                  <View style={styles.createdDash}>
                    <Svg height={2} width="100%">
                      <Line x1="0" y1="1" x2="100%" y2="1" stroke={palette.altin200} strokeOpacity={0.6} strokeWidth={2} strokeDasharray="3 4" />
                    </Svg>
                  </View>
                  {i < dots && <View style={styles.createdDot} />}
                </View>
              ))}
            {stops > 1 && <Ionicons name="location" size={17} color={palette.altin200} />}
          </View>
        )}
      </View>
      <View style={[styles.createdInfo, { borderBottomColor: c.border }]}>
        <Ionicons name="information-circle-outline" size={16} color={c.textSecondary} />
        <Text variant="caption" color="textSecondary" style={styles.flex}>
          {m.rehber.tripSavedNote}
        </Text>
      </View>
      <View style={styles.createdActions}>
        <Pressable
          accessibilityRole="link"
          onPress={() => (saved ? router.push({ pathname: "/profile/trip", params: { id: saved.id } }) : router.push("/profile/routes"))}
          style={({ pressed }) => [styles.createdOpen, pressed && styles.pressed]}
        >
          <Text variant="label" colorValue={palette.white} style={styles.createdOpenText}>
            {m.rehber.openTrip}
          </Text>
          <Ionicons name="arrow-forward" size={16} color={palette.white} />
        </Pressable>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push("/profile/routes")}
          hitSlop={6}
          style={({ pressed }) => [styles.createdAll, pressed && styles.pressed]}
        >
          <Ionicons name="bookmark-outline" size={15} color={c.textSecondary} />
          <Text variant="caption" color="textSecondary" style={styles.createdAllText}>
            {m.rehber.savedList}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  savedNote: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs,
    minHeight: touchTarget.min,
  },
  created: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  createdBand: {
    gap: spacing.sm,
    padding: spacing.lg,
  },
  createdHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  createdKicker: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 13,
    lineHeight: 18,
  },
  createdTitle: {
    fontFamily: fontFamily.display,
    fontSize: 26,
    lineHeight: 32,
  },
  createdChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  createdChip: {
    height: 24,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  createdChipText: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  createdLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: spacing.xs,
  },
  createdLeg: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  createdDash: {
    flex: 1,
  },
  createdDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: palette.altin200,
  },
  createdInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  createdActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.md,
  },
  createdOpen: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: palette.altin700,
  },
  createdOpenText: {
    fontFamily: fontFamily.sansSemiBold,
  },
  createdAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  createdAllText: {
    fontFamily: fontFamily.sansMedium,
  },
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
  body: {
    fontSize: 16,
    lineHeight: 26,
  },
  /** Rounded all round but the corner nearest its side, as chat bubbles are. */
  user: {
    alignSelf: "flex-end",
    maxWidth: "80%",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + spacing.xxs,
    borderRadius: 22,
    borderBottomRightRadius: 6,
  },
  bubble: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 22,
    borderTopLeftRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  extras: {
    gap: spacing.md,
  },
  followUps: {
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  followUpsTitle: {
    marginBottom: spacing.xxs,
  },
  /** As wide as its words, like the pills above it; a long question wraps inside it. */
  followUp: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    maxWidth: "100%",
    minHeight: 38,
    paddingHorizontal: spacing.md + spacing.xxs,
    paddingVertical: spacing.sm,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
  },
  followUpText: {
    flexShrink: 1,
    fontFamily: fontFamily.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  byline: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  thinking: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  answer: {
    gap: spacing.sm,
  },
  note: {
    marginLeft: spacing.xs,
  },
  bold: {
    fontFamily: fontFamily.sansSemiBold,
  },
  lines: {
    gap: spacing.xxs,
  },
  gap: {
    height: spacing.sm,
  },
  /** A list item: its bullet or number in a narrow column, the text hanging beside it. */
  item: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingLeft: spacing.xs,
  },
  marker: {
    width: 12,
    textAlign: "center",
  },
  number: {
    width: 20,
    textAlign: "right",
    fontFamily: fontFamily.sansMedium,
  },
  sources: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs + spacing.xxs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + spacing.xxs,
    minHeight: 28,
    maxWidth: "100%",
    paddingHorizontal: spacing.sm + spacing.xxs,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipTitle: {
    flexShrink: 1,
    fontFamily: fontFamily.sansMedium,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
  /** A small outlined pill: its icon and a word, so what it does shows at a glance. */
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + spacing.xxs,
    height: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionTitle: {
    fontFamily: fontFamily.sansMedium,
  },
});
