import type { AchievementRule, AdminAchievement, MetaEnumsResponse } from "@vagabonds/contracts";
import { fontFamily, Text } from "@vagabonds/ui";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Image, Platform, StyleSheet, View } from "react-native";

import {
  Badge,
  Button,
  Card,
  Confirm,
  Empty,
  errorText,
  Failed,
  Field,
  formatNumber,
  Loading,
  PageHeader,
  Picker,
  Segments,
  Sheet,
  Toast,
  Toggle,
  useAdminColors,
  useLoad,
  useToast,
} from "@/components/admin/kit";
import { pickBadgeImage, type PickedImage } from "@/components/admin/pick-image";
import { BilingualField } from "@/components/admin/record-fields";
import { AdminOnly, PageBody } from "@/components/admin/shell";
import { BadgeArt, hasBadgeArt } from "@/components/badge-art";
import {
  createAchievement,
  deleteAchievement,
  deleteAchievementImage,
  fetchAdminAchievements,
  fetchMetaEnums,
  updateAchievement,
  uploadAchievementImage,
} from "@/data/admin";
import { resolveApiUrl } from "@/data/config";

/** Badges visitors earn: each is a rule with numbers, so new ones need no code. */
export default function Achievements() {
  return (
    <AdminOnly>
      <AchievementsPage />
    </AdminOnly>
  );
}

type RuleKind = AchievementRule["kind"];

const RULES: Array<{ value: RuleKind; label: string }> = [
  { value: "visit_count", label: "Eser ziyareti" },
  { value: "proven_visits", label: "Kanıtlı ziyaret" },
  { value: "districts", label: "Farklı ilçe" },
  { value: "cities", label: "Farklı il" },
  { value: "within", label: "Kısa sürede gezi" },
  { value: "complex", label: "Külliyenin tamamı" },
  { value: "contributions", label: "Onaylı not" },
];

/** The rule in a sentence: "Bursa'da 10 eser ziyaret et". */
function ruleText(rule: AchievementRule, meta: MetaEnumsResponse | null): string {
  const city = (code?: string) => (code ? meta?.cities.find((item) => item.code === code)?.label ?? code : null);
  switch (rule.kind) {
    case "visit_count": {
      const where = [rule.district, city(rule.city)].filter(Boolean).join(", ");
      const era = rule.era ? meta?.eras.find((item) => item.code === rule.era)?.label ?? rule.era : null;
      const types = rule.types?.map((code) => meta?.assetTypes.find((item) => item.code === code)?.label ?? code).join(", ");
      return [where && `${where}:`, `${rule.count} ${types ? types.toLocaleLowerCase("tr") : "eser"} ziyaret et`, era && `(${era})`].filter(Boolean).join(" ");
    }
    case "proven_visits":
      return `${city(rule.city) ? `${city(rule.city)}: ` : ""}${rule.count} ziyareti Ziyaret Mührü ile kanıtla`;
    case "districts":
      return `${city(rule.city) ? `${city(rule.city)}: ` : ""}${rule.count} farklı ilçede eser gez`;
    case "cities":
      return `${rule.count} farklı ilde eser gez`;
    case "within":
      return `${rule.hours} saat içinde ${rule.count} farklı ${rule.level === "city" ? "il" : "ilçe"} gez${city(rule.city) ? ` (${city(rule.city)})` : ""}`;
    case "complex":
      return `Külliyenin bütün yapılarını gez (${rule.parentId})`;
    case "contributions":
      return rule.contribution === "inscriptions"
        ? `${rule.count} kitabesi uzman okuyup eklesin (Kitabe Gönüllüleri)`
        : `${rule.count} ${{ notes: "notu", photos: "fotoğrafı", any: "notu ya da fotoğrafı" }[rule.contribution]} onaylansın`;
  }
}

