import type { AdminReward, RewardKind } from "@vagabonds/contracts";
import { fontFamily, Text } from "@vagabonds/ui";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  Badge,
  Button,
  Card,
  Empty,
  errorText,
  Failed,
  Field,
  formatNumber,
  Loading,
  PageHeader,
  Picker,
  Sheet,
  Toast,
  Toggle,
  useAdminColors,
  useLoad,
  useToast,
  type IconName,
  type Tone,
} from "@/components/admin/kit";
import { BilingualField } from "@/components/admin/record-fields";
import { AdminOnly, PageBody } from "@/components/admin/shell";
import { addRewardCodes, createReward, fetchAdminRewards, updateReward } from "@/data/admin";

/** What visitors spend their points on: partner rewards, each with single-use codes in stock. */
export default function Rewards() {
  return (
    <AdminOnly>
      <RewardsPage />
    </AdminOnly>
  );
}

const KINDS: Record<RewardKind, { label: string; icon: IconName; tone: Tone }> = {
  merch: { label: "Hediyelik", icon: "bag-handle-outline", tone: "gold" },
  museum: { label: "Müze", icon: "business-outline", tone: "blue" },
  discount: { label: "İndirim", icon: "pricetag-outline", tone: "rose" },
  experience: { label: "Deneyim", icon: "sparkles-outline", tone: "red" },
};

