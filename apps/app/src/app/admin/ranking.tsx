import Ionicons from "@expo/vector-icons/Ionicons";
import type { ModerationItem } from "@vagabonds/contracts";
import { fontFamily, palette, Text } from "@vagabonds/ui";
import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { Card, Cell, Empty, Failed, formatNumber, Loading, PageHeader, Segments, TableHead, TableRow, timeAgo, useAdminColors, useLoad, type Column } from "@/components/admin/kit";
import { PageBody } from "@/components/admin/shell";
import { fetchWholeQueue } from "@/data/admin";

type Period = "7" | "30" | "all";
type Kind = "all" | "notes" | "photos";

interface Row {
  id: string;
  name: string;
  notes: number;
  photos: number;
  total: number;
  pending: number;
  last: string;
}

/** The assets ranked by approved notes, written and with a photo, over a chosen period. */
export default function Ranking() {
  const { width } = useWindowDimensions();
  const narrow = width < 900;
  const [period, setPeriod] = useState<Period>("30");
  const [kind, setKind] = useState<Kind>("all");
  const approved = useLoad(() => fetchWholeQueue("approved"));
  const pending = useLoad(() => fetchWholeQueue("pending"));

  const rows = approved.data ? rank(approved.data, pending.data ?? [], period, kind) : null;
  const top = rows?.slice(0, 3) ?? [];
  const rest = rows?.slice(3) ?? [];
  const most = rest[0]?.total ?? 1;

  const columns: Column[] = narrow
    ? [
        { label: "#", width: 44 },
        { label: "Diğer eserler", flex: 1 },
        { label: "Not", width: 70, align: "right" },
      ]
    : [
        { label: "#", width: 52 },
        { label: "Diğer eserler", flex: 2 },
        { label: "Yazılı", width: 80, align: "right" },
        { label: "Fotoğraflı", width: 96, align: "right" },
        { label: "Bekleyen", width: 90, align: "right" },
        { label: "Toplam", flex: 1.4 },
      ];

  return (
    <PageBody>
      <PageHeader overline="Topluluk Ziyaretçi Nabzı" title="En çok not alan eserler" hint="Ziyaretçilerin onaylanan yazılı ve fotoğraflı notlarına göre eserlerin sıralaması." />
      <View style={styles.filters}>
        <Segments
          label="Dönem"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "7", label: "Son 7 gün" },
            { value: "30", label: "Son 30 gün" },
            { value: "all", label: "Tüm zamanlar" },
          ]}
        />
        <Segments
          label="Not türü"
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: "Tümü" },
            { value: "notes", label: "Yazılı" },
            { value: "photos", label: "Fotoğraflı" },
          ]}
        />
      </View>

      {approved.loading && !approved.data ? (
        <Card>
          <Loading />
        </Card>
      ) : approved.error && !approved.data ? (
        <Card>
          <Failed message={approved.error} onRetry={approved.reload} />
        </Card>
      ) : !rows || rows.length === 0 ? (
        <Card>
          <Empty icon="trophy-outline" title="Bu dönemde onaylanan not yok" body="Daha uzun bir dönem seç ya da notlar onaylandıkça burayı tekrar kontrol et." />
        </Card>
      ) : (
        <>
          <View style={[styles.podium, { flexDirection: narrow ? "column" : "row" }]}>
            {top.map((row, i) => (
              <Podium key={row.id} row={row} place={i + 1} narrow={narrow} />
            ))}
          </View>
          {rest.length > 0 && (
          <Card padded={false} style={{ paddingVertical: 8 }}>
            <TableHead columns={columns} />
            {rest.map((row, index) => {
              const i = index + 3;
              const cells = narrow
                ? [<Place key="p" place={i + 1} />, <Cell key="n" title={row.name} sub={`${row.notes} yazılı · ${row.photos} fotoğraflı`} />, <Total key="t" value={row.total} />]
                : [
                    <Place key="p" place={i + 1} />,
                    <Cell key="n" title={row.name} sub={`Son not ${timeAgo(row.last)}`} />,
                    <Count key="w" value={row.notes} />,
                    <Count key="f" value={row.photos} />,
                    <Count key="b" value={row.pending} muted />,
                    <Bar key="t" value={row.total} most={most} />,
                  ];
              return <TableRow key={row.id} columns={columns} cells={cells} last={index === rest.length - 1} />;
            })}
          </Card>
          )}
        </>
      )}
    </PageBody>
  );
}

