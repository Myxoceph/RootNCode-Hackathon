import Ionicons from "@expo/vector-icons/Ionicons";
import type { AdminUser, ModerationItem } from "@vagabonds/contracts";
import { fontFamily, palette, Text } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

import { Avatar, Badge, Button, Card, Empty, Failed, formatNumber, Loading, PageHeader, timeAgo, useAdminColors, useLoad, type IconName } from "@/components/admin/kit";
import { ROLE } from "@/components/admin/labels";
import { KIND } from "@/components/admin/review-card";
import { PageBody, usePanel } from "@/components/admin/shell";
import { useCommunity } from "@/data";
import { fetchAdminSummary, fetchPanelAssets, fetchQueue, fetchUsers } from "@/data/admin";

/**
 * The panel's first page, as a bento of soft tiles: three counts with a week's small chart, then the
 * queue's next contribution, the community's make-up, the panel's assets and who joined lately.
 */
export default function Overview() {
  const router = useRouter();
  const { role } = usePanel();
  const { user } = useCommunity();
  const { width } = useWindowDimensions();
  const wide = width >= 1180;
  const medium = width >= 760;
  const summary = useLoad(fetchAdminSummary);
  const queue = useLoad(() => fetchQueue({ status: "pending", limit: 100 }));
  const approved = useLoad(() => fetchQueue({ status: "approved", limit: 100 }));
  const rejected = useLoad(() => fetchQueue({ status: "rejected", limit: 100 }));
  const users = useLoad(() => fetchUsers({ limit: 100 }));
  const assets = useLoad(() => (role === "admin" ? fetchPanelAssets() : Promise.resolve([])), [role]);

  const s = summary.data;
  const pending = s ? s.pending.notes : null;
  const days = lastDays(7);
  const joined = users.data ? perDay(days, users.data.items.map((person) => person.createdAt)) : null;
  const submitted = queue.data ? perDay(days, queue.data.items.map((item) => item.createdAt)) : null;
  const reviewedItems = [...(approved.data?.items ?? []), ...(rejected.data?.items ?? [])];
  const reviewed = approved.data && rejected.data ? perDay(days, reviewedItems.map((item) => item.reviewedAt ?? item.createdAt)) : null;
  const reviewedTotal = approved.data && rejected.data ? approved.data.total + rejected.data.total : null;
  const joinedAccounts = users.data ? users.data.items.filter((person) => person.username && new Date(person.createdAt).getTime() >= days[0]!).length : null;

  if (summary.error && !s) {
    return (
      <PageBody>
        <PageHeader title={`Hoş geldin, ${user?.nickname ?? ""}!`} />
        <Card>
          <Failed message={summary.error} onRetry={summary.reload} />
        </Card>
      </PageBody>
    );
  }

  const next = queue.data?.items[0] ?? null;

  return (
    <PageBody>
      <PageHeader
        title={`Hoş geldin, ${user?.nickname ?? ""}!`}
        hint={`${new Date().toLocaleDateString("tr-TR", { weekday: "long" })}, ${new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}`}
        actions={role === "admin" ? <Button label="Yeni eser ekle" kind="primary" onPress={() => router.push("/admin/assets/new")} /> : undefined}
      />

      <View style={[styles.row, { flexDirection: medium ? "row" : "column" }]}>
        <StatTile icon="hourglass-outline" label="Bekleyen not" value={pending} note={null} chart={submitted && <Bars days={days} values={submitted} />} onPress={() => router.push("/admin/review")} />
        <StatTile icon="person-add-outline" label="Bu hafta katılan" value={joined ? (users.data!.items.length === 100 && sum(joined) === 100 ? "100+" : sum(joined)) : null} note={joinedAccounts === null ? null : `${formatNumber(joinedAccounts)} kişi hesap açtı`} chart={joined && <Bars days={days} values={joined} />} onPress={() => router.push("/admin/users")} />
        <StatTile icon="checkmark-done-outline" label="İncelenen not" value={reviewedTotal} note={reviewedTotal === null ? null : `${formatNumber(approved.data!.total)} onay · ${formatNumber(rejected.data!.total)} ret`} chart={reviewed && <Capsules days={days} values={reviewed} />} onPress={() => router.push("/admin/review")} />
      </View>

      <View style={[styles.row, { flexDirection: wide ? "row" : "column", alignItems: wide ? "stretch" : undefined }]}>
        <View style={[styles.column, wide && { flex: 1 }]}>
          <Card style={{ gap: 14 }}>
            <View style={styles.titleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>En çok not alan eserler</Text>
                <Text color="textSecondary" style={styles.sub}>
                  Son onaylanan notlara göre
                </Text>
              </View>
              <Pressable accessibilityRole="link" onPress={() => router.push("/admin/ranking")} style={styles.more}>
                <Text color="textSecondary" style={{ fontSize: 13 }}>
                  Tümü
                </Text>
                <Ionicons name="chevron-forward" size={14} color={palette.gece400} aria-hidden />
              </Pressable>
            </View>
            {approved.loading && !approved.data ? <Loading /> : <TopAssets items={approved.data?.items ?? []} />}
          </Card>
          <Card style={{ gap: 12, flex: wide ? 1 : undefined }}>
            <Text style={styles.title}>Topluluk</Text>
            <View style={styles.legend}>
              <Legend tone="ink" label="Hesaplı" />
              <Legend tone="accent" label="Anonim" />
              {s && s.users.banned > 0 && (
                <Text color="textSecondary" style={{ fontSize: 12.5 }}>
                  · {formatNumber(s.users.banned)} engelli
                </Text>
              )}
            </View>
            {s ? <Ring accounts={s.users.accounts} total={s.users.total} /> : <Loading />}
          </Card>
        </View>

        <View style={[styles.column, wide && { flex: 1.35 }]}>
          <Card style={{ gap: 14 }}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Sıradaki not</Text>
              <Pressable accessibilityRole="link" onPress={() => router.push("/admin/review")} style={styles.more}>
                <Text color="textSecondary" style={{ fontSize: 13 }}>
                  Kuyruğa git
                </Text>
                <Ionicons name="chevron-forward" size={14} color={palette.gece400} aria-hidden />
              </Pressable>
            </View>
            {queue.loading && !queue.data ? (
              <Loading />
            ) : queue.error && !queue.data ? (
              <Failed message={queue.error} onRetry={queue.reload} />
            ) : !next ? (
              <Empty icon="checkmark-done-outline" title="Kuyruk boş" body="Yeni notlar geldikçe burada görünür." />
            ) : (
              <View style={[styles.nextRow, { flexDirection: medium ? "row" : "column" }]}>
                <NextUp item={next} onPress={() => router.push("/admin/review")} />
                <Timeline items={queue.data!.items.slice(1, 6)} />
              </View>
            )}
            {reviewedTotal !== null && queue.data && <Progress done={reviewedTotal} waiting={queue.data.total} />}
          </Card>
          {role === "admin" && <AssetsHero assets={assets.data} onNew={() => router.push("/admin/assets/new")} onOpen={() => router.push("/admin/assets")} />}
        </View>

        <View style={[styles.column, wide && { flex: 1 }]}>
          <Card padded={false} style={{ flex: wide ? 1 : undefined, paddingVertical: 20 }}>
            <View style={[styles.titleRow, { paddingHorizontal: 20, marginBottom: 6 }]}>
              <Text style={styles.title}>Yeni katılanlar</Text>
              <Pressable accessibilityRole="link" onPress={() => router.push("/admin/users")} style={styles.more}>
                <Text color="textSecondary" style={{ fontSize: 13 }}>
                  Tümü
                </Text>
                <Ionicons name="chevron-forward" size={14} color={palette.gece400} aria-hidden />
              </Pressable>
            </View>
            {users.loading && !users.data ? (
              <Loading />
            ) : users.error && !users.data ? (
              <Failed message={users.error} onRetry={users.reload} />
            ) : (
              users.data?.items.slice(0, 8).map((person) => <PersonRow key={person.id} person={person} />)
            )}
          </Card>
        </View>
      </View>
    </PageBody>
  );
}

/** The last `count` days, oldest first, as midnight timestamps. */
function lastDays(count: number): number[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => today.getTime() - (count - 1 - i) * 86_400_000);
}

