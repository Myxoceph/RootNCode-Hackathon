import Ionicons from "@expo/vector-icons/Ionicons";
import type { ChatConversation } from "@vagabonds/contracts";
import {
  fontFamily,
  palette,
  radius,
  spacing,
  Text,
  useTheme,
} from "@vagabonds/ui";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { LIST_LOOKS } from "@/components/city-asset-cards";
import { deleteConversation, fetchConversations } from "@/data/assistant";
import { DataError } from "@/data/errors";
import { announce } from "@/lib/announce";
import { dayGroup } from "@/lib/chat";

/** The panel's width beside the conversation. */
export const SESSIONS_WIDTH = 300;

/** The app's tab gold (4.57:1 under white words), and its tints for the icons and the open row. */
const GOLD = "#966F22";
const TINT = "rgba(150, 111, 34, 0.12)";
const GOLD_EDGE = "rgba(150, 111, 34, 0.35)";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });

type Load =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; items: ChatConversation[] };

interface AssistantSessionsProps {
  /** The conversation on screen: the archived one's id, or the open one's asset (`null` for the general one). */
  current: { archiveId: string } | { assetId: string | null };
  /** Changes when the conversation on screen does (a question asked, a new one started): the list is fetched again. */
  version: string;
  onOpen: (item: ChatConversation) => void;
  onNew: () => void;
  /** Whether "Yeni konuşma" has anything to start from: not on an empty open conversation. */
  canStartNew: boolean;
}

/**
 * Rehber's conversations on a wide web page, as chat sites list them: a panel at the left of the
 * conversation, always open, with "Yeni konuşma" on top and the account's conversations under it,
 * last asked first, grouped by day. The one on screen is marked; a click opens another (an open
 * one continues, an archived one opens read-only). Each can be deleted from its row. The phone and
 * a narrow window keep the history page behind the clock in the bar (`/assistant-history`).
 */
