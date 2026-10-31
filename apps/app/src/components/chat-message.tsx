import Ionicons from "@expo/vector-icons/Ionicons";
import type { ChatCitation, ChatResponse, TripPlanResponse } from "@vagabonds/contracts";
import { fontFamily, radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { useRouter, type Href } from "expo-router";
import { useEffect, useState, type ComponentProps } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";

import { formatClock } from "@/content/routes";
import { answerParts } from "@/lib/chat";
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
      return null;
  }
}

const citationIcon: Record<ChatCitation["kind"], IconName> = {
  asset: "business",
  dish: "restaurant",
  trip: "git-branch",
  weather: "partly-sunny",
};

/** The visitor's line: a grey bubble on the right. */
export function UserMessage({ text }: { text: string }) {
  const { colors: c } = useTheme();
  return (
    <View style={[styles.user, { backgroundColor: c.surfaceRaised }]} accessible accessibilityLabel={`Sen: ${text}`}>
      <Text style={styles.body}>{text}</Text>
    </View>
  );
}

/** One dot that breathes while the answer is being written. Still when motion is reduced. */
export function Thinking() {
  const { colors: c } = useTheme();
  const reduceMotion = useReducedMotion();
  const [t] = useState(() => new Animated.Value(0));
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

  return (
    <View style={styles.thinking} accessible accessibilityLabel="Yanıt hazırlanıyor">
      <Animated.View style={[styles.pulse, { backgroundColor: c.text, transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.1] }) }] }]} />
    </View>
  );
}

/**
 * One answer, as plain text across the column: the text with its small `n` markers, its sources
 * as small grey pills, the trip plan when there is one, and a row of quiet actions under it. An
 * answer without sources is marked as general conversation, so it never reads as information
 * about a site.
 */
export function AssistantMessage({ response }: { response: ChatResponse }) {
  const { colors: c } = useTheme();
  const [reading, setReading] = useState(false);
  const parts = answerParts(response.answer, response.citations);
  const plain = parts.map((part) => (part.kind === "text" ? part.text : "")).join("");
  // Screen readers read "kaynak 1" instead of a bare number.
  const spoken = parts.map((part) => (part.kind === "text" ? part.text : ` (kaynak ${part.citation.ref})`)).join("");

  useEffect(() => () => stopSpeaking(), []);

  return (
    <View style={styles.answer}>
      <Text style={styles.body} accessibilityLabel={`Rehber: ${spoken}`}>
        {parts.map((part, i) =>
          part.kind === "text" ? (
            part.text
          ) : (
            <Text key={i} variant="caption" color="textSecondary" style={styles.ref}>
              {` ${part.citation.ref}`}
            </Text>
          ),
        )}
      </Text>

      {response.grounded && (
        <View style={styles.sources}>
          {response.citations.map((citation) => (
            <SourceChip key={citation.ref} citation={citation} />
          ))}
        </View>
      )}

      {response.attachments.trip && <TripSummary trip={response.attachments.trip} />}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={reading ? "Okumayı durdur" : "Cevabı sesli oku"}
          // Drawn 36pt; the target is 44.
          hitSlop={4}
          onPress={() => {
            if (reading) stopSpeaking();
            else speak(plain);
            setReading(!reading);
          }}
          style={({ pressed }) => [styles.action, pressed && { backgroundColor: c.surfaceRaised }]}
        >
          <Ionicons name={reading ? "stop-circle-outline" : "volume-medium-outline"} size={18} color={c.textSecondary} />
        </Pressable>
        {!response.grounded && (
          <Text variant="caption" color="textSecondary">
            Genel sohbet · kaynak yok
          </Text>
        )}
      </View>
    </View>
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
      <Text variant="caption" color="textSecondary" style={styles.mono}>
        {String(citation.ref)}
      </Text>
    </>
  );
  const look = [styles.chip, { backgroundColor: c.surfaceRaised }];

  if (!target) {
    return (
      <View style={look} accessible accessibilityLabel={`Kaynak ${citation.ref}: ${citation.title}`}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Kaynak ${citation.ref}: ${citation.title}, ${target.action}`}
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
  mono: {
    fontFamily: fontFamily.mono,
  },
  pressed: {
    opacity: 0.6,
  },
  body: {
    fontSize: 16,
    lineHeight: 26,
  },
  user: {
    alignSelf: "flex-end",
    maxWidth: "80%",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + spacing.xxs,
    borderRadius: 22,
  },
  thinking: {
    height: 26,
    justifyContent: "center",
  },
  pulse: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  answer: {
    gap: spacing.md,
  },
  ref: {
    fontFamily: fontFamily.monoMedium,
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
    alignItems: "center",
    gap: spacing.sm,
    marginLeft: -spacing.sm,
    marginTop: -spacing.xs,
  },
  action: {
    width: touchTarget.min - 8,
    height: touchTarget.min - 8,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
