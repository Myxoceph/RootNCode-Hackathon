"use no memo";
// Reads the app's language outside hooks (getMessages, casing, localeTag): the React Compiler must not cache it.
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ChatConversation } from "@vagabonds/contracts";
import { fontFamily, radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { useFocusEffect, useRouter } from "expo-router";
import Head from "expo-router/head";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { deleteAllConversations, deleteConversation, fetchConversations } from "@/data/assistant";
import { DataError } from "@/data/errors";
import { announce } from "@/lib/announce";
import { localeTag, useLang } from "@/i18n";
import { dayGroup } from "@/lib/chat";

type Load = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: ChatConversation[] };

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(localeTag(), {
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * `/assistant-history`: the account's conversations with Rehber, last asked first, grouped by
 * day. An open one continues on its page; an archived one opens read-only. Each can be deleted,
 * and all at once after a second tap.
 */
export default function AssistantHistoryScreen() {
  useLang();
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [confirming, setConfirming] = useState(false);

  const refresh = useCallback(() => {
    fetchConversations().then(
      (items) => setLoad({ kind: "ready", items }),
      (error: unknown) =>
        setLoad({
          kind: "error",
          message: error instanceof DataError ? error.message : "Konuşmalar yüklenemedi.",
        }),
    );
  }, []);
  // Again on coming back: a question asked meanwhile moves its conversation to the top.
  useFocusEffect(refresh);

  function open(item: ChatConversation) {
    if (item.archived) {
      router.push({
        pathname: "/assistant",
        params: { conversation: item.id },
      });
    } else {
      router.push({
        pathname: "/assistant",
        params: item.assetId ? { asset: item.assetId, name: item.assetName ?? undefined } : {},
      });
    }
  }

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
      announce(error instanceof DataError ? error.message : "Konuşma silinemedi.");
      refresh();
    }
  }

  async function removeAll() {
    setConfirming(false);
    try {
      await deleteAllConversations();
      setLoad({ kind: "ready", items: [] });
      announce("Bütün konuşmalar silindi.");
    } catch (error) {
      announce(error instanceof DataError ? error.message : "Konuşmalar silinemedi.");
    }
  }

  const items = load.kind === "ready" ? load.items : [];
  const groups: Array<{ title: string; items: ChatConversation[] }> = [];
  for (const item of items) {
    const title = dayGroup(item.updatedAt);
    if (groups.at(-1)?.title !== title) groups.push({ title, items: [] });
    groups.at(-1)!.items.push(item);
  }

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} contentInsetAdjustmentBehavior="automatic">
      <Head>
        <title>Geçmiş konuşmalar · Vagabonds</title>
      </Head>

      {load.kind === "loading" && <ActivityIndicator color={c.textSecondary} accessibilityLabel="Konuşmalar yükleniyor" style={styles.loading} />}

      {load.kind === "error" && (
        <View style={[styles.empty, { backgroundColor: c.surface }]}>
          <Text color="warning" accessibilityRole="alert" style={styles.centered}>
            {load.message}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={refresh}
            style={({ pressed }) => [styles.secondary, { backgroundColor: c.surfaceRaised }, pressed && styles.pressed]}
          >
            <Ionicons name="refresh" size={16} color={c.text} />
            <Text variant="label">Tekrar dene</Text>
          </Pressable>
        </View>
      )}

      {load.kind === "ready" && items.length === 0 && (
        <View style={[styles.empty, { backgroundColor: c.surface }]}>
          <View style={[styles.emptyIcon, { backgroundColor: c.surfaceRaised }]}>
            <Ionicons name="chatbubbles-outline" size={26} color={c.highlightMark} />
          </View>
          <Text variant="heading" headingLevel={2} style={styles.centered}>
            Henüz konuşma yok
          </Text>
          <Text color="textSecondary" style={styles.centered}>
            Rehber'e sorduğun sorular burada saklanır; istediğin zaman dönüp okuyabilirsin.
          </Text>
        </View>
      )}

      {groups.map((group) => (
        <View key={group.title} style={styles.group}>
          <Text variant="caption" color="textSecondary" headingLevel={2} style={styles.groupTitle}>
            {group.title}
          </Text>
          <View accessibilityRole="list" style={[styles.list, { backgroundColor: c.surface }]}>
            {group.items.map((item, i) => {
              const page = item.assetName ?? "Rehber";
              const questions = Math.ceil(item.messageCount / 2);
              return (
                <View
                  key={item.id}
                  style={[
                    styles.row,
                    i > 0 && {
                      borderTopColor: c.border,
                      borderTopWidth: StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`${item.title} (${page}, ${questions} soru, ${time(item.updatedAt)}): ${item.archived ? "arşivde, okumak için aç" : "açık, devam etmek için aç"}`}
                    onPress={() => open(item)}
                    style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: c.surfaceRaised }]}>
                      <Ionicons name={item.archived ? "archive-outline" : "chatbubble-ellipses-outline"} size={18} color={c.highlightMark} />
                    </View>
                    <View style={styles.flex}>
                      <Text variant="label" numberOfLines={2} style={styles.rowTitle}>
                        {item.title}
                      </Text>
                      <Text variant="caption" color="textSecondary" numberOfLines={1}>
                        {`${page} · ${questions} soru · ${time(item.updatedAt)}${item.archived ? "" : " · Açık"}`}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${item.title} konuşmasını sil`}
                    onPress={() => void remove(item)}
                    hitSlop={4}
                    style={({ pressed }) => [styles.remove, pressed && { backgroundColor: c.surfaceRaised }]}
                  >
                    <Ionicons name="trash-outline" size={18} color={c.textSecondary} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      ))}

      {items.length > 0 &&
        (confirming ? (
          <View style={[styles.confirm, { backgroundColor: c.surface }]} accessibilityRole="alert">
            <Text style={styles.centered}>Bütün konuşmalar silinsin mi? Bu geri alınamaz.</Text>
            <View style={styles.confirmActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirming(false)}
                style={({ pressed }) => [styles.secondary, { backgroundColor: c.surfaceRaised }, pressed && styles.pressed]}
              >
                <Text variant="label">Vazgeç</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void removeAll()}
                style={({ pressed }) => [styles.secondary, { backgroundColor: c.text }, pressed && styles.pressed]}
              >
                <Text variant="label" colorValue={c.background}>
                  Hepsini sil
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setConfirming(true)}
            style={({ pressed }) => [styles.clearAll, pressed && styles.pressed]}
          >
            <Ionicons name="trash-outline" size={16} color={c.textSecondary} />
            <Text variant="label" color="textSecondary">
              Bütün konuşmaları sil
            </Text>
          </Pressable>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centered: {
    textAlign: "center",
  },
  pressed: {
    opacity: 0.7,
  },
  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    padding: spacing.lg,
    gap: spacing.lg,
  },
  loading: {
    marginTop: spacing.xxl,
  },
  group: {
    gap: spacing.xs,
  },
  groupTitle: {
    fontFamily: fontFamily.sansSemiBold,
    paddingHorizontal: spacing.xs,
  },
  list: {
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: spacing.xs,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg,
    minHeight: touchTarget.min + spacing.md,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    fontFamily: fontFamily.sansSemiBold,
    marginBottom: spacing.xxs,
  },
  remove: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.xl + spacing.xs,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
  },
  clearAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: touchTarget.min,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
  },
  confirm: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  confirmActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
  },
});
