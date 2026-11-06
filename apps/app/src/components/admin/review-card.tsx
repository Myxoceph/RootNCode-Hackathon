import Ionicons from "@expo/vector-icons/Ionicons";
import type { ModerationItem } from "@vagabonds/contracts";
import { fontFamily, Text } from "@vagabonds/ui";
import { Image } from "expo-image";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { approveContribution, banUser, rejectContribution } from "@/data/admin";
import { resolveApiUrl } from "@/data/config";

import { Avatar, Badge, Button, Confirm, errorText, Field, timeAgo, useAdminColors, type IconName, type Tone } from "./kit";

export const KIND: Record<ModerationItem["kind"], { label: string; tone: Tone; icon: IconName }> = {
  tip: { label: "İpucu", tone: "blue", icon: "bulb-outline" },
  memory: { label: "Anı", tone: "gold", icon: "time-outline" },
  correction: { label: "Düzeltme", tone: "red", icon: "create-outline" },
  photo: { label: "Fotoğraf", tone: "rose", icon: "image-outline" },
};

const STATUS: Record<ModerationItem["status"], { label: string; tone: Tone }> = {
  pending: { label: "Bekliyor", tone: "gold" },
  approved: { label: "Onaylandı", tone: "rose" },
  rejected: { label: "Reddedildi", tone: "red" },
};

/** Reasons a moderator picks most often; the field takes any other. */
const REASONS = ["Esere ait değil", "Yanlış ya da doğrulanamayan bilgi", "Uygunsuz içerik", "Kişisel bilgi içeriyor"];

/**
 * One contribution in the review queue: what it is, on which asset, by whom, and its text or
 * photo, with approve, reject (with a reason the author sees) and ban the author.
 */
export function ReviewCard({
  item,
  onDone,
  onError,
  compact,
}: {
  item: ModerationItem;
  /** The contribution after the review, or null when its author was banned. */
  onDone: (item: ModerationItem | null, message: string) => void;
  onError: (message: string) => void;
  compact?: boolean;
}) {
  const a = useAdminColors();
  const [busy, setBusy] = useState<"approve" | "reject" | "ban" | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [banning, setBanning] = useState(false);
  const kind = KIND[item.kind];
  const pending = item.status === "pending";

  const run = async (what: "approve" | "reject" | "ban") => {
    setBusy(what);
    try {
      if (what === "approve") onDone(await approveContribution(item.id), "Not onaylandı; artık nabızda görünüyor.");
      else if (what === "reject") onDone(await rejectContribution(item.id, reason.trim()), "Not reddedildi; gerekçe yazara iletildi.");
      else {
        await banUser(item.author.id);
        onDone(null, `${item.author.nickname} engellendi.`);
      }
    } catch (error) {
      onError(errorText(error));
    } finally {
      setBusy(null);
      setBanning(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: a.card }]}>
      <View style={styles.head}>
        <Avatar name={item.author.nickname} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.headLine}>
            <Text style={styles.author} numberOfLines={1}>
              {item.author.nickname}
            </Text>
            {item.author.banned && <Badge tone="red" label="Engelli" icon="ban-outline" />}
          </View>
          <Text color="textSecondary" style={styles.meta} numberOfLines={1}>
            {item.asset.name} · {timeAgo(item.createdAt)}
          </Text>
        </View>
        <Badge tone={kind.tone} label={kind.label} icon={kind.icon} />
        {!pending && <Badge tone={STATUS[item.status].tone} label={STATUS[item.status].label} />}
      </View>

      <View style={[styles.content, item.photo && styles.contentPhoto]}>
        {item.photo && (
          <Image
            source={{ uri: `${resolveApiUrl()}${item.photo.path}` }}
            accessibilityLabel={item.body}
            contentFit="cover"
            style={[styles.photo, { backgroundColor: a.line }, compact && { width: 120, height: 90 }]}
          />
        )}
        <Text style={styles.body} numberOfLines={compact ? 3 : undefined}>
          {item.body}
        </Text>
      </View>

      {item.rejectReason && (
        <View style={[styles.reason, { backgroundColor: a.redSoft }]}>
          <Ionicons name="return-down-forward-outline" size={14} color={a.warning} aria-hidden />
          <Text colorValue={a.warning} style={{ fontSize: 13, flex: 1 }}>
            {item.rejectReason}
          </Text>
        </View>
      )}
      {item.reviewer && (
        <Text color="textSecondary" style={styles.meta}>
          {item.reviewer.nickname} inceledi{item.reviewedAt ? ` · ${timeAgo(item.reviewedAt)}` : ""}
        </Text>
      )}

      {pending && rejecting && (
        <View style={[styles.rejectBox, { borderColor: a.line }]}>
          <View style={styles.reasons}>
            {REASONS.map((preset) => (
              <Button key={preset} small label={preset} kind={reason === preset ? "primary" : "secondary"} onPress={() => setReason(preset)} />
            ))}
          </View>
          <Field label="Ret gerekçesi" hint="Yazara gösterilir; en az 3 karakter." value={reason} onChangeText={setReason} placeholder="Neden reddedildiğini kısaca yaz" />
          <View style={[styles.actions, { justifyContent: "flex-end" }]}>
            <Button small label="Vazgeç" kind="ghost" onPress={() => setRejecting(false)} />
            <Button small label="Reddet" icon="close" kind="danger" disabled={reason.trim().length < 3} busy={busy === "reject"} onPress={() => void run("reject")} />
          </View>
        </View>
      )}

      {pending && !rejecting && (
        <View style={styles.actions}>
          <Button small label="Onayla" icon="checkmark" kind="success" busy={busy === "approve"} disabled={busy !== null} onPress={() => void run("approve")} />
          <Button small label="Reddet" icon="close" kind="danger" disabled={busy !== null} onPress={() => setRejecting(true)} />
          <View style={{ flex: 1 }} />
          {!item.author.banned && <Button small label="Yazarı engelle" icon="ban-outline" kind="ghost" disabled={busy !== null} onPress={() => setBanning(true)} />}
        </View>
      )}

      {banning && (
        <Confirm
          danger
          title={`${item.author.nickname} engellensin mi?`}
          body="Engellenen ziyaretçi artık not gönderemez ve onaylı notları nabızdan kalkar. Kullanıcılar sayfasından engeli kaldırabilirsin."
          confirmLabel="Engelle"
          busy={busy === "ban"}
          onConfirm={() => void run("ban")}
          onCancel={() => setBanning(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, padding: 20, gap: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  headLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  author: { fontFamily: fontFamily.sansBold, fontSize: 15, flexShrink: 1 },
  meta: { fontSize: 13, lineHeight: 18 },
  content: { gap: 12 },
  contentPhoto: { flexDirection: "row", alignItems: "flex-start" },
  photo: { width: 168, height: 126, borderRadius: 16 },
  body: { flex: 1, fontSize: 15, lineHeight: 23 },
  reason: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  rejectBox: { borderTopWidth: 1, paddingTop: 14, gap: 12 },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
});