export function AssistantSessions({
  current,
  version,
  onOpen,
  onNew,
  canStartNew,
}: AssistantSessionsProps) {
  const look = LIST_LOOKS[useTheme().scheme];
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [hovered, setHovered] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchConversations().then(
      (items) => setLoad({ kind: "ready", items }),
      (error: unknown) =>
        setLoad({
          kind: "error",
          message:
            error instanceof DataError
              ? error.message
              : "Konuşmalar yüklenemedi.",
        }),
    );
  }, []);
  useFocusEffect(refresh);
  // A question asked or a conversation started moves it to the top: fetched again a moment after.
  useEffect(() => {
    const timer = setTimeout(refresh, 600);
    return () => clearTimeout(timer);
  }, [version, refresh]);

  async function remove(item: ChatConversation) {
    if (load.kind !== "ready") return;
    setLoad({
      kind: "ready",
      items: load.items.filter((other) => other.id !== item.id),
    });
    try {
      await deleteConversation(item.id);
      announce("Konuşma silindi.");
    } catch (error) {
      announce(
        error instanceof DataError ? error.message : "Konuşma silinemedi.",
      );
      refresh();
    }
  }

  const isCurrent = (item: ChatConversation) =>
    "archiveId" in current
      ? item.id === current.archiveId
      : !item.archived && (item.assetId ?? null) === current.assetId;

  const items = load.kind === "ready" ? load.items : [];
  const groups: Array<{ title: string; items: ChatConversation[] }> = [];
  for (const item of items) {
    const title = dayGroup(item.updatedAt);
    if (groups.at(-1)?.title !== title) groups.push({ title, items: [] });
    groups.at(-1)!.items.push(item);
  }

  const total = items.length;
  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: look.panel,
          borderColor: look.panelEdge,
          boxShadow: look.shadow,
        },
      ]}
    >
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <Text
            variant="label"
            headingLevel={2}
            colorValue={look.text}
            style={styles.title}
          >
            Konuşmalar
          </Text>
          {total > 0 && (
            <Text variant="caption" colorValue={look.textSecondary}>
              {total}
            </Text>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Yeni konuşma"
          accessibilityHint="Bu konuşma geçmişe kaydedilir"
          accessibilityState={{ disabled: !canStartNew }}
          disabled={!canStartNew}
          onPress={onNew}
          style={({
            pressed,
            hovered: over,
          }: {
            pressed: boolean;
            hovered?: boolean;
          }) => [
            styles.new,
            canStartNew
              ? { backgroundColor: GOLD, opacity: over ? 0.9 : 1 }
              : {
                  backgroundColor: look.row,
                  borderColor: look.edge,
                  borderWidth: 1,
                },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name="add"
            size={19}
            color={canStartNew ? palette.white : look.textSecondary}
          />
          <Text
            variant="label"
            colorValue={canStartNew ? palette.white : look.textSecondary}
            style={styles.newText}
          >
            Yeni konuşma
          </Text>
        </Pressable>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        {load.kind === "loading" && (
          <ActivityIndicator
            color={look.textSecondary}
            accessibilityLabel="Konuşmalar yükleniyor"
            style={styles.state}
          />
        )}
        {load.kind === "error" && (
          <View style={styles.state}>
            <Text variant="caption" color="warning" accessibilityRole="alert">
              {load.message}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={refresh}
              style={({ pressed }) => [
                styles.retry,
                { backgroundColor: look.row },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="refresh" size={14} color={look.text} />
              <Text variant="caption" colorValue={look.text}>
                Tekrar dene
              </Text>
            </Pressable>
          </View>
        )}
        {load.kind === "ready" && total === 0 && (
          <View style={[styles.empty, { backgroundColor: look.row }]}>
            <View style={[styles.icon, { backgroundColor: TINT }]}>
              <Ionicons name="chatbubbles-outline" size={18} color={GOLD} />
            </View>
            <Text
              variant="caption"
              colorValue={look.textSecondary}
              style={styles.emptyText}
            >
              Rehber'e sorduğun sorular burada saklanır; istediğin zaman dönüp
              okuyabilirsin.
            </Text>
          </View>
        )}

        {groups.map((group) => (
          <View key={group.title} style={styles.group}>
            <Text
              variant="caption"
              colorValue={look.textSecondary}
              headingLevel={3}
              style={styles.groupTitle}
            >
              {group.title}
            </Text>
            <View accessibilityRole="list" style={styles.rows}>
              {group.items.map((item) => {
                const on = isCurrent(item);
                const over = hovered === item.id;
                const page = item.assetName ?? "Rehber";
                return (
                  <View
                    key={item.id}
                    accessibilityRole="listitem"
                    onPointerEnter={() => setHovered(item.id)}
                    onPointerLeave={() =>
                      setHovered((id) => (id === item.id ? null : id))
                    }
                    style={[
                      styles.row,
                      {
                        backgroundColor: on
                          ? look.chosen
                          : over
                            ? look.hover
                            : "transparent",
                        borderColor: on ? GOLD_EDGE : "transparent",
                      },
                    ]}
                  >
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel={`${item.title} (${page}): ${item.archived ? "arşivde, okumak için aç" : "açık, devam etmek için aç"}`}
                      aria-current={on ? "page" : undefined}
                      onPress={() => onOpen(item)}
                      style={({ pressed }) => [
                        styles.rowMain,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.icon,
                          { backgroundColor: on ? GOLD : TINT },
                        ]}
                      >
                        <Ionicons
                          name={
                            item.archived
                              ? "archive-outline"
                              : item.assetId
                                ? "business-outline"
                                : "sparkles"
                          }
                          size={15}
                          color={on ? palette.white : GOLD}
                        />
                      </View>
                      <View style={styles.rowText}>
                        <Text
                          variant="label"
                          colorValue={look.text}
                          numberOfLines={1}
                          style={[styles.rowTitle, on && styles.rowTitleOn]}
                        >
                          {item.title}
                        </Text>
                        <Text
                          variant="caption"
                          colorValue={look.textSecondary}
                          numberOfLines={1}
                        >
                          {`${page} · ${time(item.updatedAt)}`}
                        </Text>
                      </View>
                    </Pressable>
                    {(over || on) && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${item.title} konuşmasını sil`}
                        onPress={() => void remove(item)}
                        style={({
                          pressed,
                          hovered: hot,
                        }: {
                          pressed: boolean;
                          hovered?: boolean;
                        }) => [
                          styles.remove,
                          hot && { backgroundColor: look.buttonHover },
                          pressed && styles.pressed,
                        ]}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={15}
                          color={look.textSecondary}
                        />
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  /** A card floating at the left of the page, as the map's side panel does. */
  panel: {
    width: SESSIONS_WIDTH,
    marginLeft: spacing.md,
    marginBottom: spacing.md,
    marginTop: spacing.xxs,
    borderRadius: 28,
    borderWidth: 1,
    overflow: "hidden",
  },
  head: {
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xxs,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 22,
  },
  new: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    height: 44,
    borderRadius: radius.full,
    transitionProperty: "opacity",
    transitionDuration: "150ms",
  },
  newText: {
    fontFamily: fontFamily.sansSemiBold,
  },
  content: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  state: {
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  retry: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
  },
  empty: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.xl,
  },
  emptyText: {
    flex: 1,
  },
  group: {
    gap: spacing.xs,
  },
  groupTitle: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    paddingHorizontal: spacing.sm,
  },
  rows: {
    gap: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.lg,
    borderWidth: 1,
    transitionProperty: "background-color",
    transitionDuration: "120ms",
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowTitle: {
    fontFamily: fontFamily.sansMedium,
  },
  rowTitleOn: {
    fontFamily: fontFamily.sansSemiBold,
  },
  remove: {
    width: 30,
    height: 30,
    marginRight: spacing.xs,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.75,
  },
});
