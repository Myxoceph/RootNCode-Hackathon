import Ionicons from "@expo/vector-icons/Ionicons";
import type {
  Redemption,
  Reward,
  RewardKind,
  WalletResponse,
  Lang,
} from "@vagabonds/contracts";
import {
  Button,
  fontFamily,
  palette,
  radius,
  spacing,
  Text,
  useTheme,
} from "@vagabonds/ui";
import { useRouter } from "expo-router";
import Head from "expo-router/head";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
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
  LinearGradient,
  Rect,
  Stop,
} from "react-native-svg";

import {
  DataError,
  redeemReward,
  useCommunity,
  useRewards,
  useWallet,
} from "@/data";
import { announce } from "@/lib/announce";
import { bottomInset } from "@/lib/bottom-inset";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import {
  useWideWeb,
  WIDE_PAGE,
  WIDE_PAGE_PADDING,
  wideColumn,
} from "@/lib/use-wide-web";
import { localeTag, useLang, useMessages } from "@/i18n";

type IconName = ComponentProps<typeof Ionicons>["name"];
type Filter = RewardKind | "all";

/** Each kind's icon and hue: the hue's light-theme shade for text and icons, the dark one on dark. */
const KINDS: Record<
  RewardKind,
  { icon: IconName; light: string; dark: string }
> = {
  merch: {
    icon: "bag-handle-outline",
    light: palette.altin700,
    dark: palette.altin300,
  },
  museum: {
    icon: "business-outline",
    light: palette.kobalt700,
    dark: palette.kobalt300,
  },
  discount: {
    icon: "pricetag-outline",
    light: palette.gulkurusu700,
    dark: palette.gulkurusu300,
  },
  experience: {
    icon: "sparkles-outline",
    light: palette.mercan700,
    dark: palette.mercan300,
  },
};

/** What stands between the visitor and a reward, if anything. */
function blocker(
  reward: Reward,
  wallet: WalletResponse | null,
): { kind: "stock" | "visits" | "points" | null; needed: number } {
  if (reward.stock === 0) return { kind: "stock", needed: 0 };
  const balance = wallet?.balance ?? 0;
  const proven = wallet?.provenVisits ?? 0;
  if (proven < reward.minProvenVisits)
    return { kind: "visits", needed: reward.minProvenVisits - proven };
  if (balance < reward.costPoints)
    return { kind: "points", needed: reward.costPoints - balance };
  return { kind: null, needed: 0 };
}

const dateOf = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleDateString(localeTag(lang), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/**
 * Profil · Ödüllerim: the points earned with badges, spent on rewards from partner institutions.
 * The Gezgin Kartı holds the balance; the catalog shows what each reward asks and how near it
 * is; the codes taken are tickets to show at the branch, museum or café (docs/rewards.md).
 */
export default function MyRewardsScreen() {
  const m = useMessages();
  const w = m.rewards;
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWideWeb();
  const { user } = useCommunity();
  const [version, setVersion] = useState(0);
  const wallet = useWallet(version);
  const rewards = useRewards();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Reward | null>(null);
  const [ticket, setTicket] = useState<Redemption | null>(null);

  const walletData = wallet.status === "success" ? wallet.data : null;
  const items = useMemo(
    () => (rewards.status === "success" ? (rewards.data ?? []) : []),
    [rewards],
  );
  const kinds = useMemo(
    () =>
      (Object.keys(KINDS) as RewardKind[]).filter((kind) =>
        items.some((item) => item.kind === kind),
      ),
    [items],
  );
  const shown =
    filter === "all" ? items : items.filter((item) => item.kind === filter);
  const account = Boolean(user?.username);

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[
        styles.content,
        wide && wideColumn,
        { paddingBottom: bottomInset(insets.bottom) + spacing.xl },
      ]}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Head>
        <title>{m.common.title(m.screens.rewards)}</title>
      </Head>

      <WalletCard
        wallet={walletData}
        holder={user?.nickname ?? null}
        createdAt={user?.username ? user.createdAt : null}
      />
      {user !== undefined && !account && <AccountNote />}
      {items.length > 0 && (
        <Featured items={items} wallet={walletData} onOpen={setOpen} />
      )}

      {rewards.status === "loading" && (
        <ActivityIndicator
          color={c.textSecondary}
          accessibilityLabel={w.loading}
        />
      )}
      {rewards.status === "error" && (
        <Pressable
          accessibilityRole="button"
          onPress={rewards.retry}
          style={styles.error}
        >
          <Text variant="caption" color="textSecondary" style={styles.centered}>
            {`${rewards.error.message} ${m.common.tapToRetry}`}
          </Text>
        </Pressable>
      )}
      {rewards.status === "success" && rewards.data === null && (
        <Text color="textSecondary" style={styles.centered}>
          {w.needsServer}
        </Text>
      )}

      {items.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text variant="heading" headingLevel={2}>
              {w.title}
            </Text>
          </View>
          {kinds.length > 1 && (
            <Kinds value={filter} onChange={setFilter} kinds={kinds} />
          )}
          <View accessibilityRole="list" style={styles.grid}>
            {shown.map((reward, i) => (
              <RewardCard
                key={reward.code}
                reward={reward}
                wallet={walletData}
                index={i}
                onOpen={setOpen}
              />
            ))}
          </View>
        </View>
      )}

      {walletData && walletData.redemptions.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text variant="heading" headingLevel={2}>
              {w.codes}
            </Text>
          </View>
          <View style={styles.tickets}>
            {walletData.redemptions.map((redemption) => (
              <Ticket
                key={redemption.id}
                redemption={redemption}
                onOpen={setTicket}
              />
            ))}
          </View>
        </View>
      )}

      <RewardSheet
        reward={open}
        wallet={walletData}
        account={account}
        onClose={() => setOpen(null)}
        onRedeemed={(redemption) => {
          setVersion((v) => v + 1);
          rewards.retry();
          setOpen(null);
          setTicket(redemption);
        }}
      />
      <CodeSheet redemption={ticket} onClose={() => setTicket(null)} />
    </ScrollView>
  );
}

