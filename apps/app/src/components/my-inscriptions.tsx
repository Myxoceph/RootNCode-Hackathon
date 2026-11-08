import Ionicons from "@expo/vector-icons/Ionicons";
import type { InscriptionProposal } from "@vagabonds/contracts";
import { fontFamily, radius, spacing, Text, useTheme, type ThemeRole } from "@vagabonds/ui";
import { Link } from "expo-router";
import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { proposalPhotoUri, useMyInscriptionProposals } from "@/data/inscription-proposals";
import { useLang, useMessages } from "@/i18n";
import { formatDate } from "@/lib/format-date";

type Shown = "pending" | "approved" | "published" | "rejected";

const tones: Record<Shown, ThemeRole> = { pending: "highlight", approved: "highlight", published: "success", rejected: "warning" };

/** Approved is not yet in the app: the data pipeline publishes it (H6), and then it counts. */
const shownOf = (item: InscriptionProposal): Shown => (item.published ? "published" : item.status);

/**
 * Profil · Kitabelerim (Kitabe Gönüllüleri, Y5): the inscriptions the visitor sent and where each
 * stands. Nothing shows for a visitor who has sent none, so the notes page stays as it was.
 */
export function MyInscriptions() {
  const w = useMessages().propose;
  const mine = useMyInscriptionProposals();
  const items = mine.status === "success" ? (mine.data ?? []) : [];
  if (items.length === 0) return null;
  const published = items.filter((item) => item.published).length;
  return (
    <View style={styles.section}>
      <View>
        <Text variant="heading" headingLevel={2}>
          {w.mine}
        </Text>
        <Text variant="caption" color="textSecondary">
          {w.mineCount(items.length, published)}
        </Text>
      </View>
      <View accessibilityRole="list" style={styles.list}>
        {items.map((item) => (
          <ProposalRow key={item.id} item={item} />
        ))}
      </View>
    </View>
  );
}

function ProposalRow({ item }: { item: InscriptionProposal }) {
  const { colors: c } = useTheme();
  const w = useMessages().propose;
  const lang = useLang();
  const shown = shownOf(item);
  const tone = c[tones[shown]];
  const uri = proposalPhotoUri(item.photo);
  const [broken, setBroken] = useState(false);
  return (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      {uri && !broken ? (
        <Image source={{ uri }} style={[styles.thumb, { backgroundColor: c.background }]} accessibilityLabel={w.photoOf(item.assetName)} onError={() => setBroken(true)} />
      ) : (
        <View style={[styles.thumb, styles.placeholder, { backgroundColor: c.background }]}>
          <Ionicons name="document-text-outline" size={24} color={c.textSecondary} aria-hidden />
        </View>
      )}
      <View style={styles.body}>
        <Link href={{ pathname: "/asset/[id]", params: { id: item.assetId } }}>
          <Text variant="label" color="primary" numberOfLines={2}>
            {item.assetName}
          </Text>
        </Link>
        <View style={styles.meta}>
          <View style={[styles.status, { borderColor: tone }]}>
            <View style={[styles.dot, { backgroundColor: tone }]} />
            <Text variant="caption" colorValue={tone} style={styles.statusText}>
              {w.statuses[shown]}
            </Text>
          </View>
          <Text variant="caption" color="textSecondary">
            {formatDate(item.createdAt, lang)}
          </Text>
        </View>
        {item.status === "rejected" && item.reviewNote && (
          <Text variant="caption" color="textSecondary">
            {w.expertNote(item.reviewNote)}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md, marginTop: spacing.xl },
  list: { gap: spacing.md },
  row: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth },
  thumb: { width: 72, height: 72, borderRadius: radius.lg },
  placeholder: { alignItems: "center", justifyContent: "center" },
  body: { flex: 1, minWidth: 0, gap: spacing.xs },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  status: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full, borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: fontFamily.sansMedium, fontSize: 13, lineHeight: 18 },
});
