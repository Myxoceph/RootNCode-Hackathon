import { InscriptionDraftSchema, type IntakeDraft } from "@vagabonds/contracts";
import { Text } from "@vagabonds/ui";
import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { localMediaUrl, reviewDraft } from "@/data/admin";

import { LANGUAGES } from "./asset-steps";
import { Line, Section } from "./intake-chat";
import { Button, Card, CardHeader, errorText, Field, Picker, useAdminColors } from "./kit";

const REASONS = ["Kitabe değil", "Okunamıyor", "Listede zaten var", "Bu esere ait değil"];

/**
 * A visitor's inscription (Kitabe Gönüllüleri, H7): the photo they took beside the model's reading,
 * to correct and decide on. Its record is InscriptionDraftSchema, not a dataset asset; approved, the
 * inscription joins its asset and Taşın Dili can recognise it.
 */
export function InscriptionReview({ draft, onDecided }: { draft: IntakeDraft; onDecided: (draft: IntakeDraft, message: string) => void }) {
  const a = useAdminColors();
  const parsed = InscriptionDraftSchema.safeParse(draft.record);
  const [record, setRecord] = useState(() => (parsed.success ? parsed.data : null));
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const open = draft.status === "pending";
  const changed = record !== null && JSON.stringify(record) !== JSON.stringify(parsed.success ? parsed.data : null);
  const set = <K extends keyof NonNullable<typeof record>>(key: K, value: NonNullable<typeof record>[K]) => {
    if (open) setRecord((now) => (now ? { ...now, [key]: value } : now));
  };
  const orNull = (value: string) => (value.trim() ? value : null);

  const decide = async (decision: "approve" | "reject") => {
    setBusy(decision);
    setFailure(null);
    try {
      const done =
        decision === "approve"
          ? await reviewDraft(draft.id, { decision: "approve", ...(changed && record && { record }) })
          : await reviewDraft(draft.id, { decision: "reject", note: reason.trim() });
      onDecided(done, decision === "approve" ? "Kitabe onaylandı; eserine eklenecek." : "Reddedildi.");
    } catch (error) {
      setFailure(errorText(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader title={changed ? "Kitabe (düzeltildi)" : "Kitabe"} hint={draft.ai ? `${draft.ai.model} · ${Math.round(draft.ai.ms / 1000)} sn` : undefined} />
      {draft.media.length > 0 && (
        <View style={styles.photos}>
          {draft.media.map((m) => (
            <Image key={m.key} source={{ uri: localMediaUrl(m.key) }} style={[styles.photo, { backgroundColor: a.well }]} resizeMode="contain" accessibilityLabel={m.alt ?? "Kitabenin fotoğrafı"} />
          ))}
        </View>
      )}
      {draft.validation.warnings.length > 0 && (
        <Section title={`Uyarılar (${draft.validation.warnings.length})`}>
          {draft.validation.warnings.map((line, i) => (
            <Line key={i} tone="gold" text={line} />
          ))}
        </Section>
      )}
      {record === null ? (
        <Text colorValue={a.warning}>Kaydı okunamıyor; reddet ya da veriyi düzelt.</Text>
      ) : (
        <Section title="Okuma">
          <Picker label="Dil" allowEmpty placeholder="Bilinmiyor" value={record.language} options={LANGUAGES} onChange={(v) => set("language", v as typeof record.language)} />
          <Field label="Yazı" value={record.script ?? ""} onChangeText={(v) => set("script", orNull(v))} editable={open} placeholder="ör. sülüs" />
          <Field label="Yeri" value={record.location ?? ""} onChangeText={(v) => set("location", orNull(v))} editable={open} placeholder="ör. taç kapının üstü" />
          <Field label="Transkripsiyon" multiline value={record.transliteration ?? ""} onChangeText={(v) => set("transliteration", orNull(v))} editable={open} />
          <Field label="Türkçe çeviri" multiline value={record.translationTr ?? ""} onChangeText={(v) => set("translationTr", orNull(v))} editable={open} />
          <Field label="İngilizce çeviri" multiline value={record.translationEn ?? ""} onChangeText={(v) => set("translationEn", orNull(v))} editable={open} />
          {record.uncertain.length > 0 && <Line tone="gold" text={`Model emin değil: ${record.uncertain.join(", ")}`} />}
        </Section>
      )}
      {open && (
        <View style={[styles.decision, { borderTopColor: a.line }]}>
          {failure && (
            <Text colorValue={a.warning} style={styles.small}>
              {failure}
            </Text>
          )}
          {rejecting ? (
            <>
              <View style={styles.row}>
                {REASONS.map((preset) => (
                  <Button key={preset} small label={preset} kind={reason === preset ? "primary" : "secondary"} onPress={() => setReason(preset)} />
                ))}
              </View>
              <Field label="Ret gerekçesi" hint="En az 3 karakter; gönderen görür." value={reason} onChangeText={setReason} />
              <View style={styles.row}>
                <Button small label="Vazgeç" kind="ghost" onPress={() => setRejecting(false)} />
                <Button label="Reddet" icon="close" kind="danger" disabled={reason.trim().length < 3} busy={busy === "reject"} onPress={() => void decide("reject")} />
              </View>
            </>
          ) : (
            <View style={styles.row}>
              <Button label="Reddet" icon="close" kind="danger" disabled={busy !== null} onPress={() => setRejecting(true)} />
              <View style={{ flex: 1 }} />
              <Button label={changed ? "Düzeltilmiş hâliyle onayla" : "Onayla"} icon="checkmark" kind="primary" disabled={busy !== null || record === null} busy={busy === "approve"} onPress={() => void decide("approve")} />
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  small: { fontSize: 13, lineHeight: 19 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  photo: { width: "100%", maxWidth: 520, aspectRatio: 4 / 3, borderRadius: 12 },
  decision: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 18, paddingTop: 16, gap: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
});