function AchievementsPage() {
  const params = useLocalSearchParams<{ new?: string }>();
  const list = useLoad(fetchAdminAchievements);
  const meta = useLoad(fetchMetaEnums);
  const [editing, setEditing] = useState<AdminAchievement | "new" | null>(params.new ? "new" : null);
  const [deleting, setDeleting] = useState<AdminAchievement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const { toast, show } = useToast();
  const a = useAdminColors();

  const items = list.data ?? [];
  const shown = items.filter((item) => filter === "all" || (filter === "active") === item.active);

  const toggle = async (item: AdminAchievement) => {
    setBusy(item.code);
    try {
      await updateAchievement(item.code, { active: !item.active });
      show(item.active ? `${item.title} gizlendi.` : `${item.title} etkin.`);
      list.reload();
    } catch (error) {
      show(errorText(error), "error");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(deleting.code);
    try {
      await deleteAchievement(deleting.code);
      show(`${deleting.title} silindi.`);
      list.reload();
    } catch (error) {
      show(errorText(error), "error");
    } finally {
      setBusy(null);
      setDeleting(null);
    }
  };

  return (
    <View style={styles.fill}>
      <PageBody>
        <PageHeader
          overline="Oyunlaştırma"
          title="Başarımlar"
          hint="Ziyaretçilerin kazandığı rozetler. Her biri bir kural ve puandan oluşur; gizlenen başarım kazanılamaz ama kazanılmışlar kalır."
          actions={<Button label="Yeni başarım" icon="add" kind="primary" onPress={() => setEditing("new")} />}
        />
        <View style={{ flexDirection: "row", marginBottom: 20 }}>
          <Segments
            label="Durum"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Tümü", count: items.length },
              { value: "active", label: "Etkin", count: items.filter((item) => item.active).length },
              { value: "inactive", label: "Gizli", count: items.filter((item) => !item.active).length },
            ]}
          />
        </View>

        {list.loading && !list.data ? (
          <Card>
            <Loading />
          </Card>
        ) : list.error && !list.data ? (
          <Card>
            <Failed message={list.error} onRetry={list.reload} />
          </Card>
        ) : shown.length === 0 ? (
          <Card>
            <Empty icon="ribbon-outline" title="Başarım yok" body="Yeni bir başarım tanımla: kural seç, hedefi ve puanı yaz." />
          </Card>
        ) : (
          <View style={styles.grid}>
            {shown.map((item) => (
              <Card key={item.code} style={[styles.tile, !item.active && { opacity: 0.62 }]}>
                <View style={styles.tileHead}>
                  {hasBadgeArt(item.code, item.imageUrl) ? (
                    <BadgeArt code={item.code} emoji={item.badge} imageUrl={item.imageUrl} size={48} />
                  ) : (
                    <View style={[styles.medal, { backgroundColor: a.goldSoft, borderColor: a.dark ? "rgba(221,181,92,0.4)" : "rgba(156,116,36,0.3)" }]}>
                      <Text style={styles.medalText}>{item.badge}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.tileTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text color="textSecondary" style={styles.code} numberOfLines={1}>
                      {item.code}
                    </Text>
                  </View>
                  <Badge tone="gold" label={`${item.points} puan`} />
                </View>
                <Text color="textSecondary" style={styles.desc} numberOfLines={2}>
                  {item.description}
                </Text>
                <View style={[styles.rule, { backgroundColor: a.dark ? "rgba(255,255,255,0.03)" : "#F6F8FB", borderColor: a.line }]}>
                  <Text colorValue={a.gold} style={styles.ruleLabel}>
                    KURAL
                  </Text>
                  <Text style={styles.ruleText}>{ruleText(item.rule, meta.data)}</Text>
                </View>
                <View style={styles.tileFoot}>
                  <Text color="textSecondary" style={styles.earned}>
                    {formatNumber(item.earnedCount)} kişi kazandı
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Button small icon={item.active ? "eye-off-outline" : "eye-outline"} accessibilityLabel={item.active ? "Gizle" : "Etkinleştir"} busy={busy === item.code} onPress={() => void toggle(item)} />
                  <Button small icon="create-outline" accessibilityLabel={`${item.title} düzenle`} onPress={() => setEditing(item)} />
                  <Button small icon="trash-outline" kind="danger" accessibilityLabel={`${item.title} sil`} onPress={() => setDeleting(item)} />
                </View>
              </Card>
            ))}
          </View>
        )}
      </PageBody>

      {editing && (
        <AchievementForm
          item={editing === "new" ? null : editing}
          meta={meta.data}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            show(message);
            setEditing(null);
            list.reload();
          }}
        />
      )}
      {deleting && (
        <Confirm
          danger
          title={`${deleting.title} silinsin mi?`}
          body={deleting.earnedCount > 0 ? `${deleting.earnedCount} kişi bu rozeti kazandı. Silmek yerine gizlemeyi düşün.` : "Başarım kalıcı olarak silinir."}
          confirmLabel="Sil"
          busy={busy === deleting.code}
          onConfirm={() => void remove()}
          onCancel={() => setDeleting(null)}
        />
      )}
      <Toast toast={toast} />
    </View>
  );
}

