"use no memo";
// Reads the app's language outside hooks (getMessages, casing, localeTag): the React Compiler must not cache it.
import Ionicons from "@expo/vector-icons/Ionicons";
import type {
  Redemption,
  Reward,
  RewardKind,
  WalletResponse,
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
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Pattern,
  RadialGradient,
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
import { useWideWeb, wideColumn } from "@/lib/use-wide-web";
import { casing, useLang } from "@/i18n";

type IconName = ComponentProps<typeof Ionicons>["name"];
type Filter = RewardKind | "all";

/** Each kind's icon and hue: the hue's light-theme shade for text and icons, the dark one on dark. */
const KINDS: Record<
  RewardKind,
  { label: string; icon: IconName; light: string; dark: string }
> = {
  merch: {
    label: "Hediyelik",
    icon: "bag-handle-outline",
    light: palette.altin700,
    dark: palette.altin300,
  },
  museum: {
    label: "Müze",
    icon: "business-outline",
    light: palette.kobalt700,
    dark: palette.kobalt300,
  },
  discount: {
    label: "İndirim",
    icon: "pricetag-outline",
    light: palette.firuze700,
    dark: palette.firuze300,
  },
  experience: {
    label: "Deneyim",
    icon: "sparkles-outline",
    light: palette.mercan700,
    dark: palette.mercan300,
  },
};

/** The Gezgin Kartı's own colors: a navy card in both themes, like a card in the hand. */
const card = {
  from: "#0C1A3A",
  to: "#16306A",
  line: "rgba(231, 194, 106, 0.45)",
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

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString("tr-TR", {
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
  useLang();
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
        <title>Ödüllerim · Vagabonds</title>
      </Head>

      <WalletCard wallet={walletData} holder={user?.nickname ?? null} />
      {user !== undefined && !account && <AccountNote />}

      {rewards.status === "loading" && (
        <ActivityIndicator
          color={c.textSecondary}
          accessibilityLabel="Ödüller yükleniyor"
        />
      )}
      {rewards.status === "error" && (
        <Pressable
          accessibilityRole="button"
          onPress={rewards.retry}
          style={styles.error}
        >
          <Text variant="caption" color="textSecondary" style={styles.centered}>
            {`${rewards.error.message} Tekrar denemek için dokun.`}
          </Text>
        </Pressable>
      )}
      {rewards.status === "success" && rewards.data === null && (
        <Text color="textSecondary" style={styles.centered}>
          Ödüller için sunucu gerekiyor; bu sürüm örnek veriyle çalışıyor.
        </Text>
      )}

      {items.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text variant="heading" headingLevel={2}>
              Ödüller
            </Text>
            <Text variant="caption" color="textSecondary">
              Rozetlerle kazandığın puanı ortak kurumların ödüllerine harca.
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
              Kodların
            </Text>
            <Text variant="caption" color="textSecondary">
              Kodu şubede, gişede ya da kafede göster; her kod bir kez
              kullanılır.
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
function WalletCard({
  wallet,
  holder,
}: {
  wallet: WalletResponse | null;
  holder: string | null;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const balance = wallet?.balance ?? 0;
  return (
    <View
      style={styles.wallet}
      onLayout={(e) => setSize(e.nativeEvent.layout)}
      accessible
      accessibilityLabel={`Gezgin Kartı: ${balance} puan harcanabilir. ${wallet?.earned ?? 0} kazanılan, ${wallet?.spent ?? 0} harcanan, ${wallet?.provenVisits ?? 0} kanıtlanmış ziyaret`}
    >
      {size.width > 0 && (
        <Svg
          key={`${size.width}x${size.height}`}
          width={size.width}
          height={size.height}
          style={StyleSheet.absoluteFill}
          aria-hidden
        >
          <Defs>
            <LinearGradient id="wallet-bg" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={card.from} />
              <Stop offset="1" stopColor={card.to} />
            </LinearGradient>
            <RadialGradient id="wallet-glow" cx="92%" cy="0%" r="75%">
              <Stop
                offset="0"
                stopColor={palette.altin200}
                stopOpacity={0.32}
              />
              <Stop offset="1" stopColor={palette.altin200} stopOpacity={0} />
            </RadialGradient>
            {/* The eight-pointed star of the map, as a faint tiling. */}
            <Pattern
              id="wallet-stars"
              width={36}
              height={36}
              patternUnits="userSpaceOnUse"
            >
              <Path
                d={eightPointStar(18, 18, 7)}
                fill="none"
                stroke="#FFFFFF"
                strokeOpacity={0.06}
                strokeWidth={1}
              />
            </Pattern>
          </Defs>
          <Rect
            width={size.width}
            height={size.height}
            fill="url(#wallet-bg)"
          />
          <Rect
            width={size.width}
            height={size.height}
            fill="url(#wallet-stars)"
          />
          <Rect
            width={size.width}
            height={size.height}
            fill="url(#wallet-glow)"
          />
          <Circle
            cx={size.width - 40}
            cy={size.height - 30}
            r={70}
            fill="none"
            stroke={palette.altin200}
            strokeOpacity={0.14}
            strokeWidth={1}
          />
          <Circle
            cx={size.width - 40}
            cy={size.height - 30}
            r={46}
            fill="none"
            stroke={palette.altin200}
            strokeOpacity={0.1}
            strokeWidth={1}
          />
        </Svg>
      )}

      <View style={styles.walletTop}>
        <Text colorValue={palette.altin200} style={styles.overline}>
          VAGABONDS · GEZGİN KARTI
        </Text>
        <Ionicons name="sparkles" size={18} color={palette.altin200} />
      </View>

      <View>
        <Text colorValue={palette.gece300} style={styles.walletLabel}>
          Harcanabilir puan
        </Text>
        <View style={styles.balanceRow}>
          <Text colorValue={palette.gece50} style={styles.balance}>
            {balance.toLocaleString("tr-TR")}
          </Text>
          <Text colorValue={palette.altin200} style={styles.balanceUnit}>
            puan
          </Text>
        </View>
      </View>

      <View style={styles.walletBottom}>
        <View style={styles.walletStats}>
          <WalletStat value={wallet?.earned ?? 0} label="kazanılan" />
          <WalletStat value={wallet?.spent ?? 0} label="harcanan" />
          <WalletStat
            value={wallet?.provenVisits ?? 0}
            label="mühürlü ziyaret"
          />
        </View>
        {holder && (
          <Text
            colorValue={palette.gece300}
            style={styles.holder}
            numberOfLines={1}
          >
            {holder.toLocaleUpperCase(casing())}
          </Text>
        )}
      </View>
    </View>
  );
}

function WalletStat({ value, label }: { value: number; label: string }) {
  return (
    <View>
      <Text colorValue={palette.gece50} style={styles.walletStatValue}>
        {value.toLocaleString("tr-TR")}
      </Text>
      <Text colorValue={palette.gece300} style={styles.walletStatLabel}>
        {label}
      </Text>
    </View>
  );
}

/** An eight-pointed star (two squares, one turned), centered on (x, y). */
function eightPointStar(x: number, y: number, r: number) {
  const pts = Array.from({ length: 16 }, (_, i) => {
    const angle = (Math.PI / 8) * i - Math.PI / 2;
    const d = i % 2 === 0 ? r : r * 0.62;
    return `${(x + d * Math.cos(angle)).toFixed(2)} ${(y + d * Math.sin(angle)).toFixed(2)}`;
  });
  return `M${pts.join(" L")} Z`;
}

/** An anonymous visitor earns points but cannot take codes; an account keeps the points. */
function AccountNote() {
  const { colors: c } = useTheme();
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
        Kod almak için hesap aç. Şimdiye kadar kazandığın puanlar hesabına
        geçer.
      </Text>
      <Button
        label="Hesap aç"
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
  const options: Array<{ key: Filter; label: string }> = [
    { key: "all", label: "Tümü" },
    ...kinds.map((kind) => ({ key: kind, label: KINDS[kind].label })),
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
      ? "tükendi"
      : block.kind === "visits"
        ? `${block.needed} kanıtlanmış ziyaret daha gerekiyor`
        : block.kind === "points"
          ? `${block.needed} puan daha gerekiyor`
          : "alabilirsin";

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
        accessibilityLabel={`${reward.title}, ${reward.partner}, ${reward.costPoints} puan, ${state}${reward.sample ? ", örnek ödül" : ""}`}
        accessibilityHint="Ödülün ayrıntısını açar"
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
                ÖRNEK
              </Text>
            </View>
          )}
          {reward.stock === 0 && (
            <View
              style={[styles.tag, styles.tagRight, { backgroundColor: c.text }]}
            >
              <Text colorValue={c.background} style={styles.tagText}>
                TÜKENDİ
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
              puan
            </Text>
          </View>

          {block.kind === null && (
            <View
              style={[
                styles.ready,
                {
                  backgroundColor: `${scheme === "dark" ? palette.firuze300 : palette.firuze700}1F`,
                },
              ]}
            >
              <Ionicons name="checkmark-circle" size={14} color={c.success} />
              <Text colorValue={c.success} style={styles.readyText}>
                Alabilirsin
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
              >{`${block.needed} puan daha`}</Text>
            </View>
          )}
          {block.kind === "visits" && (
            <View style={styles.lockRow}>
              <Ionicons name="lock-closed" size={12} color={c.textSecondary} />
              <Text
                variant="caption"
                color="textSecondary"
                style={styles.nearText}
              >{`${block.needed} mühürlü ziyaret daha`}</Text>
            </View>
          )}
          {block.kind === "stock" && (
            <Text
              variant="caption"
              color="textSecondary"
              style={styles.nearText}
            >
              Yeni kodlar bekleniyor
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
  const { colors: c, scheme } = useTheme();
  const look = KINDS[redemption.reward.kind];
  const hue = scheme === "dark" ? look.dark : look.light;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${redemption.reward.title}, ${redemption.reward.partner}, ${dateOf(redemption.createdAt)}. Kod ${redemption.code}`}
      accessibilityHint="Kodu büyük gösterir"
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
          {`${redemption.reward.partner} · ${dateOf(redemption.createdAt)}`}
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
  const { colors: c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
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
      text: `${shown.costPoints} puan (sende ${balance})`,
    },
    ...(shown.minProvenVisits > 0
      ? [
          {
            met: proven >= shown.minProvenVisits,
            text: `${shown.minProvenVisits} kanıtlanmış ziyaret (sende ${proven})`,
          },
        ]
      : []),
    {
      met: shown.stock > 0,
      text: shown.stock > 0 ? `Stokta ${shown.stock} kod` : "Kodlar tükendi",
    },
    {
      met: account,
      text: account ? "Hesabınla giriş yaptın" : "Hesap gerekir",
    },
  ];

  const take = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await redeemReward(shown.code);
      announce(`${shown.title} alındı. Kodun ${result.redemption.code}`);
      onRedeemed(result.redemption);
    } catch (e) {
      const message =
        e instanceof DataError || e instanceof Error
          ? e.message
          : "Ödül alınamadı.";
      setError(message);
      announce(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={reward !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Kapat"
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: c.surface,
            borderColor: c.border,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}
        accessibilityViewIsModal
      >
        <View style={[styles.grabber, { backgroundColor: c.border }]} />
        <View style={[styles.sheetIcon, { backgroundColor: `${hue}1A` }]}>
          <Ionicons name={look.icon} size={40} color={hue} />
        </View>
        <View style={styles.sheetHead}>
          <Text variant="caption" color="textSecondary" style={styles.centered}>
            {`${look.label} · ${shown.partner}${shown.sample ? " · örnek ödül" : ""}`}
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
            label="Hesap aç"
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
                ? "Alınıyor…"
                : block.kind === null
                  ? `${shown.costPoints} puanla al`
                  : block.kind === "points"
                    ? `${block.needed} puan daha gerekiyor`
                    : block.kind === "visits"
                      ? `${block.needed} kanıtlanmış ziyaret daha`
                      : "Tükendi"
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
          label="Vazgeç"
          variant="ghost"
          onPress={onClose}
          style={styles.stretch}
        />
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
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<Redemption | null>(redemption);
  useEffect(() => {
    if (redemption) setShown(redemption);
  }, [redemption]);
  if (!shown) return null;
  return (
    <Modal
      visible={redemption !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Kapat"
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: c.surface,
            borderColor: c.border,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}
        accessibilityViewIsModal
      >
        <View style={[styles.grabber, { backgroundColor: c.border }]} />
        <Ionicons name="ticket-outline" size={32} color={c.highlight} />
        <Text variant="title" headingLevel={2} style={styles.centered}>
          {shown.reward.title}
        </Text>
        <Text variant="caption" color="textSecondary" style={styles.centered}>
          {`${shown.reward.partner} · ${dateOf(shown.createdAt)} · ${shown.points} puan`}
        </Text>
        <View style={[styles.bigCode, { borderColor: c.highlightMark }]}>
          <Text variant="caption" color="textSecondary" style={styles.centered}>
            TEK KULLANIMLIK KOD
          </Text>
          <Text selectable color="text" style={styles.bigCodeText}>
            {shown.code}
          </Text>
        </View>
        <Text variant="caption" color="textSecondary" style={styles.centered}>
          Bu kodu şubede, gişede ya da kafede göster. Kod bir kez kullanılır.
        </Text>
        <Button
          label="Tamam"
          variant="ghost"
          onPress={onClose}
          style={styles.stretch}
        />
      </View>
    </Modal>
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
  wallet: {
    minHeight: 210,
    padding: spacing.xl,
    justifyContent: "space-between",
    gap: spacing.lg,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: card.line,
    backgroundColor: card.from,
    overflow: "hidden",
  },
  walletTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  overline: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 2.5,
  },
  walletLabel: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  // Sans figures: the display face draws its zero as a ring.
  balance: {
    fontFamily: fontFamily.sansBold,
    fontSize: 52,
    lineHeight: 60,
    letterSpacing: -1,
  },
  balanceUnit: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 18,
    lineHeight: 24,
  },
  walletBottom: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  walletStats: {
    flexDirection: "row",
    gap: spacing.lg,
    flexShrink: 1,
  },
  walletStatValue: {
    fontFamily: fontFamily.sansBold,
    fontSize: 16,
    lineHeight: 22,
  },
  walletStatLabel: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 11,
    lineHeight: 15,
  },
  holder: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.5,
    flexShrink: 1,
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
    flex: 1,
    backgroundColor: "rgba(3, 6, 14, 0.55)",
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