/** The Gezgin Kartı: the balance to spend, what was earned and spent, and the proven visits. */
/** "11/26": the month the account was opened, where a bank card has its expiry. */
function memberSince(createdAt: string | null): string | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getFullYear()).slice(2)}`;
}

/** The night of the reward tiles. */
const HERO_BG = "#0A1126";

/** Vakıf Katılım's VKart, whose rewards these are. */
const VK_CARD = require("../../../assets/images/rewards/vk-kart.jpg") as number;
/** A bank card's own proportions (85.6 × 54 mm); the picture (1200×692) came a little flattened, so it is stretched to them. */
const VK_CARD_RATIO = 85.6 / 54;

/**
 * The Gezgin Kartı is Vakıf Katılım's VKart: their card as it is, with the holder, the month they
 * joined and the spendable points written on its empty lower band. A light sweeps across it when the
 * page opens and again at a touch; under it, what was earned, spent and sealed.
 */
function WalletCard({
  wallet,
  holder,
  createdAt,
}: {
  wallet: WalletResponse | null;
  holder: string | null;
  createdAt: string | null;
}) {
  const lang = useLang();
  const w = useMessages().rewards;
  const reduced = useReducedMotion();
  const shineId = useSvgKey("shine");
  const balance = wallet?.balance ?? 0;
  const since = memberSince(createdAt);
  const [width, setWidth] = useState(0);
  const shine = useRef(new Animated.Value(0)).current;
  const sweep = () => {
    if (reduced) return;
    shine.setValue(0);
    Animated.timing(shine, {
      toValue: 1,
      duration: 1100,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };
  const wide = useWideWeb();
  const { colors: c, scheme } = useTheme();
  const measured = width > 0;
  useEffect(() => {
    // Once the card has its width; a touch replays it.
    if (measured) sweep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured]);
  return (
    <View style={[styles.walletBlock, wide && styles.walletBlockWide]}>
      <View style={wide ? styles.walletCardWide : undefined}>
        <Pressable
          onPress={sweep}
          style={({ pressed }) => [
            styles.wallet,
            pressed && !reduced && styles.walletPressed,
          ]}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          accessible
          accessibilityRole="image"
          accessibilityLabel={w.vkartLabel(holder, balance)}
        >
          <Image
            source={VK_CARD}
            style={styles.walletImage}
            resizeMode="stretch"
            aria-hidden
          />
          {measured && !reduced && (
            <Animated.View
              pointerEvents="none"
              aria-hidden
              style={[
                styles.shine,
                {
                  width: width * 0.35,
                  transform: [
                    {
                      translateX: shine.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-width * 0.6, width * 1.25],
                      }),
                    },
                    { rotate: "18deg" },
                  ],
                },
              ]}
            >
              <Svg width="100%" height="100%">
                <Defs>
                  <LinearGradient id={shineId} x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
                    <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.32} />
                    <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
                  </LinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill={`url(#${shineId})`} />
              </Svg>
            </Animated.View>
          )}
          <View style={styles.walletBottom}>
            <View style={styles.holderBlock}>
              {since && (
                <Text colorValue="rgba(255,255,255,0.8)" style={styles.since}>
                  {w.memberSince(since)}
                </Text>
              )}
              <Text
                colorValue="#FFFFFF"
                style={styles.holder}
                numberOfLines={1}
              >
                {(holder ?? w.traveller).toLocaleUpperCase(lang)}
              </Text>
            </View>
            <View style={styles.balanceBlock}>
              <Text colorValue="#FFFFFF" style={styles.balance}>
                {balance.toLocaleString(localeTag(lang))}
              </Text>
              <Text colorValue="#FFFFFF" style={styles.balanceUnit}>
                {w.points}
              </Text>
            </View>
          </View>
        </Pressable>
      </View>

      {wide ? (
        <View style={styles.summary}>
          <Text
            colorValue={scheme === "dark" ? palette.altin300 : palette.altin700}
            style={styles.summaryOverline}
          >
            {w.cardHead}
          </Text>
          <View style={styles.summaryBalance}>
            <Text colorValue={c.text} style={styles.summaryValue}>
              {balance.toLocaleString(localeTag(lang))}
            </Text>
            <Text colorValue={c.textSecondary} style={styles.summaryUnit}>
              {w.pointsToSpend}
            </Text>
          </View>
          <View style={[styles.summaryRows, { borderColor: c.border }]}>
            {[
              { label: w.earnedRow, value: wallet?.earned ?? 0 },
              { label: w.spentRow, value: wallet?.spent ?? 0 },
            ].map((row, i) => (
              <View
                key={row.label}
                style={[
                  styles.summaryRow,
                  i > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderColor: c.border,
                  },
                ]}
                accessible
                accessibilityLabel={`${row.label}: ${row.value}`}
              >
                <Text
                  colorValue={c.textSecondary}
                  style={styles.summaryRowLabel}
                >
                  {row.label}
                </Text>
                <Text colorValue={c.text} style={styles.summaryRowValue}>
                  {row.value.toLocaleString(localeTag(lang))}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View
          style={styles.walletStats}
          accessible
          accessibilityLabel={w.statsLabel(wallet?.earned ?? 0, wallet?.spent ?? 0)}
        >
          <WalletStat value={wallet?.earned ?? 0} label={w.earned} />
          <WalletStat value={wallet?.spent ?? 0} label={w.spent} />
        </View>
      )}
    </View>
  );
}

