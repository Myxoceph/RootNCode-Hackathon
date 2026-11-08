import Ionicons from "@expo/vector-icons/Ionicons";
import type { IntakeDraft } from "@vagabonds/contracts";
import { fontFamily, Text } from "@vagabonds/ui";
import { Pressable, StyleSheet, View } from "react-native";

import { PublishState } from "./draft-review";
import { Badge, timeAgo, useAdminColors } from "./kit";
import { textAt } from "./record-path";

const KIND: Record<IntakeDraft["kind"], string> = { field_asset: "Sohbet", book_asset: "Kitap", inscription: "Kitabe" };

/** One draft in the review queue: what and where it is, what the checks found, how long it waited. */
export function DraftRow({ draft, onOpen }: { draft: IntakeDraft; onOpen: () => void }) {
  const a = useAdminColors();
  // An inscription's record is not an asset's: its place is on the asset it adds to (the id).
  const name = textAt(draft.record, ["name", "tr"]) ?? (draft.kind === "inscription" ? (textAt(draft.record, ["location"]) ?? "Kitabe") : draft.assetId);
  const place = [textAt(draft.record, ["location", "city"]), textAt(draft.record, ["location", "district"])].filter(Boolean).join(" / ");
  const { errors, warnings, missing } = draft.validation;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${name}, ${KIND[draft.kind]}, ${errors.length} hata, ${warnings.length} uyarı`}
      onPress={onOpen}
      style={(state) => [styles.card, { backgroundColor: (state as { hovered?: boolean }).hovered ? a.hover : a.card }]}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={styles.line}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Badge tone="grey" label={KIND[draft.kind]} />
          {draft.duplicateOf && <Badge tone="red" label="Zaten var olabilir" icon="copy-outline" />}
        </View>
        <Text color="textSecondary" style={styles.meta} numberOfLines={1}>
          {[place || null, draft.assetId, timeAgo(draft.createdAt)].filter(Boolean).join(" · ")}
        </Text>
        <View style={styles.line}>
          {errors.length > 0 && <Badge tone="red" label={`${errors.length} hata`} icon="close-circle-outline" />}
          {warnings.length > 0 && <Badge tone="gold" label={`${warnings.length} uyarı`} icon="warning-outline" />}
          {missing.length > 0 && <Badge tone="grey" label={`${missing.length} eksik`} icon="help-circle-outline" />}
          <PublishState draft={draft} />
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={a.textSecondary} aria-hidden />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 20, padding: 18 },
  line: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  name: { fontFamily: fontFamily.sansSemiBold, fontSize: 16, flexShrink: 1 },
  meta: { fontSize: 13, lineHeight: 18 },
});
