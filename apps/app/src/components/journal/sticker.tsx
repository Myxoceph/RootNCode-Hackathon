import { radius, spacing, Text, touchTarget } from "@vagabonds/ui";
import { memo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { G, Path } from "react-native-svg";

import { useMessages } from "@/i18n";
import { STICKER_EDGE, STICKER_GROUPS, stickerArt, type StickerId, type StickerShape } from "@/lib/journal-stickers";

import { book } from "./paper";

const VIEW = 100;
/** The paper edge and its shadow go outside the drawing's square: this much is left round it, so they are not cut off. */
const VIEW_ROOM = 7;
const SHADOW_DROP = 1.4;
const SHADOW = "rgba(58, 43, 39, 0.2)";
const PAPER = "#FFFFFF";
const ART = 66;
const CELL_HEIGHT = 76;
const DRAWER_HEIGHT = 228;
/** On a small phone the page keeps the most of the screen. */
const DRAWER_SHARE = 0.36;

function Edge({ shapes, color }: { shapes: readonly StickerShape[]; color: string }) {
  return shapes.map((shape, at) => (
    <Path key={at} d={shape.d} fill={shape.fill ? color : "none"} stroke={color} strokeWidth={(shape.strokeWidth ?? 0) + STICKER_EDGE * 2} strokeLinecap="round" strokeLinejoin="round" />
  ));
}

/** A sticker as it was cut: its drawing on white paper that follows its outline, with a soft shadow. */
export const StickerArt = memo(function StickerArt({ sticker, size }: { sticker: string; size: number }) {
  const shapes = stickerArt(sticker);
  if (!shapes) return null;
  const edge = shapes.filter((shape) => shape.edge);
  return (
    <Svg aria-hidden pointerEvents="none" width={size} height={size} viewBox={`${-VIEW_ROOM} ${-VIEW_ROOM} ${VIEW + VIEW_ROOM * 2} ${VIEW + VIEW_ROOM * 2}`}>
      <G transform={`translate(0 ${SHADOW_DROP})`}>
        <Edge shapes={edge} color={SHADOW} />
      </G>
      <Edge shapes={edge} color={PAPER} />
      {shapes.map((shape, at) => (
        <Path key={at} d={shape.d} fill={shape.fill ?? "none"} fillRule={shape.fillRule} stroke={shape.stroke} strokeWidth={shape.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
});

type StickerGroup = keyof typeof STICKER_GROUPS;
const GROUPS = Object.keys(STICKER_GROUPS) as StickerGroup[];

/** The sheets of stickers, one for each kind, under the page: choosing one puts it on the page. */
export function StickerDrawer({ full, onPick }: { full: boolean; onPick: (sticker: StickerId) => void }) {
  const w = useMessages().journal.arrange;
  const { height: screenHeight } = useWindowDimensions();
  const [group, setGroup] = useState<StickerGroup>("sites");
  return (
    <View style={[styles.drawer, { height: Math.min(DRAWER_HEIGHT, screenHeight * DRAWER_SHARE) }]}>
      {full ? (
        <Text accessibilityRole="alert" variant="caption" colorValue={book.danger} style={styles.notice}>
          {w.stickersFull}
        </Text>
      ) : (
        <>
          <ScrollView horizontal accessibilityRole="tablist" showsHorizontalScrollIndicator={false} style={styles.tabsRow} contentContainerStyle={styles.tabs}>
            {GROUPS.map((one) => {
              const on = one === group;
              return (
                <Pressable key={one} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setGroup(one)} style={[styles.tab, on && styles.tabOn]}>
                  <Text variant="label" numberOfLines={1} colorValue={on ? "#FFFFFF" : book.leather}>
                    {w.stickerGroups[one]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.grid}>
            {STICKER_GROUPS[group].map((sticker) => (
              <Pressable key={sticker} accessibilityRole="button" accessibilityLabel={w.addSticker(w.stickerNames[sticker])} onPress={() => onPick(sticker)} style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}>
                <StickerArt sticker={sticker} size={ART} />
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  drawer: {
    marginHorizontal: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    overflow: "hidden",
    borderRadius: radius.lg,
    backgroundColor: book.paper,
  },
  notice: {
    padding: spacing.lg,
    textAlign: "center",
  },
  tabsRow: {
    flexGrow: 0,
  },
  tabs: {
    gap: spacing.xs,
    padding: spacing.xs,
  },
  tab: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: touchTarget.min / 2,
  },
  tabOn: {
    backgroundColor: book.leather,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm,
  },
  cell: {
    width: "25%",
    height: CELL_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  cellPressed: {
    backgroundColor: book.paperEdge,
    transform: [{ scale: 0.94 }],
  },
});
