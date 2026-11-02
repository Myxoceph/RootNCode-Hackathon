import Ionicons from "@expo/vector-icons/Ionicons";
import type { ChatCitation, ChatResponse, TripPlanResponse } from "@vagabonds/contracts";
import { fontFamily, radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { useRouter, type Href } from "expo-router";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Animated, Easing, Pressable, Share, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { formatClock } from "@/content/routes";
import { answerLines, answerParts, followUps, type FollowUpTopic, type LinePart } from "@/lib/chat";
import { speak, stopSpeaking } from "@/lib/speak";
import { useReducedMotion } from "@/lib/use-reduced-motion";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Where a source opens. The food list is local for now, so a dish opens the list, not the dish. */
function citationTarget(citation: ChatCitation): { href: Href; action: string } | null {
  switch (citation.kind) {
    case "asset":
      return { href: { pathname: "/monuments/[id]", params: { id: citation.id } }, action: "eser sayfasını aç" };
    case "dish":
      return { href: "/route/food", action: "yöresel lezzetleri aç" };
    case "trip":
      return { href: "/route", action: "Rotalar'ı aç" };
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
  const { colors: c } = useTheme();
  return (
    <Appear animate={animate} style={[styles.user, { backgroundColor: c.surfaceRaised }]}>
      <View accessible accessibilityLabel={`Sen: ${text}`}>
        <Text style={styles.body}>{text}</Text>
      </View>
    </Appear>
  );
}

/**
 * What the wait is about, for a question: the steps the assistant usually takes, said one after
 * another as the seconds pass. The API answers in one go, so these follow the clock, not the model.
 */
function waitingSteps(question: string): ReadonlyArray<[afterSeconds: number, text: string]> {
  const q = question.toLocaleLowerCase("tr");
  const topic = /hava|yağmur|sıcak|derece/.test(q)
    ? "Hava durumuna bakıyorum…"
    : /nasıl gid|ulaşım|otobüs|tramvay|yol tarifi/.test(q)
      ? "Toplu taşıma seçeneklerine bakıyorum…"
      : /rota|gezi|plan|gün/.test(q)
        ? "Gezi rotasını kuruyorum…"
        : /yemek|lezzet|ye[nr]|tatlı|mutfa/.test(q)
          ? "Yöresel lezzetlere bakıyorum…"
          : "Vakıf eserleri kayıtlarında arıyorum…";
  return [
    [0, "Sorunu anlamaya çalışıyorum…"],
    [3, topic],
    [9, "Kaynakları okuyorum…"],
    [17, "Bilgileri kaynaklarla karşılaştırıyorum…"],
    [26, "Cevabı yazıyorum…"],
    [40, "Biraz uzun sürdü, neredeyse hazır…"],
  ];
}

/**
 * While the answer is being written: a breathing dot and a line saying what is going on, which
 * changes as the wait grows, so a long answer never looks stuck. Still when motion is reduced.
 */
export function Thinking({ question }: { question: string }) {
  const { colors: c } = useTheme();
  const reduceMotion = useReducedMotion();
  const [t] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(1));
  const [steps] = useState(() => waitingSteps(question));
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
        accessibilityLabel={`Yanıt hazırlanıyor. ${text}`}
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
 * as small grey pills under it, the trip plan when there is one, and a row of quiet actions under
 * it. A fresh one (`animate`) writes itself out, the rest rising in after it. An
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
  const { colors: c } = useTheme();
  const [reading, setReading] = useState(false);
  // The markers stay out of the text, the space before each with them; the pills name the sources.
  const parts = answerParts(response.answer, response.citations)
    .filter((part) => part.kind === "text")
    .map((part, i, all) => (i < all.length - 1 && /^[.,;:!?)]/.test(all[i + 1]!.text) ? { ...part, text: part.text.trimEnd() } : part));
  const plain = parts.map((part) => part.text).join("");
  const [lines] = useState(() => answerLines(parts).map((line) => (line.kind === "gap" ? line : { ...line, parts: lineTokens(line.parts) })));
  const total = lines.reduce((sum, line) => sum + (line.kind === "gap" ? 0 : line.parts.length), 0);
  const shown = useReveal(total, animate);
  const done = shown >= total;

  useEffect(() => () => stopSpeaking(), []);

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
        <View accessible accessibilityLabel={`Rehber: ${plain}`} style={styles.lines}>
          {drawn}
        </View>

        {done && (response.grounded || response.attachments.trip) && (
          <Appear animate={animate} style={styles.extras}>
            {response.grounded && (
              <View style={styles.sources}>
                {response.citations.map((citation) => (
                  <SourceChip key={citation.ref} citation={citation} />
                ))}
              </View>
            )}

            {response.attachments.trip && <TripSummary trip={response.attachments.trip} />}
          </Appear>
        )}
      </View>

      {done && (
        <Appear animate={animate}>
          <View style={styles.actions}>
            <ActionButton
              icon={reading ? "stop-circle-outline" : "volume-high-outline"}
              title={reading ? "Durdur" : "Dinle"}
              label={reading ? "Okumayı durdur" : "Cevabı sesli oku"}
              onPress={() => {
                if (reading) stopSpeaking();
                else speak(plain);
                setReading(!reading);
              }}
            />
            <ActionButton
              icon="share-social-outline"
              title="Paylaş"
              label="Cevabı paylaş"
              onPress={() => void Share.share({ message: plain }).catch(() => {})}
            />
            {!response.grounded && (
              <Text variant="caption" color="textSecondary" style={styles.note}>
                Genel sohbet · kaynak yok
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
  const { colors: c } = useTheme();
  const offers = followUps(response);
  if (offers.length === 0) return null;
  return (
    <Appear animate={animate} style={styles.followUps}>
      <Text variant="caption" color="textSecondary" style={styles.followUpsTitle}>
        İstersen şunlara da bakabilirim
      </Text>
      {offers.map((offer) => (
        <Pressable
          key={offer.topic}
          accessibilityRole="button"
          accessibilityLabel={`Sor: ${offer.question}`}
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
  const { colors: c } = useTheme();
  return (
    <View style={styles.byline} aria-hidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.avatar, { backgroundColor: c.text }]}>
        <Ionicons name="sparkles" size={12} color={c.background} />
      </View>
      <Text variant="caption" style={styles.bold}>
        Rehber
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
  const { colors: c } = useTheme();
  const router = useRouter();
  const target = citationTarget(citation);
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
      <View style={look} accessible accessibilityLabel={`Kaynak: ${citation.title}`}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Kaynak: ${citation.title}, ${target.action}`}
      onPress={() => router.push(target.href)}
      // The pill is drawn small; the target stays 44pt tall.
      hitSlop={{ top: 8, bottom: 8 }}
      style={({ pressed }) => [look, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

/** The plan behind a trip answer, day by day, on a grey card; the answer itself only sums it up. */
function TripSummary({ trip }: { trip: TripPlanResponse }) {
  const { colors: c } = useTheme();
  const multiDay = trip.days.length > 1;
  return (
    <View style={[styles.trip, { backgroundColor: c.surfaceRaised }]}>
      <Text variant="label" headingLevel={3}>
        {`${trip.city.label} gezi planı`}
      </Text>
      {trip.days.map((day) => (
        <View key={day.day} style={styles.day}>
          <Text variant="caption" color="textSecondary" headingLevel={multiDay ? 4 : undefined}>
            {multiDay ? `${day.day}. gün · ${day.weatherNote.text}` : day.weatherNote.text}
          </Text>
          {day.items.map((item, i) => (
            // Two items can start in the same minute; the position keeps the key unique.
            <View key={`${i}-${item.kind}-${item.at}`} style={styles.tripRow}>
              <Text variant="caption" color="textSecondary" style={styles.clock}>
                {formatClock(item.at)}
              </Text>
              <Text variant="caption" style={styles.flex}>
                {item.kind === "stop" ? item.asset.name : item.dish ? `${item.label}: ${item.dish.name}` : item.label}
              </Text>
            </View>
          ))}
        </View>
      ))}
      <Text variant="caption" color="textSecondary">
        {trip.estimateNote}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  trip: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  day: {
    gap: spacing.xs,
  },
  tripRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  clock: {
    width: 44,
    fontFamily: fontFamily.mono,
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