function perDay(days: number[], dates: string[]): number[] {
  const counts = days.map(() => 0);
  for (const iso of dates) {
    const time = new Date(iso).getTime();
    const i = days.findIndex((day) => time >= day && time < day + 86_400_000);
    if (i >= 0) counts[i]! += 1;
  }
  return counts;
}

const sum = (values: number[]) => values.reduce((total, n) => total + n, 0);

const dayLabel = (day: number) => new Date(day).toLocaleDateString("tr-TR", { weekday: "short" }).slice(0, 2);

function StatTile({ icon, label, value, note, chart, onPress }: { icon: IconName; label: string; value: number | string | null; note: string | null; chart: React.ReactNode; onPress: () => void }) {
  const a = useAdminColors();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label}: ${value ?? "yükleniyor"}`}
      onPress={onPress}
      style={(state) => [styles.stat, { backgroundColor: (state as { hovered?: boolean }).hovered ? (a.dark ? palette.gece800 : "#ECEEF2") : a.card }]}
    >
      <View style={{ flex: 1, gap: 14, minWidth: 0 }}>
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
        <View style={styles.statValueRow}>
          <View style={[styles.statIcon, { backgroundColor: a.ink }]}>
            <Ionicons name={icon} size={18} color={a.onInk} aria-hidden />
          </View>
          <Text style={styles.statValue}>{value === null ? "–" : typeof value === "number" ? formatNumber(value) : value}</Text>
        </View>
        <Text color="textSecondary" style={styles.statNote} numberOfLines={1}>
          {note ?? " "}
        </Text>
      </View>
      <View style={{ alignSelf: "flex-end" }}>{chart}</View>
    </Pressable>
  );
}

/** A week as small bars; today's is full gold, the rest soft. */
function Bars({ days, values }: { days: number[]; values: number[] }) {
  const a = useAdminColors();
  const top = Math.max(1, ...values);
  return (
    <View style={styles.chart}>
      {values.map((value, i) => (
        <View key={days[i]} style={styles.chartCol}>
          <View style={styles.chartTrack}>
            <View style={{ height: `${Math.max(8, (value / top) * 100)}%`, borderRadius: 4, backgroundColor: i === values.length - 1 ? a.accent : a.dark ? "rgba(221,181,92,0.28)" : "rgba(221,181,92,0.38)" }} />
          </View>
          <Text color="textSecondary" style={styles.chartLabel}>
            {dayLabel(days[i]!)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A week as thin capsules, each filled up to its share. */
function Capsules({ days, values }: { days: number[]; values: number[] }) {
  const a = useAdminColors();
  const top = Math.max(1, ...values);
  return (
    <View style={styles.chart}>
      {values.map((value, i) => (
        <View key={days[i]} style={styles.chartCol}>
          <View style={[styles.chartTrack, styles.capsule, { backgroundColor: a.dark ? palette.gece800 : palette.gece100 }]}>
            <View style={{ height: `${value === 0 ? 0 : Math.max(18, (value / top) * 100)}%`, borderRadius: 3, backgroundColor: i === values.length - 1 ? a.accent : a.ink }} />
          </View>
          <Text color="textSecondary" style={styles.chartLabel}>
            {dayLabel(days[i]!)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The assets with the most approved notes, each with a bar against the first. */
function TopAssets({ items }: { items: ModerationItem[] }) {
  const a = useAdminColors();
  const counts = new Map<string, { name: string; count: number }>();
  for (const item of items) {
    const entry = counts.get(item.asset.id) ?? { name: item.asset.name, count: 0 };
    entry.count += 1;
    counts.set(item.asset.id, entry);
  }
  const top = [...counts.values()].sort((x, y) => y.count - x.count).slice(0, 4);
  if (top.length === 0) {
    return (
      <Text color="textSecondary" style={{ fontSize: 13 }}>
        Henüz onaylanan not yok.
      </Text>
    );
  }
  const most = top[0]!.count;
  return (
    <View style={{ gap: 12 }}>
      {top.map((entry, i) => (
        <View key={entry.name} style={{ gap: 6 }}>
          <View style={styles.titleRow}>
            <Text style={styles.assetName} numberOfLines={1}>
              {entry.name}
            </Text>
            <Text color="textSecondary" style={styles.assetCount}>
              {formatNumber(entry.count)} not
            </Text>
          </View>
          <View style={[styles.assetTrack, { backgroundColor: a.well }]}>
            <View style={{ width: `${(entry.count / most) * 100}%`, height: "100%", borderRadius: 4, backgroundColor: i === 0 ? a.accent : a.ink }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function Legend({ tone, label }: { tone: "ink" | "accent"; label: string }) {
  const a = useAdminColors();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: tone === "ink" ? a.ink : a.accent }]} />
      <Text color="textSecondary" style={{ fontSize: 12.5 }}>
        {label}
      </Text>
    </View>
  );
}

/** Accounts against anonymous visitors, as a ring of short ticks with the total in the middle. */
function Ring({ accounts, total }: { accounts: number; total: number }) {
  const a = useAdminColors();
  const size = 210;
  const ticks = 60;
  const center = size / 2;
  const share = total ? accounts / total : 0;
  const inked = Math.round(share * ticks);
  return (
    <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 4 }}>
      <Svg width={size} height={size} aria-hidden>
        <G>
          {Array.from({ length: ticks }, (_, i) => (
            <Rect
              key={i}
              x={center - 3.5}
              y={6}
              width={7}
              height={22}
              rx={3}
              fill={i < inked ? a.ink : a.accent}
              opacity={i < inked ? 1 : 0.85}
              transform={`rotate(${(i / ticks) * 360} ${center} ${center})`}
            />
          ))}
        </G>
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={styles.ringValue}>{formatNumber(total)}</Text>
        <Text color="textSecondary" style={{ fontSize: 13 }}>
          kullanıcı · %{Math.round(share * 100)} hesaplı
        </Text>
      </View>
    </View>
  );
}

/** The oldest pending contribution, on a soft gold panel. */
function NextUp({ item, onPress }: { item: ModerationItem; onPress: () => void }) {
  const kind = KIND[item.kind];
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`Sıradaki: ${item.asset.name}`} onPress={onPress} style={styles.next}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" aria-hidden>
        <Defs>
          <LinearGradient id="next" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.altin300} />
            <Stop offset="1" stopColor={palette.altin200} stopOpacity={0.7} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#next)" />
      </Svg>
      <View style={styles.nextTop}>
        <Text colorValue={palette.gece950} style={styles.nextKind}>
          {kind.label.toLocaleUpperCase("tr")}
        </Text>
        <Ionicons name="chatbubble-ellipses-outline" size={18} color={palette.gece950} aria-hidden />
      </View>
      <View style={{ gap: 6 }}>
        <Text colorValue={palette.gece950} style={styles.nextAsset} numberOfLines={2}>
          {item.asset.name}
        </Text>
        <Text colorValue={palette.gece900} style={styles.nextBody} numberOfLines={3}>
          “{item.body}”
        </Text>
      </View>
      <View style={styles.nextFoot}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text colorValue={palette.gece900} style={styles.nextFootLabel}>
            Yazan
          </Text>
          <Text colorValue={palette.gece950} style={styles.nextFootValue} numberOfLines={1}>
            {item.author.nickname}
          </Text>
        </View>
        <Ionicons name="arrow-forward" size={16} color={palette.gece950} aria-hidden />
        <View style={{ flex: 1, minWidth: 0, alignItems: "flex-end" }}>
          <Text colorValue={palette.gece900} style={styles.nextFootLabel}>
            Gönderildi
          </Text>
          <Text colorValue={palette.gece950} style={styles.nextFootValue} numberOfLines={1}>
            {timeAgo(item.createdAt)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/** The next few in the queue, as a list with a dot each; the first is marked. */
function Timeline({ items }: { items: ModerationItem[] }) {
  const a = useAdminColors();
  return (
    <View style={[styles.timeline, { backgroundColor: a.well }]}>
      <Text style={styles.timelineTitle}>Sonra gelenler</Text>
      {items.length === 0 && (
        <Text color="textSecondary" style={{ fontSize: 13 }}>
          Sırada başka not yok.
        </Text>
      )}
      {items.map((item, i) => (
        <View key={item.id} style={styles.timelineRow}>
          <View style={[styles.timelineDot, { borderColor: a.goldMark, backgroundColor: i === 0 ? a.goldMark : "transparent" }]} />
          <Text colorValue={a.text} style={styles.timelineText} numberOfLines={1}>
            {item.asset.name}
          </Text>
          <Text color="textSecondary" style={styles.timelineTime}>
            {timeAgo(item.createdAt)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** How much of everything sent in has been reviewed, as a pill with a small ring. */
function Progress({ done, waiting }: { done: number; waiting: number }) {
  const a = useAdminColors();
  const share = done + waiting ? done / (done + waiting) : 1;
  const r = 9;
  const length = 2 * Math.PI * r;
  return (
    <View style={[styles.progress, { backgroundColor: a.well }]}>
      <Svg width={24} height={24} aria-hidden>
        <Circle cx={12} cy={12} r={r} stroke={a.line} strokeWidth={3} fill="none" />
        <Circle cx={12} cy={12} r={r} stroke={a.goldMark} strokeWidth={3} fill="none" strokeDasharray={`${length * share} ${length}`} strokeLinecap="round" transform="rotate(-90 12 12)" />
      </Svg>
      <Text style={styles.progressText}>İnceleme oranı %{Math.round(share * 100)}</Text>
    </View>
  );
}

/** The panel's own assets on navy with a gold glow: how many are out and how many wait as drafts. */
function AssetsHero({ assets, onNew, onOpen }: { assets: Array<{ status: string; origin: string }> | null; onNew: () => void; onOpen: () => void }) {
  const own = assets?.filter((asset) => asset.origin === "panel") ?? null;
  const published = own?.filter((asset) => asset.status === "published").length ?? null;
  const drafts = own ? own.length - published! : null;
  return (
    <View style={styles.hero}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" aria-hidden>
        <Defs>
          <RadialGradient id="assets-glow" cx="100%" cy="100%" r="90%">
            <Stop offset="0" stopColor={palette.altin300} stopOpacity={0.42} />
            <Stop offset="0.6" stopColor={palette.altin300} stopOpacity={0.05} />
            <Stop offset="1" stopColor={palette.altin300} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={palette.gece950} />
        <Rect width="100%" height="100%" fill="url(#assets-glow)" />
      </Svg>
      <View style={styles.heroTop}>
        <View style={{ flex: 1 }}>
          <Text colorValue={palette.gece50} style={styles.heroTitle}>
            Panel eserleri
          </Text>
          <Text colorValue={palette.gece400} style={{ fontSize: 13 }}>
            Panelden eklenen eserler
          </Text>
        </View>
        <Pressable accessibilityRole="link" accessibilityLabel="Eserlere git" onPress={onOpen} style={styles.heroRound}>
          <Ionicons name="arrow-forward" size={17} color={palette.gece50} aria-hidden />
        </Pressable>
      </View>
      <View style={styles.heroBottom}>
        <View style={styles.heroBoxes}>
          <HeroBox value={published} label="Yayında" />
          <HeroBox value={drafts} label="Taslak" />
        </View>
        <Pressable accessibilityRole="button" onPress={onNew} style={(state) => [styles.heroButton, (state as { hovered?: boolean }).hovered && { backgroundColor: palette.altin200 }]}>
          <Ionicons name="add" size={17} color={palette.gece950} aria-hidden />
          <Text colorValue={palette.gece950} style={styles.heroButtonText}>
            Yeni eser
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function HeroBox({ value, label }: { value: number | null; label: string }) {
  return (
    <View style={styles.heroBox}>
      <Text colorValue={palette.gece50} style={styles.heroBoxValue}>
        {value === null ? "–" : formatNumber(value)}
      </Text>
      <Text colorValue={palette.gece400} style={{ fontSize: 12 }}>
        {label}
      </Text>
    </View>
  );
}

function PersonRow({ person }: { person: AdminUser }) {
  const role = ROLE[person.role];
  return (
    <View style={[styles.person, { paddingHorizontal: 20, paddingVertical: 10 }]}>
      <Avatar name={person.nickname} size={38} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.personName} numberOfLines={1}>
          {person.nickname}
        </Text>
        <Text color="textSecondary" style={styles.personSub} numberOfLines={1}>
          {timeAgo(person.createdAt)}
        </Text>
      </View>
      <View>{person.bannedAt ? <Badge tone="red" label="Engelli" /> : <Badge tone={role.tone} label={role.label} />}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 16, marginBottom: 16 },
  column: { gap: 16, minWidth: 0 },
  title: { fontFamily: fontFamily.sansSemiBold, fontSize: 17, lineHeight: 24, letterSpacing: -0.3 },
  sub: { fontSize: 12.5, marginTop: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  more: { flexDirection: "row", alignItems: "center", gap: 2, padding: 4 },
  stat: { flex: 1, minWidth: 0, flexDirection: "row", gap: 12, borderRadius: 24, padding: 20 },
  statLabel: { fontFamily: fontFamily.sansMedium, fontSize: 15 },
  statValueRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  statIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  statValue: { fontFamily: fontFamily.sansMedium, fontSize: 34, lineHeight: 40, letterSpacing: -1, fontVariant: ["tabular-nums"] },
  statNote: { fontSize: 12.5 },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 5 },
  chartCol: { alignItems: "center", gap: 5 },
  chartTrack: { width: 14, height: 62, justifyContent: "flex-end" },
  capsule: { width: 8, borderRadius: 4, overflow: "hidden" },
  chartLabel: { fontSize: 9.5, fontFamily: fontFamily.sansMedium },
  assetName: { flex: 1, fontFamily: fontFamily.sansMedium, fontSize: 13.5 },
  assetCount: { fontSize: 12.5, fontFamily: fontFamily.sansMedium },
  assetTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  person: { flexDirection: "row", alignItems: "center", gap: 12 },
  personName: { fontFamily: fontFamily.sansSemiBold, fontSize: 14 },
  personSub: { fontSize: 12.5 },
  legend: { flexDirection: "row", gap: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  ringValue: { fontFamily: fontFamily.sansMedium, fontSize: 40, lineHeight: 46, letterSpacing: -1.2, fontVariant: ["tabular-nums"] },
  nextRow: { gap: 12 },
  next: { flex: 1, minHeight: 230, borderRadius: 20, overflow: "hidden", padding: 18, justifyContent: "space-between", gap: 14 },
  nextTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  nextKind: { fontFamily: fontFamily.sansBold, fontSize: 12, letterSpacing: 1.2 },
  nextAsset: { fontFamily: fontFamily.sansSemiBold, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 },
  nextBody: { fontSize: 13.5, lineHeight: 19 },
  nextFoot: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 10, backgroundColor: "rgba(255,255,255,0.35)" },
  nextFootLabel: { fontSize: 11 },
  nextFootValue: { fontFamily: fontFamily.sansSemiBold, fontSize: 13 },
  timeline: { flex: 1, borderRadius: 20, padding: 16, gap: 14 },
  timelineTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 15, marginBottom: 2 },
  timelineRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  timelineText: { flex: 1, fontSize: 13 },
  timelineTime: { fontSize: 11.5, fontFamily: fontFamily.sansMedium },
  progress: { flexDirection: "row", alignItems: "center", gap: 10, height: 48, borderRadius: 999, paddingHorizontal: 14 },
  progressText: { fontFamily: fontFamily.sansSemiBold, fontSize: 14 },
  hero: { borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: "rgba(221,181,92,0.16)", padding: 22, minHeight: 210, justifyContent: "space-between", gap: 20, flex: 1 },
  heroTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  heroTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  heroRound: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  heroBottom: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  heroBoxes: { flexDirection: "row", gap: 8 },
  heroBox: { minWidth: 92, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  heroBoxValue: { fontFamily: fontFamily.sansSemiBold, fontSize: 22, fontVariant: ["tabular-nums"] },
  heroButton: { flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: 18, borderRadius: 999, backgroundColor: palette.altin300 },
  heroButtonText: { fontFamily: fontFamily.sansBold, fontSize: 14 },
});