function AchievementForm({ item, meta, onClose, onSaved }: { item: AdminAchievement | null; meta: MetaEnumsResponse | null; onClose: () => void; onSaved: (message: string) => void }) {
  const rule = item?.rule;
  const [code, setCode] = useState(item?.code ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [titleEn, setTitleEn] = useState(item?.titleEn ?? "");
  const [descriptionEn, setDescriptionEn] = useState(item?.descriptionEn ?? "");
  // A picture picked to upload on save, or "remove" to take the current one away.
  const [picture, setPicture] = useState<PickedImage | "remove" | null>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const [badge, setBadge] = useState(item?.badge ?? "🏛️");
  const [points, setPoints] = useState(String(item?.points ?? 50));
  const [sortOrder, setSortOrder] = useState(String((item as { sortOrder?: number } | null)?.sortOrder ?? 1000));
  const [active, setActive] = useState(item?.active ?? true);
  const [kind, setKind] = useState<RuleKind>(rule?.kind ?? "visit_count");
  const [count, setCount] = useState(String(rule && "count" in rule ? rule.count : 5));
  const [city, setCity] = useState<string | null>(rule && "city" in rule ? (rule.city ?? null) : null);
  const [era, setEra] = useState<string | null>(rule?.kind === "visit_count" ? (rule.era ?? null) : null);
  const [type, setType] = useState<string | null>(rule?.kind === "visit_count" ? (rule.types?.[0] ?? null) : null);
  const [hours, setHours] = useState(String(rule?.kind === "within" ? rule.hours : 48));
  const [level, setLevel] = useState<"district" | "city">(rule?.kind === "within" ? rule.level : "district");
  const [parentId, setParentId] = useState(rule?.kind === "complex" ? rule.parentId : "");
  // Visitors send only written notes now, so a new rule counts every note; an old rule keeps its own.
  const contribution = rule?.kind === "contributions" ? rule.contribution : "any";
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const n = (value: string) => Number.parseInt(value, 10);
  const buildRule = (): AchievementRule => {
    const c = n(count);
    const where = city ?? undefined;
    switch (kind) {
      case "visit_count":
        return { kind, count: c, city: where, era: era ?? undefined, types: type ? [type] : undefined };
      case "proven_visits":
        return { kind, count: c, city: where };
      case "districts":
        return { kind, count: c, city: where };
      case "cities":
        return { kind, count: c };
      case "within":
        return { kind, level, count: c, hours: n(hours), city: where };
      case "complex":
        return { kind, parentId: parentId.trim() };
      case "contributions":
        return { kind, count: c, contribution };
    }
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const fields = {
        // An empty English is sent as null, so clearing it removes it.
        title: { tr: title.trim(), en: titleEn.trim() || null },
        description: { tr: description.trim(), en: descriptionEn.trim() || null },
        badge: badge.trim(),
        points: n(points),
        rule: buildRule(),
        sortOrder: n(sortOrder),
        active,
      };
      const saved = item ? await updateAchievement(item.code, fields) : await createAchievement({ ...fields, code: code.trim() });
      // The picture goes once the achievement exists; a refused picture leaves the rest saved.
      try {
        if (picture === "remove") await deleteAchievementImage(saved.code);
        else if (picture) await uploadAchievementImage(saved.code, picture.uri, picture.type);
      } catch (failure) {
        onSaved(`${title.trim()} kaydedildi ama görsel yüklenemedi: ${errorText(failure)}`);
        return;
      }
      onSaved(item ? `${title.trim()} güncellendi.` : `${title.trim()} eklendi.`);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setSaving(false);
    }
  };

  const options = (list: Array<{ code: string; label: string }> | undefined) => (list ?? []).map((entry) => ({ value: entry.code, label: entry.label }));
  const codeOk = !!item || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code.trim());
  const numbersOk = [points, sortOrder, count, hours].every((value) => Number.isFinite(n(value)));
  const ready = codeOk && numbersOk && title.trim() && description.trim() && badge.trim() && (kind !== "complex" || parentId.trim());
  const usesCount = kind !== "complex";
  const usesCity = kind === "visit_count" || kind === "proven_visits" || kind === "districts" || kind === "within";

  return (
    <Sheet
      title={item ? "Başarımı düzenle" : "Yeni başarım"}
      hint="Rozet, puan ve kazanma kuralı."
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
      <BadgePicture
        current={picture === "remove" ? null : picture ? picture.uri : item?.imageUrl ? `${resolveApiUrl()}${item.imageUrl}` : null}
        emoji={badge}
        code={item?.code ?? null}
        error={pictureError}
        onPick={async () => {
          setPictureError(null);
          try {
            const picked = await pickBadgeImage();
            if (picked) setPicture(picked);
          } catch (failure) {
            setPictureError(errorText(failure));
          }
        }}
        onRemove={() => {
          setPictureError(null);
          setPicture(item?.imageUrl ? "remove" : null);
        }}
      />
      <View style={styles.pair}>
        <Field label="Yedek emoji" value={badge} onChangeText={setBadge} maxLength={16} hint="Görsel yokken rozetin yerinde görünür" style={{ width: 150 }} />
        <View style={{ flex: 1, minWidth: 240 }}>
          <BilingualField label="Başlık *" tr={title} en={titleEn} onTr={setTitle} onEn={setTitleEn} placeholder="ör. Han Avcısı" placeholderEn="e.g. Caravan Hunter" />
        </View>
      </View>
      {!item && (
        <Field
          label="Kod *"
          value={code}
          onChangeText={(value) => setCode(value.toLocaleLowerCase("tr").replace(/\s+/g, "-"))}
          placeholder="ör. han-avcisi"
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
        placeholder="Rozetin altında görünen cümle"
        placeholderEn="The sentence under the badge"
        multiline
        hint="İngilizce isteğe bağlı; boşsa İngilizce uygulamada Türkçesi görünür."
      />

      <Text color="textSecondary" style={styles.section}>
        KURAL
      </Text>
      <Picker label="Ne yapınca kazanılır?" value={kind} options={RULES} onChange={(value) => value && setKind(value as RuleKind)} />
      <View style={styles.pair}>
        {usesCount && <Field label="Hedef sayı" value={count} onChangeText={setCount} keyboardType="number-pad" style={styles.half} />}
        {kind === "within" && <Field label="Süre (saat)" value={hours} onChangeText={setHours} keyboardType="number-pad" style={styles.half} />}
      </View>
      {kind === "within" && (
        <Segments
          label="Birim"
          value={level}
          onChange={setLevel}
          options={[
            { value: "district", label: "İlçe" },
            { value: "city", label: "İl" },
          ]}
        />
      )}
      {usesCity && <Picker label="İl" value={city} options={options(meta?.cities)} onChange={setCity} allowEmpty placeholder="Tüm iller" />}
      {kind === "visit_count" && (
        <View style={styles.pair}>
          <View style={styles.half}>
            <Picker label="Eser türü" value={type} options={options(meta?.assetTypes)} onChange={setType} allowEmpty placeholder="Tüm türler" />
          </View>
          <View style={styles.half}>
            <Picker label="Dönem" value={era} options={options(meta?.eras)} onChange={setEra} allowEmpty placeholder="Tüm dönemler" />
          </View>
        </View>
      )}
      {kind === "complex" && <Field label="Külliye kimliği *" value={parentId} onChangeText={setParentId} placeholder="ör. bursa-osmangazi-muradiye-kulliyesi" autoCapitalize="none" />}
      <View style={[styles.preview, { borderColor: "rgba(156,116,36,0.3)" }]}>
        <Text color="textSecondary" style={{ fontSize: 13 }}>
          Önizleme: {ruleText(buildRule(), meta)}
        </Text>
      </View>

      <Text color="textSecondary" style={styles.section}>
        DİĞER
      </Text>
      <View style={styles.pair}>
        <Field label="Puan" value={points} onChangeText={setPoints} keyboardType="number-pad" hint="0–1000" style={styles.half} />
        <Field label="Sıra" value={sortOrder} onChangeText={setSortOrder} keyboardType="number-pad" hint="Küçük olan önce görünür" style={styles.half} />
      </View>
      <Toggle label="Etkin" value={active} onChange={setActive} hint="Gizli başarım kazanılamaz; kazanılmışlar kalır." />
    </Sheet>
  );
}

/**
 * The badge's picture as the app draws it: in a circle with the gold rim, grey until earned, and
 * small as in a list; with the buttons to pick or remove it. Without one, the emoji in its place.
 */
function BadgePicture({ current, emoji, code, error, onPick, onRemove }: { current: string | null; emoji: string; code: string | null; error: string | null; onPick: () => void; onRemove: () => void }) {
  const a = useAdminColors();
  const bundled = !current && code !== null && hasBadgeArt(code);
  const face = (size: number, earned: boolean) =>
    current ? (
      <Image
        source={{ uri: current }}
        style={[{ width: size, height: size, borderRadius: size / 2 }, !earned && { opacity: 0.55 }, !earned && Platform.OS === "web" && ({ filter: "grayscale(1)" } as object)]}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
    ) : code !== null && bundled ? (
      <BadgeArt code={code} emoji={emoji} size={size} earned={earned} />
    ) : (
      <Text style={[{ fontSize: size * 0.5, lineHeight: size * 0.62 }, !earned && { opacity: 0.4 }]}>{emoji || "🏛️"}</Text>
    );
  const medal = (size: number, earned: boolean) => (
    <View style={[styles.previewMedal, { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, borderColor: earned ? a.goldMark : a.line, backgroundColor: a.goldSoft }]}>
      {face(size, earned)}
    </View>
  );
  return (
    <View style={[styles.picture, { borderColor: a.line, backgroundColor: a.dark ? "rgba(255,255,255,0.03)" : "#F6F8FB" }]}>
      <View style={styles.previewRow} accessible accessibilityLabel={current ? "Rozet görselinin önizlemesi" : "Rozetin görseli yok; emoji görünür"}>
        {medal(96, true)}
        <View style={styles.previewSmall}>
          {medal(48, false)}
          <Text color="textSecondary" style={styles.previewCaption}>
            kazanılmamış
          </Text>
        </View>
        <View style={styles.previewSmall}>
          {medal(32, true)}
          <Text color="textSecondary" style={styles.previewCaption}>
            listede
          </Text>
        </View>
      </View>
      <View style={styles.pictureText}>
        <Text style={styles.pictureTitle}>Rozet görseli</Text>
        <Text color="textSecondary" style={styles.pictureHint}>
          {bundled
            ? "Bu rozetin uygulamada hazır bir görseli var. Yeni görsel yüklersen onun yerine geçer."
            : "Kare bir JPEG ya da PNG (en az 512 px önerilir, en çok 2 MB). Dairenin içine kesilir; kenarlarda önemli bir şey bırakma."}
        </Text>
        <View style={styles.pictureActions}>
          <Button label={current ? "Değiştir" : "Görsel seç"} icon="image-outline" onPress={onPick} />
          {current && <Button label="Kaldır" icon="trash-outline" kind="ghost" onPress={onRemove} />}
        </View>
        {error && (
          <Text color="warning" style={styles.pictureHint}>
            {error}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  tile: { flexGrow: 1, flexBasis: 340, maxWidth: 600, gap: 12 },
  tileHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  medal: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  medalText: { fontSize: 24, lineHeight: 30 },
  tileTitle: { fontFamily: fontFamily.sansBold, fontSize: 16 },
  code: { fontFamily: fontFamily.mono, fontSize: 12 },
  desc: { fontSize: 14, lineHeight: 20, minHeight: 40 },
  rule: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, gap: 2 },
  ruleLabel: { fontFamily: fontFamily.monoMedium, fontSize: 10, letterSpacing: 1.6 },
  ruleText: { fontSize: 14, lineHeight: 20 },
  tileFoot: { flexDirection: "row", alignItems: "center", gap: 6 },
  earned: { fontFamily: fontFamily.mono, fontSize: 12 },
  pair: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  half: { flex: 1, minWidth: 160 },
  section: { fontFamily: fontFamily.monoMedium, fontSize: 11, letterSpacing: 1.6, marginTop: 6, marginBottom: -6 },
  preview: { borderWidth: 1, borderStyle: "dashed", borderRadius: 10, padding: 12 },
  picture: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 18, borderWidth: 1, borderRadius: 14, padding: 16 },
  previewRow: { flexDirection: "row", alignItems: "flex-end", gap: 14 },
  previewMedal: { borderWidth: 2, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  previewSmall: { alignItems: "center", gap: 4 },
  previewCaption: { fontFamily: fontFamily.mono, fontSize: 10 },
  pictureText: { flex: 1, minWidth: 220, gap: 6 },
  pictureTitle: { fontFamily: fontFamily.sansBold, fontSize: 15 },
  pictureHint: { fontSize: 13, lineHeight: 18 },
  pictureActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
});