function rank(approved: ModerationItem[], pending: ModerationItem[], period: Period, kind: Kind): Row[] {
  const since = period === "all" ? 0 : Date.now() - Number(period) * 86_400_000;
  const counted = (item: ModerationItem) => (kind === "all" ? true : kind === "photos" ? item.kind === "photo" : item.kind !== "photo");
  const rows = new Map<string, Row>();
  for (const item of approved) {
    if (new Date(item.createdAt).getTime() < since || !counted(item)) continue;
    const row = rows.get(item.asset.id) ?? { id: item.asset.id, name: item.asset.name, notes: 0, photos: 0, total: 0, pending: 0, last: item.createdAt };
    if (item.kind === "photo") row.photos += 1;
    else row.notes += 1;
    row.total += 1;
    if (item.createdAt > row.last) row.last = item.createdAt;
    rows.set(item.asset.id, row);
  }
  for (const item of pending) {
    const row = rows.get(item.asset.id);
    if (row && counted(item)) row.pending += 1;
  }
  return [...rows.values()].sort((a, b) => b.total - a.total || b.last.localeCompare(a.last));
}

/** One of the first three: gold for the first, the others on the soft tile. */
function Podium({ row, place, narrow }: { row: Row; place: number; narrow: boolean }) {
  const a = useAdminColors();
  const first = place === 1;
  const fg = first ? palette.gece950 : a.text;
  const sub = first ? palette.gece900 : a.textSecondary;
  return (
    <View style={[styles.podiumCard, !narrow && styles.podiumThird, { backgroundColor: a.card }]}>
      {first && (
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" aria-hidden>
          <Defs>
            <LinearGradient id="first" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={palette.altin300} />
              <Stop offset="1" stopColor={palette.altin200} stopOpacity={0.7} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#first)" />
        </Svg>
      )}
      <View style={styles.podiumTop}>
        <View style={[styles.podiumPlace, { backgroundColor: first ? palette.gece950 : a.ink }]}>
          <Text colorValue={first ? palette.altin300 : a.onInk} style={styles.podiumPlaceText}>
            {place}
          </Text>
        </View>
        <Ionicons name={first ? "trophy" : "trophy-outline"} size={20} color={fg} aria-hidden />
      </View>
      <Text colorValue={fg} style={styles.podiumName} numberOfLines={2}>
        {row.name}
      </Text>
      <View style={styles.podiumFoot}>
        <View>
          <Text colorValue={fg} style={styles.podiumValue}>
            {formatNumber(row.total)}
          </Text>
          <Text colorValue={sub} style={{ fontSize: 12.5 }}>
            onaylı not
          </Text>
        </View>
        <View style={[styles.podiumSplit, { backgroundColor: first ? "rgba(255,255,255,0.35)" : a.well }]}>
          <Text colorValue={sub} style={styles.podiumSplitText}>
            {row.notes} yazılı · {row.photos} fotoğraflı
          </Text>
        </View>
      </View>
    </View>
  );
}

function Place({ place }: { place: number }) {
  const a = useAdminColors();
  return (
    <View style={[styles.place, { backgroundColor: place <= 3 ? a.accent : a.well }]}>
      <Text colorValue={place <= 3 ? a.onAccent : a.textSecondary} style={styles.placeText}>
        {place}
      </Text>
    </View>
  );
}

function Count({ value, muted }: { value: number; muted?: boolean }) {
  return (
    <Text color={muted || value === 0 ? "textSecondary" : "text"} style={styles.count}>
      {formatNumber(value)}
    </Text>
  );
}

function Total({ value }: { value: number }) {
  return <Text style={styles.count}>{formatNumber(value)}</Text>;
}

function Bar({ value, most }: { value: number; most: number }) {
  const a = useAdminColors();
  return (
    <View style={styles.barRow}>
      <View style={[styles.barTrack, { backgroundColor: a.well }]}>
        <View style={{ width: `${(value / most) * 100}%`, height: "100%", borderRadius: 4, backgroundColor: a.ink }} />
      </View>
      <Text style={[styles.count, { minWidth: 28 }]}>{formatNumber(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  podium: { gap: 16, marginBottom: 16 },
  podiumCard: { flex: 1, minHeight: 190, borderRadius: 24, overflow: "hidden", padding: 20, gap: 14, justifyContent: "space-between" },
  podiumThird: { flexGrow: 0, flexShrink: 1, flexBasis: "32%" },
  podiumTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  podiumPlace: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  podiumPlaceText: { fontFamily: fontFamily.sansBold, fontSize: 15 },
  podiumName: { fontFamily: fontFamily.sansSemiBold, fontSize: 19, lineHeight: 25, letterSpacing: -0.4 },
  podiumFoot: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  podiumValue: { fontFamily: fontFamily.sansMedium, fontSize: 32, lineHeight: 38, letterSpacing: -1, fontVariant: ["tabular-nums"] },
  podiumSplit: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  podiumSplitText: { fontFamily: fontFamily.sansMedium, fontSize: 12 },
  place: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  placeText: { fontFamily: fontFamily.sansBold, fontSize: 13 },
  count: { fontFamily: fontFamily.sansSemiBold, fontSize: 14, fontVariant: ["tabular-nums"], textAlign: "right" },
  barRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
});