/** One figure under the card, as a small pill. */
function WalletStat({ value, label }: { value: number; label: string }) {
  const lang = useLang();
  const { colors: c } = useTheme();
  return (
    <View
      style={[
        styles.walletStat,
        { backgroundColor: c.surface, borderColor: c.border },
      ]}
    >
      <Text colorValue={c.text} style={styles.walletStatValue}>
        {value.toLocaleString(localeTag(lang))}
      </Text>
      <Text colorValue={c.textSecondary} style={styles.walletStatLabel}>
        {label}
      </Text>
    </View>
  );
}

/** An SVG id of its own: on the web an earlier page stays in the document, hidden, with the same ids. */
function useSvgKey(name: string): string {
  return `${name}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/** The rewards nearest to hand: those ready first, then by how much of the way is done. */
function nearest(items: Reward[], wallet: WalletResponse | null): Reward[] {
  const balance = wallet?.balance ?? 0;
  return items
    .filter((r) => r.stock !== 0 && blocker(r, wallet).kind !== "visits")
    .sort((x, y) => {
      const rx = blocker(x, wallet).kind === null ? 1 : 0;
      const ry = blocker(y, wallet).kind === null ? 1 : 0;
      if (rx !== ry) return ry - rx;
      return balance / y.costPoints - balance / x.costPoints;
    })
    .slice(0, 5);
}

/** Hedefine yakın: the nearest rewards as large night tiles that slide sideways. */
function Featured({
  items,
  wallet,
  onOpen,
}: {
  items: Reward[];
  wallet: WalletResponse | null;
  onOpen: (reward: Reward) => void;
}) {
  const w = useMessages().rewards;
  const { width: screen } = useWindowDimensions();
  const wide = useWideWeb();
  const picks = nearest(items, wallet).slice(0, wide ? 3 : 5);
  if (picks.length === 0) return null;
  const column = Math.min(screen, WIDE_PAGE) - WIDE_PAGE_PADDING * 2;
  const tile = wide
    ? Math.floor((column - spacing.md * 2) / 3)
    : Math.min(300, Math.round(screen * 0.72));
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text variant="heading" headingLevel={2}>
          {w.nearGoal}
        </Text>
      </View>
      <ScrollView
        horizontal
        scrollEnabled={!wide}
        showsHorizontalScrollIndicator={false}
        snapToInterval={tile + spacing.md}
        decelerationRate="fast"
        style={!wide && styles.featuredScroller}
        contentContainerStyle={[styles.featured, wide && styles.featuredWide]}
        accessibilityRole="list"
      >
        {picks.map((reward, i) => (
          <FeaturedTile
            key={reward.code}
            reward={reward}
            wallet={wallet}
            width={tile}
            index={i}
            onOpen={onOpen}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function FeaturedTile({
  reward,
  wallet,
  width,
  index,
  onOpen,
}: {
  reward: Reward;
  wallet: WalletResponse | null;
  width: number;
  index: number;
  onOpen: (reward: Reward) => void;
}) {
  const lang = useLang();
  const w = useMessages().rewards;
  const reduced = useReducedMotion();
  const tileId = useSvgKey("tile");
  const enter = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const look = KINDS[reward.kind];
  const block = blocker(reward, wallet);
  const balance = wallet?.balance ?? 0;
  const share = Math.min(1, balance / reward.costPoints);
  const ready = block.kind === null;
  const height = 196;

  useEffect(() => {
    if (reduced) return;
    Animated.spring(enter, {
      toValue: 1,
      delay: 120 + index * 90,
      friction: 8,
      tension: 60,
      useNativeDriver: true,
    }).start();
  }, [enter, index, reduced]);

  return (
    <Animated.View
      role="listitem"
      style={{
        opacity: enter,
        transform: [
          {
            translateX: enter.interpolate({
              inputRange: [0, 1],
              outputRange: [40, 0],
            }),
          },
        ],
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={w.tileLabel(reward.title, reward.partner, reward.costPoints, ready ? w.available : w.pointsMore(block.needed))}
        accessibilityHint={w.opensReward}
        onPress={() => onOpen(reward)}
        style={({ pressed }) => [
          styles.tile,
          { width, height },
          pressed && styles.tilePressed,
        ]}
      >
        <Svg
          width={width}
          height={height}
          style={StyleSheet.absoluteFill}
          aria-hidden
        >
          <Defs>
            <LinearGradient id={tileId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={look.light} stopOpacity={0.95} />
              <Stop offset="1" stopColor={HERO_BG} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect width={width} height={height} fill={HERO_BG} />
          <Rect width={width} height={height} fill={`url(#${tileId})`} />
        </Svg>
        <Ionicons
          name={look.icon.replace("-outline", "") as IconName}
          size={150}
          color="#FFFFFF"
          style={styles.tileMark}
          aria-hidden
        />

        <View style={styles.tileTop}>
          <Text colorValue="rgba(255,255,255,0.72)" style={styles.tileKind}>
            {w.kinds[reward.kind].toLocaleUpperCase(lang)}
          </Text>
          {ready && (
            <View style={styles.tileReady}>
              <Text colorValue={palette.gece950} style={styles.tileReadyText}>
                {w.canRedeem}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.tileBottom}>
          <Text colorValue="#FFFFFF" style={styles.tileTitle} numberOfLines={2}>
            {reward.title}
          </Text>
          <Text
            colorValue="rgba(255,255,255,0.72)"
            style={styles.tilePartner}
            numberOfLines={1}
          >
            {reward.partner}
          </Text>
          <View style={styles.tileFoot}>
            <Text colorValue={palette.altin200} style={styles.tileCost}>
              {`✦ ${reward.costPoints}`}
            </Text>
            {!ready && (
              <View style={styles.tileTrack} aria-hidden>
                <View style={[styles.tileFill, { width: `${share * 100}%` }]} />
              </View>
            )}
            {!ready && (
              <Text colorValue="rgba(255,255,255,0.72)" style={styles.tileLeft}>
                {w.left(block.needed)}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** An anonymous visitor earns points but cannot take codes; an account keeps the points. */
function AccountNote() {
  const { colors: c } = useTheme();
  const w = useMessages().rewards;
  const router = useRouter();
  return (
    <View
      style={[
        styles.note,
        { backgroundColor: c.surface, borderColor: c.border },
      ]}
    >
      <Ionicons name="person-add-outline" size={20} color={c.primary} />
      <Text variant="caption" style={styles.flex}>
        {w.accountNote}
      </Text>
      <Button
        label={w.openAccount}
        variant="ghost"
        onPress={() =>
          router.push({ pathname: "/auth", params: { mode: "register" } })
        }
      />
    </View>
  );
}

/** Tümü and each kind on offer, as tabs over the catalog. */
function Kinds({
  value,
  onChange,
  kinds,
}: {
  value: Filter;
  onChange: (filter: Filter) => void;
  kinds: RewardKind[];
}) {
  const { colors: c } = useTheme();
  const w = useMessages().rewards;
  const options: Array<{ key: Filter; label: string }> = [
    { key: "all", label: w.all },
    ...kinds.map((kind) => ({ key: kind, label: w.kinds[kind] })),
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.kinds}
      accessibilityRole="tablist"
    >
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            // react-native-web does not carry accessibilityState.
            {...(Platform.OS === "web" ? { "aria-selected": selected } : null)}
            onPress={() => onChange(option.key)}
            style={({ pressed }) => [
              styles.kind,
              {
                borderColor: selected ? c.text : c.border,
                backgroundColor: selected ? c.text : c.surface,
              },
              pressed && styles.pressed,
            ]}
          >
            {option.key !== "all" && (
              <Ionicons
                name={KINDS[option.key].icon}
                size={15}
                color={selected ? c.background : c.textSecondary}
              />
            )}
            <Text
              variant="label"
              colorValue={selected ? c.background : c.text}
              style={styles.kindText}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** A reward: its kind's picture, name, partner and cost, and how near it is. Fades up in turn. */
function RewardCard({
  reward,
  wallet,
  index,
  onOpen,
}: {
  reward: Reward;
  wallet: WalletResponse | null;
  index: number;
  onOpen: (reward: Reward) => void;
}) {
  const wideCell = useWideWeb();
  const w = useMessages().rewards;
  const { colors: c, scheme } = useTheme();
  const reduced = useReducedMotion();
  const enter = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const look = KINDS[reward.kind];
  const hue = scheme === "dark" ? look.dark : look.light;
  const block = blocker(reward, wallet);
  const share = Math.min(1, (wallet?.balance ?? 0) / reward.costPoints);

  useEffect(() => {
    if (reduced) {
      enter.setValue(1);
      return;
    }
    Animated.timing(enter, {
      toValue: 1,
      duration: 320,
      delay: Math.min(index, 10) * 45,
      useNativeDriver: true,
    }).start();
  }, [enter, index, reduced]);

  const state =
    block.kind === "stock"
      ? w.soldOutState
      : block.kind === "visits"
        ? w.visitsNeeded(block.needed)
        : block.kind === "points"
          ? w.pointsNeeded(block.needed)
          : w.available;

  return (
    <Animated.View
      role="listitem"
      style={[
        styles.cardCell,
        wideCell && styles.cardCellWide,
        {
          opacity: enter,
          transform: [
            {
              translateY: enter.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={w.cardLabel(reward.title, reward.partner, reward.costPoints, state, reward.sample)}
        accessibilityHint={w.opensReward}
        onPress={() => onOpen(reward)}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: c.surface, borderColor: c.border },
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.cardArt, { backgroundColor: `${hue}1A` }]}>
          <Svg
            width="100%"
            height="100%"
            style={StyleSheet.absoluteFill}
            aria-hidden
          >
            <Circle cx="82%" cy="18%" r={46} fill={hue} fillOpacity={0.08} />
            <Circle cx="12%" cy="100%" r={34} fill={hue} fillOpacity={0.08} />
          </Svg>
          <View
            style={[
              styles.cardIcon,
              { backgroundColor: c.surface, borderColor: `${hue}55` },
            ]}
          >
            <Ionicons name={look.icon} size={26} color={hue} />
          </View>
          {reward.sample && (
            <View style={[styles.tag, { backgroundColor: c.surface }]}>
              <Text colorValue={c.textSecondary} style={styles.tagText}>
                {w.sample}
              </Text>
            </View>
          )}
          {reward.stock === 0 && (
            <View
              style={[styles.tag, styles.tagRight, { backgroundColor: c.text }]}
            >
              <Text colorValue={c.background} style={styles.tagText}>
                {w.soldOut}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <Text
            variant="caption"
            color="textSecondary"
            numberOfLines={1}
            style={styles.partner}
          >
            {reward.partner}
          </Text>
          <Text variant="label" numberOfLines={2} style={styles.cardTitle}>
            {reward.title}
          </Text>
          <View style={styles.costRow}>
            <Text
              color="highlight"
              style={styles.cost}
            >{`✦ ${reward.costPoints}`}</Text>
            <Text variant="caption" color="textSecondary">
              {w.points}
            </Text>
          </View>

          {block.kind === null && (
            <View
              style={[
                styles.ready,
                {
                  backgroundColor: `${scheme === "dark" ? palette.gulkurusu300 : palette.gulkurusu700}1F`,
                },
              ]}
            >
              <Ionicons name="checkmark-circle" size={14} color={c.success} />
              <Text colorValue={c.success} style={styles.readyText}>
                {w.canRedeem}
              </Text>
            </View>
          )}
          {block.kind === "points" && (
            <View style={styles.near}>
              <View
                style={[styles.track, { backgroundColor: c.surfaceRaised }]}
              >
                <View
                  style={[
                    styles.fill,
                    {
                      backgroundColor: c.highlightMark,
                      width: `${share * 100}%`,
                    },
                  ]}
                />
              </View>
              <Text
                variant="caption"
                color="textSecondary"
                style={styles.nearText}
              >{w.pointsMore(block.needed)}</Text>
            </View>
          )}
          {block.kind === "visits" && (
            <View style={styles.lockRow}>
              <Ionicons name="lock-closed" size={12} color={c.textSecondary} />
              <Text
                variant="caption"
                color="textSecondary"
                style={styles.nearText}
              >{w.sealedMore(block.needed)}</Text>
            </View>
          )}
          {block.kind === "stock" && (
            <Text
              variant="caption"
              color="textSecondary"
              style={styles.nearText}
            >
              {w.restocking}
            </Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** A code taken, as a ticket: the kind's stub, a perforation, the reward and its code. */
function Ticket({
  redemption,
  onOpen,
}: {
  redemption: Redemption;
  onOpen: (redemption: Redemption) => void;
}) {
  const lang = useLang();
  const w = useMessages().rewards;
  const { colors: c, scheme } = useTheme();
  const look = KINDS[redemption.reward.kind];
  const hue = scheme === "dark" ? look.dark : look.light;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={w.ticketLabel(redemption.reward.title, redemption.reward.partner, dateOf(redemption.createdAt, lang), redemption.code)}
      accessibilityHint={w.opensCode}
      onPress={() => onOpen(redemption)}
      style={({ pressed }) => [
        styles.ticket,
        { backgroundColor: c.surface, borderColor: c.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.stub, { backgroundColor: `${hue}1A` }]}>
        <Ionicons name={look.icon} size={24} color={hue} />
      </View>
      <View style={styles.perforation} aria-hidden>
        <View
          style={[
            styles.notch,
            styles.notchTop,
            { backgroundColor: c.background, borderColor: c.border },
          ]}
        />
        <View style={[styles.dashes, { borderColor: c.border }]} />
        <View
          style={[
            styles.notch,
            styles.notchBottom,
            { backgroundColor: c.background, borderColor: c.border },
          ]}
        />
      </View>
      <View style={styles.ticketBody}>
        <Text variant="label" numberOfLines={1}>
          {redemption.reward.title}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {`${redemption.reward.partner} · ${dateOf(redemption.createdAt, lang)}`}
        </Text>
        <Text color="highlight" style={styles.ticketCode} numberOfLines={1}>
          {redemption.code}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.textSecondary} />
    </Pressable>
  );
}

/** A reward's story and what it asks, ticked off; and the button to take it. */
function RewardSheet({
  reward,
  wallet,
  account,
  onClose,
  onRedeemed,
}: {
  reward: Reward | null;
  wallet: WalletResponse | null;
  account: boolean;
  onClose: () => void;
  onRedeemed: (redemption: Redemption) => void;
}) {
  const m = useMessages();
  const w = m.rewards;
  const { colors: c, scheme } = useTheme();
  const router = useRouter();
  // Kept while the sheet slides away, so it does not empty before it is gone.
  const [shown, setShown] = useState<Reward | null>(reward);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (reward) {
      setShown(reward);
      setError(null);
    }
  }, [reward]);
  if (!shown) return null;

  const look = KINDS[shown.kind];
  const hue = scheme === "dark" ? look.dark : look.light;
  const block = blocker(shown, wallet);
  const balance = wallet?.balance ?? 0;
  const proven = wallet?.provenVisits ?? 0;
  const needs: Array<{ met: boolean; text: string }> = [
    {
      met: balance >= shown.costPoints,
      text: w.needPoints(shown.costPoints, balance),
    },
    ...(shown.minProvenVisits > 0
      ? [
          {
            met: proven >= shown.minProvenVisits,
            text: w.needVisits(shown.minProvenVisits, proven),
          },
        ]
      : []),
    {
      met: shown.stock > 0,
      text: shown.stock > 0 ? w.stock(shown.stock) : w.noStock,
    },
    {
      met: account,
      text: account ? w.signedIn : w.needsAccount,
    },
  ];

  const take = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await redeemReward(shown.code);
      announce(w.taken(shown.title, result.redemption.code));
      onRedeemed(result.redemption);
    } catch (e) {
      const message =
        e instanceof DataError || e instanceof Error
          ? e.message
          : w.takeFailed;
      setError(message);
      announce(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={reward !== null} onClose={onClose}>
        <View style={[styles.grabber, { backgroundColor: c.border }]} />
        <View style={[styles.sheetIcon, { backgroundColor: `${hue}1A` }]}>
          <Ionicons name={look.icon} size={40} color={hue} />
        </View>
        <View style={styles.sheetHead}>
          <Text variant="caption" color="textSecondary" style={styles.centered}>
            {`${w.kinds[shown.kind]} · ${shown.partner}${shown.sample ? w.sampleTag : ""}`}
          </Text>
          <Text variant="title" headingLevel={2} style={styles.centered}>
            {shown.title}
          </Text>
          <Text color="textSecondary" style={styles.centered}>
            {shown.description}
          </Text>
        </View>

        <View
          style={[
            styles.needs,
            { backgroundColor: c.background, borderColor: c.border },
          ]}
        >
          {needs.map((need) => (
            <View key={need.text} style={styles.need}>
              <Ionicons
                name={need.met ? "checkmark-circle" : "ellipse-outline"}
                size={18}
                color={need.met ? c.success : c.textSecondary}
              />
              <Text
                variant="caption"
                color={need.met ? "text" : "textSecondary"}
                style={styles.flex}
              >
                {need.text}
              </Text>
            </View>
          ))}
        </View>

        {error && (
          <Text
            variant="caption"
            color="warning"
            style={styles.centered}
            accessibilityRole="alert"
          >
            {error}
          </Text>
        )}
        {!account ? (
          <Button
            label={w.openAccount}
            onPress={() => {
              onClose();
              router.push({ pathname: "/auth", params: { mode: "register" } });
            }}
            style={styles.stretch}
          />
        ) : (
          <Button
            label={
              busy
                ? w.taking
                : block.kind === null
                  ? w.takeFor(shown.costPoints)
                  : block.kind === "points"
                    ? w.pointsNeeded(block.needed)
                    : block.kind === "visits"
                      ? w.visitsMore(block.needed)
                      : w.soldOutButton
            }
            disabled={busy || block.kind !== null}
            icon={
              busy ? (
                <ActivityIndicator size="small" color={c.onPrimary} />
              ) : undefined
            }
            onPress={() => void take()}
            style={styles.stretch}
          />
        )}
        <Button
          label={w.cancel}
          variant="ghost"
          onPress={onClose}
          style={styles.stretch}
        />
    </Sheet>
  );
}

/**
 * A sheet over the page: the shade behind it fades in where it is while the sheet alone rises from
 * the bottom (a sliding Modal would carry the shade up with it), and both go the same way back.
 */
function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const m = useMessages();
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const shade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) setMounted(true);
    const to = visible ? 1 : 0;
    const going = Animated.parallel([
      Animated.timing(shade, { toValue: to, duration: reduced ? 0 : visible ? 260 : 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(rise, { toValue: to, duration: reduced ? 0 : visible ? 340 : 220, easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    going.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => going.stop();
  }, [visible, shade, rise, reduced]);
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetRoom}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: shade }]}>
          <Pressable style={styles.flex} onPress={onClose} accessibilityRole="button" accessibilityLabel={m.common.close} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
              paddingBottom: insets.bottom + spacing.lg,
              transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }],
            },
          ]}
          accessibilityViewIsModal
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** A code, large, to show at the counter. */
function CodeSheet({
  redemption,
  onClose,
}: {
  redemption: Redemption | null;
  onClose: () => void;
}) {
  const lang = useLang();
  const m = useMessages();
  const w = m.rewards;
  const { colors: c } = useTheme();
  const [shown, setShown] = useState<Redemption | null>(redemption);
  useEffect(() => {
    if (redemption) setShown(redemption);
  }, [redemption]);
  if (!shown) return null;
  return (
    <Sheet visible={redemption !== null} onClose={onClose}>
        <View style={[styles.grabber, { backgroundColor: c.border }]} />
        <Ionicons name="ticket-outline" size={32} color={c.highlight} />
        <Text variant="title" headingLevel={2} style={styles.centered}>
          {shown.reward.title}
        </Text>
        <Text variant="caption" color="textSecondary" style={styles.centered}>
          {w.ticketMeta(shown.reward.partner, dateOf(shown.createdAt, lang), shown.points)}
        </Text>
        <View style={[styles.bigCode, { borderColor: c.highlightMark }]}>
          <Text variant="caption" color="textSecondary" style={styles.centered}>
            {w.singleUse}
          </Text>
          <Text selectable color="text" style={styles.bigCodeText}>
            {shown.code}
          </Text>
        </View>
        <Text variant="caption" color="textSecondary" style={styles.centered}>
          {w.showCode}
        </Text>
        <Button
          label={w.ok}
          variant="ghost"
          onPress={onClose}
          style={styles.stretch}
        />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centered: {
    textAlign: "center",
  },
  stretch: {
    alignSelf: "stretch",
  },
  pressed: {
    opacity: 0.75,
  },
  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    padding: spacing.lg,
    gap: spacing.xl,
  },
  error: {
    padding: spacing.md,
  },
  walletBlock: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    gap: spacing.lg,
  },
  wallet: {
    width: "100%",
    aspectRatio: VK_CARD_RATIO,
    borderRadius: 20,
    overflow: "hidden",
    // The card lifts off the page.
    ...Platform.select({
      ios: {
        shadowColor: "#0A1E5A",
        shadowOpacity: 0.35,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 12 },
      },
      android: { elevation: 10 },
      default: { boxShadow: "0 16px 32px rgba(10, 30, 90, 0.28)" },
    }),
  },
  walletPressed: {
    transform: [{ scale: 0.98 }],
  },
  shine: {
    position: "absolute",
    top: "-40%",
    bottom: "-40%",
    left: 0,
  },
  // Sized outright: on Android an absolute-fill image grows to its own pixel size.
  walletImage: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
  // The lower band under the printed number, inside the card's edge.
  walletBottom: {
    position: "absolute",
    left: "11%",
    right: "6%",
    bottom: "7%",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  holderBlock: {
    flexShrink: 1,
    gap: 2,
  },
  since: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1,
  },
  holder: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: 1.5,
    textShadowColor: "rgba(0, 20, 80, 0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  balanceBlock: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  // Sans figures: the display face draws its zero as a ring.
  balance: {
    fontFamily: fontFamily.sansBold,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.5,
    textShadowColor: "rgba(0, 20, 80, 0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  balanceUnit: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 14,
    lineHeight: 18,
    textShadowColor: "rgba(0, 20, 80, 0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  walletStats: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  walletBlockWide: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxl,
  },
  walletCardWide: {
    width: 460,
  },
  summary: {
    flex: 1,
    gap: spacing.md,
  },
  summaryOverline: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 2.5,
  },
  summaryBalance: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  // Sans figures: the display face draws its zero as a ring.
  summaryValue: {
    fontFamily: fontFamily.sansBold,
    fontSize: 64,
    lineHeight: 72,
    letterSpacing: -1.5,
  },
  summaryUnit: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 16,
    lineHeight: 22,
  },
  summaryRows: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  summaryRowLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    lineHeight: 20,
  },
  summaryRowValue: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  featuredWide: {
    paddingHorizontal: 0,
  },
  featuredScroller: {
    marginHorizontal: -spacing.lg,
  },
  featured: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  tile: {
    borderRadius: 26,
    overflow: "hidden",
    padding: spacing.lg,
    justifyContent: "space-between",
  },
  tilePressed: {
    transform: [{ scale: 0.97 }],
  },
  tileMark: {
    position: "absolute",
    right: -28,
    bottom: -30,
    opacity: 0.1,
    transform: [{ rotate: "-12deg" }],
  },
  tileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tileKind: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 2,
  },
  tileReady: {
    paddingHorizontal: 10,
    height: 24,
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: palette.altin200,
  },
  tileReadyText: {
    fontFamily: fontFamily.sansBold,
    fontSize: 11,
    lineHeight: 14,
  },
  tileBottom: {
    gap: 2,
  },
  // Sans: the display face draws its zero as a ring ("%20").
  tileTitle: {
    fontFamily: fontFamily.sansBold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  tilePartner: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  tileFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  tileCost: {
    fontFamily: fontFamily.sansBold,
    fontSize: 16,
    lineHeight: 22,
  },
  tileTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
  },
  tileFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: palette.altin200,
  },
  tileLeft: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  walletStat: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 5,
    paddingHorizontal: 12,
    height: 32,
    alignContent: "center",
    paddingTop: 6,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statDivider: {
    width: 1,
    alignSelf: "stretch",
  },
  walletStatValue: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  walletStatLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  section: {
    gap: spacing.md,
  },
  sectionHead: {
    gap: 2,
  },
  /** A wide web page: four rewards a row. */
  kinds: {
    gap: spacing.sm,
  },
  kind: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  kindText: {
    fontSize: 14,
    lineHeight: 20,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -spacing.xs,
    rowGap: spacing.sm,
  },
  cardCell: {
    width: "50%",
    paddingHorizontal: spacing.xs,
  },
  /** A wide web page: four rewards a row. */
  cardCellWide: {
    width: "25%",
  },
  card: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardArt: {
    height: 104,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tag: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  tagRight: {
    left: undefined,
    right: spacing.sm,
  },
  tagText: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1,
  },
  cardBody: {
    padding: spacing.md,
    gap: 4,
    flex: 1,
  },
  partner: {
    fontSize: 12,
    lineHeight: 16,
  },
  cardTitle: {
    fontSize: 15,
    lineHeight: 20,
    minHeight: 40,
  },
  costRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginTop: 2,
  },
  cost: {
    fontFamily: fontFamily.sansBold,
    fontSize: 18,
    lineHeight: 24,
  },
  ready: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginTop: spacing.xs,
    paddingHorizontal: 8,
    height: 24,
    borderRadius: radius.full,
  },
  readyText: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  near: {
    gap: 4,
    marginTop: spacing.xs,
  },
  track: {
    alignSelf: "stretch",
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
  },
  nearText: {
    fontSize: 12,
    lineHeight: 16,
  },
  lockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: spacing.xs,
  },
  tickets: {
    gap: spacing.sm,
  },
  ticket: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    paddingRight: spacing.md,
    overflow: "hidden",
  },
  stub: {
    width: 68,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
  perforation: {
    width: 14,
    alignSelf: "stretch",
    alignItems: "center",
  },
  dashes: {
    flex: 1,
    borderLeftWidth: 1.5,
    borderStyle: "dashed",
  },
  notch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
  },
  notchTop: {
    marginTop: -8,
  },
  notchBottom: {
    marginBottom: -8,
  },
  ticketBody: {
    flex: 1,
    gap: 2,
    paddingVertical: spacing.md,
    paddingLeft: spacing.xs,
  },
  ticketCode: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 1.5,
    marginTop: 2,
  },
  backdrop: {
    backgroundColor: "rgba(3, 6, 14, 0.55)",
  },
  sheetRoom: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
  },
  sheetIcon: {
    width: 84,
    height: 84,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetHead: {
    gap: spacing.xs,
    alignItems: "center",
  },
  needs: {
    alignSelf: "stretch",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  need: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  bigCode: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  bigCodeText: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 26,
    lineHeight: 34,
    letterSpacing: 3,
    textAlign: "center",
  },
});