function RewardsPage() {
  const params = useLocalSearchParams<{ new?: string }>();
  const list = useLoad(fetchAdminRewards);
  const [editing, setEditing] = useState<AdminReward | "new" | null>(params.new ? "new" : null);
  const [stocking, setStocking] = useState<AdminReward | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { toast, show } = useToast();
  const a = useAdminColors();

  const items = list.data ?? [];
  const lowStock = items.filter((item) => item.active && item.stock < 5).length;

  const toggle = async (item: AdminReward) => {
    setBusy(item.code);
    try {
      await updateReward(item.code, { active: !item.active });
      show(item.active ? `${item.title} yayından kaldırıldı.` : `${item.title} yayında.`);
      list.reload();
    } catch (error) {
      show(errorText(error), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.fill}>
      <PageBody>
        <PageHeader
          overline="Cüzdan"
          title="Ödüller"
          hint="Ziyaretçilerin puanlarıyla aldığı ödüller. Her ödülün kodu kurumdan gelir ve bir kez kullanılır; stok yüklenen kodlar kadardır."
          actions={<Button label="Yeni ödül" icon="add" kind="primary" onPress={() => setEditing("new")} />}
        />
        {lowStock > 0 && (
          <View style={[styles.notice, { backgroundColor: a.redSoft }]}>
            <Text colorValue={a.warning} style={{ fontSize: 14 }}>
              {lowStock} etkin ödülün stoğu 5 kodun altında. Kurumdan yeni kod isteyip yükle.
            </Text>
          </View>
        )}

        {list.loading && !list.data ? (
          <Card>
            <Loading />
          </Card>
        ) : list.error && !list.data ? (
          <Card>
            <Failed message={list.error} onRetry={list.reload} />
          </Card>
        ) : items.length === 0 ? (
          <Card>
            <Empty icon="gift-outline" title="Henüz ödül yok" body="Bir kurumla anlaşılan ödülü ekle, sonra kodlarını yükle." />
          </Card>
        ) : (
          <View style={styles.grid}>
            {items.map((item) => {
              const kind = KINDS[item.kind];
              const used = item.codesTotal > 0 ? item.codesUsed / item.codesTotal : 0;
              return (
                <Card key={item.code} style={[styles.tile, !item.active && { opacity: 0.62 }]}>
                  <View style={styles.tileHead}>
                    <Badge tone={kind.tone} label={kind.label} icon={kind.icon} />
                    {item.sample && <Badge tone="grey" label="Örnek" />}
                    {!item.active && <Badge tone="grey" label="Yayında değil" icon="eye-off-outline" />}
                    <View style={{ flex: 1 }} />
                    <Text colorValue={a.gold} style={styles.cost}>
                      {formatNumber(item.costPoints)}
                      <Text colorValue={a.gold} style={styles.costUnit}>
                        {" "}
                        puan
                      </Text>
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.tileTitle}>{item.title}</Text>
                    <Text color="textSecondary" style={styles.partner}>
                      {item.partner}
                    </Text>
                  </View>
                  <Text color="textSecondary" style={styles.desc} numberOfLines={2}>
                    {item.description}
                  </Text>
                  {item.minProvenVisits > 0 && (
                    <Text color="textSecondary" style={styles.meta}>
                      En az {item.minProvenVisits} kanıtlı ziyaret gerekir
                    </Text>
                  )}

                  <View style={{ gap: 6 }}>
                    <View style={styles.stockLine}>
                      <Text style={styles.meta}>Stok</Text>
                      <Text colorValue={item.stock < 5 ? a.warning : a.text} style={styles.stockValue}>
                        {formatNumber(item.stock)} kod kaldı
                      </Text>
                    </View>
                    <View style={[styles.bar, { backgroundColor: a.dark ? "rgba(255,255,255,0.06)" : "#EDF1F6" }]}>
                      <View style={[styles.barFill, { width: `${Math.round(used * 100)}%`, backgroundColor: a.goldMark }]} />
                    </View>
                    <Text color="textSecondary" style={styles.meta}>
                      {formatNumber(item.codesUsed)} / {formatNumber(item.codesTotal)} kod kullanıldı
                    </Text>
                  </View>

                  <View style={styles.tileFoot}>
                    <Button small label="Kod yükle" icon="cloud-upload-outline" onPress={() => setStocking(item)} />
                    <View style={{ flex: 1 }} />
                    <Button small icon={item.active ? "eye-off-outline" : "eye-outline"} accessibilityLabel={item.active ? "Yayından kaldır" : "Yayına al"} busy={busy === item.code} onPress={() => void toggle(item)} />
                    <Button small icon="create-outline" accessibilityLabel={`${item.title} düzenle`} onPress={() => setEditing(item)} />
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </PageBody>

      {editing && (
        <RewardForm
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            show(message);
            setEditing(null);
            list.reload();
          }}
        />
      )}
      {stocking && (
        <CodesForm
          item={stocking}
          onClose={() => setStocking(null)}
          onSaved={(message) => {
            show(message);
            setStocking(null);
            list.reload();
          }}
        />
      )}
      <Toast toast={toast} />
    </View>
  );
}

function RewardForm({ item, onClose, onSaved }: { item: AdminReward | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [code, setCode] = useState(item?.code ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [titleEn, setTitleEn] = useState(item?.titleEn ?? "");
  const [descriptionEn, setDescriptionEn] = useState(item?.descriptionEn ?? "");
  const [partner, setPartner] = useState(item?.partner ?? "");
  const [kind, setKind] = useState<RewardKind>(item?.kind ?? "museum");
  const [cost, setCost] = useState(String(item?.costPoints ?? 200));
  const [minVisits, setMinVisits] = useState(String(item?.minProvenVisits ?? 0));
  const [sortOrder, setSortOrder] = useState(String(item?.sortOrder ?? 1000));
  const [sample, setSample] = useState(item?.sample ?? false);
  const [active, setActive] = useState(item?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const n = (value: string) => Number.parseInt(value, 10);
  const codeOk = !!item || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code.trim());
  const ready = codeOk && title.trim() && description.trim() && partner.trim() && n(cost) >= 1 && n(minVisits) >= 0 && Number.isFinite(n(sortOrder));

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const fields = {
        // An empty English is sent as null, so clearing it removes it.
        title: { tr: title.trim(), en: titleEn.trim() || null },
        description: { tr: description.trim(), en: descriptionEn.trim() || null },
        partner: partner.trim(),
        kind,
        costPoints: n(cost),
        minProvenVisits: n(minVisits),
        sample,
        sortOrder: n(sortOrder),
        active,
      };
      if (item) {
        await updateReward(item.code, fields);
        onSaved(`${title.trim()} güncellendi.`);
      } else {
        await createReward({ ...fields, code: code.trim() });
        onSaved(`${title.trim()} eklendi. Şimdi kodlarını yükle.`);
      }
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={item ? "Ödülü düzenle" : "Yeni ödül"}
      hint="Kurum, bedel ve koşullar. Kodlar ayrı yüklenir."
      onClose={onClose}
      footer={
        <>
          {error && (
            <Text color="warning" style={{ flex: 1, fontSize: 13, alignSelf: "center" }}>
              {error}
            </Text>
          )}
          <Button label="Vazgeç" kind="ghost" onPress={onClose} />
          <Button label={item ? "Kaydet" : "Ekle"} kind="primary" icon="checkmark" busy={saving} disabled={!ready} onPress={() => void save()} />
        </>
      }
    >
      <BilingualField
        label="Başlık *"
        tr={title}
        en={titleEn}
        onTr={setTitle}
        onEn={setTitleEn}
        placeholder="ör. Müze Kart indirimi"
        placeholderEn="e.g. Museum Card discount"
        hint="İngilizce isteğe bağlı; boşsa İngilizce uygulamada Türkçesi görünür."
      />
      {!item && (
        <Field
          label="Kod *"
          value={code}
          onChangeText={(value) => setCode(value.toLocaleLowerCase("tr").replace(/\s+/g, "-"))}
          placeholder="ör. muze-kart-indirim"
          hint="Küçük harf, rakam ve tire; sonradan değişmez."
          error={code && !codeOk ? "Yalnızca küçük harf, rakam ve tire" : null}
          autoCapitalize="none"
        />
      )}
      <BilingualField
        label="Açıklama *"
        tr={description}
        en={descriptionEn}
        onTr={setDescription}
        onEn={setDescriptionEn}
        placeholder="Ziyaretçinin ne aldığı ve nasıl kullanacağı"
        placeholderEn="What the visitor gets and how to use it"
        multiline
      />
      <View style={styles.pair}>
        <Field label="Kurum *" value={partner} onChangeText={setPartner} placeholder="ör. Vakıf Katılım" maxLength={120} style={styles.half} />
        <View style={styles.half}>
          <Picker label="Tür" value={kind} options={Object.entries(KINDS).map(([value, look]) => ({ value, label: look.label }))} onChange={(value) => value && setKind(value as RewardKind)} />
        </View>
      </View>
      <View style={styles.pair}>
        <Field label="Bedel (puan) *" value={cost} onChangeText={setCost} keyboardType="number-pad" style={styles.half} />
        <Field label="Kanıtlı ziyaret şartı" value={minVisits} onChangeText={setMinVisits} keyboardType="number-pad" hint="0: şart yok" style={styles.half} />
      </View>
      <Field label="Sıra" value={sortOrder} onChangeText={setSortOrder} keyboardType="number-pad" hint="Küçük olan önce görünür" />
      <Toggle label="Yayında" value={active} onChange={setActive} />
      <Toggle label="Örnek ödül" value={sample} onChange={setSample} hint="Gerçek bir anlaşma yok; uygulamada “Örnek” diye işaretlenir." />
    </Sheet>
  );
}

function CodesForm({ item, onClose, onSaved }: { item: AdminReward; onClose: () => void; onSaved: (message: string) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const codes = [...new Set(text.split(/[\s,;]+/).map((code) => code.trim()).filter(Boolean))];
  const bad = codes.filter((code) => !/^[A-Za-z0-9_-]{4,64}$/.test(code));

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await addRewardCodes(item.code, codes);
      onSaved(`${result.added} kod eklendi${result.duplicates ? `, ${result.duplicates} tekrar atlandı` : ""}. Stok: ${result.stock}.`);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title="Kod yükle"
      hint={`${item.title} · şu an ${item.stock} kod stokta`}
      onClose={onClose}
      footer={
        <>
          {error && (
            <Text color="warning" style={{ flex: 1, fontSize: 13, alignSelf: "center" }}>
              {error}
            </Text>
          )}
          <Button label="Vazgeç" kind="ghost" onPress={onClose} />
          <Button label={codes.length ? `${codes.length} kodu yükle` : "Yükle"} kind="primary" icon="cloud-upload-outline" busy={saving} disabled={codes.length === 0 || bad.length > 0} onPress={() => void save()} />
        </>
      }
    >
      <Field
        label="Kodlar"
        value={text}
        onChangeText={setText}
        multiline
        placeholder={"VKF-8F2A-91\nVKF-77QK-03\n…"}
        autoCapitalize="characters"
        hint="Her satıra bir kod; virgül ya da boşlukla da ayırabilirsin. Daha önce yüklenen kodlar atlanır."
        error={bad.length ? `Geçersiz: ${bad.slice(0, 3).join(", ")}${bad.length > 3 ? "…" : ""} (4–64 harf, rakam, _ ya da -)` : null}
        style={{ minHeight: 260 }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  notice: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  tile: { flexGrow: 1, flexBasis: 320, maxWidth: 560, gap: 12 },
  tileHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  cost: { fontFamily: fontFamily.display, fontSize: 22 },
  costUnit: { fontFamily: fontFamily.sans, fontSize: 13 },
  tileTitle: { fontFamily: fontFamily.sansBold, fontSize: 17 },
  partner: { fontSize: 13 },
  desc: { fontSize: 14, lineHeight: 20 },
  meta: { fontSize: 12, lineHeight: 16 },
  stockLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stockValue: { fontFamily: fontFamily.monoMedium, fontSize: 13 },
  bar: { height: 6, borderRadius: 3, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3 },
  tileFoot: { flexDirection: "row", alignItems: "center", gap: 6 },
  pair: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  half: { flex: 1, minWidth: 180 },
});
