import Ionicons from "@expo/vector-icons/Ionicons";
import type { ChatCitation, ChatResponse, TripPlanResponse } from "@vagabonds/contracts";
import { radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { useRouter, type Href } from "expo-router";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { answerParts } from "@/lib/chat";

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
  asset: "business-outline",
  dish: "restaurant-outline",
  trip: "git-branch-outline",
  weather: "partly-sunny-outline",
};

export function UserMessage({ text }: { text: string }) {
  const { colors: c } = useTheme();
  return (
    <View style={[styles.bubble, styles.user, { backgroundColor: c.primary }]} accessible accessibilityLabel={`Sen: ${text}`}>
      <Text colorValue={c.onPrimary}>{text}</Text>
    </View>
  );
}

/**
 * One answer: the text with its `[n]` markers, then its sources as buttons, then the trip plan
 * when there is one. An answer without sources is marked as general conversation, so it never
 * reads as information about a site.
 */
export function AssistantMessage({ response }: { response: ChatResponse }) {
  const { colors: c } = useTheme();
  const parts = answerParts(response.answer, response.citations);
  // Screen readers read "kaynak 1" instead of a bare bracketed number.
  const spoken = parts.map((part) => (part.kind === "text" ? part.text : ` (kaynak ${part.citation.ref})`)).join("");

  return (
    <View style={[styles.bubble, styles.assistant, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text accessibilityLabel={`Asistan: ${spoken}`}>
        {parts.map((part, i) =>
          part.kind === "text" ? (
            part.text
          ) : (
            <Text key={i} variant="caption" color="primary">
              {`[${part.citation.ref}]`}
            </Text>
          ),
        )}
      </Text>

      {response.grounded ? (
        <View style={styles.sources}>
          {response.citations.map((citation) => (
            <SourceChip key={citation.ref} citation={citation} />
          ))}
        </View>
      ) : (
        <Text variant="caption" color="textSecondary">
          Genel sohbet · kaynak yok
        </Text>
      )}

      {response.attachments.trip && <TripSummary trip={response.attachments.trip} />}
    </View>
  );
}

function SourceChip({ citation }: { citation: ChatCitation }) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const target = citationTarget(citation);
  const content = (
    <>
      <Text variant="caption" color="primary" style={styles.mono}>
        {`[${citation.ref}]`}
      </Text>
      <Ionicons name={citationIcon[citation.kind]} size={16} color={c.textSecondary} />
      <Text variant="caption" numberOfLines={1} style={styles.chipTitle}>
        {citation.title}
      </Text>
      {target && <Ionicons name="chevron-forward" size={16} color={c.textSecondary} />}
    </>
  );

  if (!target) {
    return (
      <View style={[styles.chip, { borderColor: c.border }]} accessible accessibilityLabel={`Kaynak ${citation.ref}: ${citation.title}`}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Kaynak ${citation.ref}: ${citation.title}, ${target.action}`}
      onPress={() => router.push(target.href)}
      style={({ pressed }) => [styles.chip, { borderColor: c.border, backgroundColor: pressed ? c.surfaceRaised : "transparent" }]}
    >
      {content}
    </Pressable>
  );
}

const hhmm = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** The plan behind a trip answer, day by day; the answer itself only sums it up. */
function TripSummary({ trip }: { trip: TripPlanResponse }) {
  const { colors: c } = useTheme();
  const multiDay = trip.days.length > 1;
  return (
    <View style={[styles.trip, { borderTopColor: c.border }]}>
      <Text variant="label" headingLevel={3}>
        {`${trip.city.label} gezi planı`}
      </Text>
      {trip.days.map((day) => (
        <View key={day.day} style={styles.day}>
          {multiDay && (
            <Text variant="caption" color="textSecondary" headingLevel={4}>
              {`${day.day}. gün · ${day.weatherNote.text}`}
            </Text>
          )}
          {!multiDay && (
            <Text variant="caption" color="textSecondary">
              {day.weatherNote.text}
            </Text>
          )}
          {day.items.map((item) => (
            <View key={`${item.kind}-${item.at}`} style={styles.tripRow}>
              <Text variant="caption" style={styles.mono}>
                {hhmm(item.at)}
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
    fontVariant: ["tabular-nums"],
  },
  bubble: {
    maxWidth: "88%",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  user: {
    alignSelf: "flex-end",
    borderBottomRightRadius: radius.sm,
  },
  assistant: {
    alignSelf: "flex-start",
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: radius.sm,
  },
  sources: {
    gap: spacing.xs,
  },
  chip: {
    minHeight: touchTarget.min,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
  },
  chipTitle: {
    flexShrink: 1,
  },
  trip: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  day: {
    gap: spacing.xs,
  },
  tripRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});
