import Ionicons from "@expo/vector-icons/Ionicons";
import type { AdminAsset, AdminAssetRecord, AssetDetail, MetaEnumsResponse } from "@vagabonds/contracts";
import { Text } from "@vagabonds/ui";
import { useState, type ComponentProps } from "react";
import { StyleSheet, View } from "react-native";

import { AssetImage } from "@/components/asset-image";
import type { EditPart } from "@/lib/in-frame";

import { Badge, Button, Field, Picker, Toggle, useAdminColors } from "./kit";
import { Cell, ChoiceField, ConfidenceField, Group, ListField, newId, NumberField, PairField, Row, TagsField, TextField } from "./record-fields";

/**
 * The asset editor, one part of the app's page at a time: what is picked on the phone, or in the
 * list beside it, opens here with only its own fields. Every change goes up at once, so the phone
 * follows. Required fields carry a star; everything else may stay empty and the app leaves it out.
 */

type R = AdminAssetRecord;
type Update = (change: Partial<R>) => void;
type IconName = ComponentProps<typeof Ionicons>["name"];

export interface PartInfo {
  part: EditPart;
  label: string;
  icon: IconName;
  /** Where the part shows in the app. */
  where: string;
  /** Opened inside the dossier on the phone, not on the pages. */
  dossier?: boolean;
}

/** The parts in the order a visitor meets them, grouped as the app's page is. */
export const PART_GROUPS: Array<{ title: string; parts: PartInfo[] }> = [
  {
    title: "Kapak",
    parts: [
      { part: "identity", label: "Ad ve tür", icon: "text-outline", where: "Kapak sayfasında, en üstte; kartlarda ve listelerde." },
      { part: "place", label: "Konum", icon: "location-outline", where: "Kapakta adın altında; haritada ve yol tarifinde." },
      { part: "media", label: "Görseller", icon: "images-outline", where: "Sayfaların arka planında ve fotoğraf galerisinde." },
    ],
  },
  {
    title: "Hikâye sayfaları",
    parts: [
      { part: "summary", label: "Özet", icon: "reader-outline", where: "Kapaktan sonraki ilk sayfa." },
      { part: "built", label: "Yapım ve bânî", icon: "hammer-outline", where: "Özetten sonraki rakamlar sayfasında; ayrıntılar dosyanın Künye bölümünde." },
      { part: "facts", label: "Ölçüler", icon: "stats-chart-outline", where: "Büyük rakamlarla gösterilen sayfada ve dosyada." },
      { part: "highlights", label: "Öne çıkanlar", icon: "star-outline", where: "Her biri ayrı bir “Yerinde bakın” sayfası." },
      { part: "sections", label: "Bölümler", icon: "book-outline", where: "İlk üçü birer sayfa olur; hepsi “Devamını oku” ile ve dosyada okunur." },
    ],
  },
  {
    title: "Eserin dosyası",
    parts: [
      { part: "timeline", label: "Zaman çizelgesi", icon: "time-outline", where: "Eserin dosyasında, yüzyıllara bölünmüş.", dossier: true },
      { part: "legends", label: "Rivayetler", icon: "chatbubbles-outline", where: "Eserin dosyasında, rivayet olarak işaretli.", dossier: true },
      { part: "inscriptions", label: "Kitabeler", icon: "albums-outline", where: "Eserin dosyasında ve Taşın Dili kamerasında.", dossier: true },
      { part: "people", label: "Kişiler", icon: "people-outline", where: "Eserin dosyasında.", dossier: true },
      { part: "waqf", label: "Vakıf", icon: "business-outline", where: "Eserin dosyasında.", dossier: true },
    ],
  },
  {
    title: "Son sayfa",
    parts: [
      { part: "visit", label: "Ziyaret", icon: "walk-outline", where: "Son sayfada, “Keşfe çık” altında." },
      { part: "access", label: "Erişim ve ses", icon: "accessibility-outline", where: "Son sayfadaki deneyimlerde ve dosyada Erişilebilirlik." },
      { part: "tips", label: "İpuçları", icon: "bulb-outline", where: "Son sayfada, Ziyaretçi notları arasında." },
    ],
  },
];

export const PARTS: PartInfo[] = PART_GROUPS.flatMap((group) => group.parts);
export const partInfo = (part: EditPart) => PARTS.find((p) => p.part === part)!;

/** The parts without which the asset cannot be saved. */
const REQUIRED: EditPart[] = ["identity", "place", "summary"];

/** How full a part is: "missing" when it is required and not filled, the number of items for lists. */
export function partState(part: EditPart, r: R): { state: "done" | "empty" | "missing"; count?: number } {
  const has = (text: string | null | undefined) => !!text && text.trim() !== "";
  const list = (items: unknown[]) => ({ state: items.length > 0 ? ("done" as const) : ("empty" as const), count: items.length || undefined });
  let filled: boolean;
  switch (part) {
    case "identity":
      filled = has(r.name.tr) && has(r.type);
      break;
    case "place":
      filled = has(r.city) && has(r.district);
      break;
    case "summary":
      filled = has(r.summary.tr);
      break;
    case "media":
      return list(r.media);
    case "built":
      filled = has(r.dating.display?.tr) || r.dating.startYear !== null || r.dating.century !== null || has(r.founder.name) || has(r.architect.name);
      break;
    case "facts":
      return list(r.facts);
    case "highlights":
      return list(r.highlights);
    case "sections":
      return list(r.sections);
    case "timeline":
      return list(r.timeline);
    case "legends":
      return list(r.legends);
    case "inscriptions":
      return list(r.inscriptions);
    case "people":
      return list(r.people);
    case "waqf":
      filled = has(r.waqf.name) || has(r.waqf.deedExcerpt?.tr) || has(r.waqf.conditions?.tr);
      break;
    case "visit":
      filled = r.visit.setting !== null || r.visit.durationMin !== null || r.visit.entranceFee !== null || has(r.visit.notes?.tr);
      break;
    case "access": {
      const a = r.accessibility;
      filled = [a.wheelchair, a.stepFree, a.ramp, a.toilet].some((v) => v !== "unknown") || has(a.audioDescription?.tr) || has(r.ambientSound.key);
      break;
    }
    case "tips":
      return list(r.tips);
  }
  return { state: filled ? "done" : REQUIRED.includes(part) ? "missing" : "empty" };
}

export function PartEditor({
  part,
  record,
  onChange,
  meta,
  base,
  assets,
}: {
  part: EditPart;
  record: R;
  onChange: (record: R) => void;
  meta: MetaEnumsResponse | null;
  /** The asset as last saved, for its photos. */
  base: AssetDetail | null;
  /** Every asset, to pick the complex this one belongs to. */
  assets: AdminAsset[];
}) {
  const update: Update = (change) => onChange({ ...record, ...change });
  switch (part) {
    case "identity":
      return <Identity record={record} update={update} meta={meta} />;
    case "place":
      return <Place record={record} update={update} meta={meta} assets={assets} />;
    case "media":
      return <Media record={record} update={update} base={base} />;
    case "summary":
      return (
        <Group>
          <PairField label="Özet" required multiline value={record.summary} onChange={(summary) => update({ summary: summary ?? { tr: "", en: null } })} placeholder="Bir iki cümleyle eserin ne olduğu, ne zaman ve kimin için yapıldığı" />
        </Group>
      );
    case "built":
      return <Built record={record} update={update} />;
    case "facts":
      return <Facts record={record} update={update} />;
    case "highlights":
      return <Highlights record={record} update={update} />;
    case "sections":
      return <Sections record={record} update={update} />;
    case "timeline":
      return <Timeline record={record} update={update} meta={meta} />;
    case "legends":
      return <Legends record={record} update={update} />;
    case "inscriptions":
      return <Inscriptions record={record} update={update} />;
    case "people":
      return <People record={record} update={update} />;
    case "waqf":
      return <Waqf record={record} update={update} />;
    case "visit":
      return <Visit record={record} update={update} />;
    case "access":
      return <Access record={record} update={update} />;
    case "tips":
      return <Tips record={record} update={update} />;
  }
}

const options = (list: Array<{ code: string; label: string }> | undefined) => (list ?? []).map((item) => ({ value: item.code, label: item.label }));

function Identity({ record, update, meta }: { record: R; update: Update; meta: MetaEnumsResponse | null }) {
  const types = options(meta?.assetTypes);
  return (
    <View style={styles.stack}>
      <Group>
        <PairField label="Ad" required value={record.name} onChange={(name) => update({ name: name ?? { tr: "", en: null } })} placeholder="ör. Ulu Cami" />
        <PairField label="Alt başlık" optional value={record.subtitle} onChange={(subtitle) => update({ subtitle })} placeholder="ör. Bursa'nın İncisi" />
        <Row>
          <Cell>
            <Picker label="Tür *" value={record.type || null} options={types} onChange={(type) => update({ type: type ?? "" })} placeholder={meta ? "Tür seç" : "Yükleniyor…"} />
          </Cell>
          <Cell>
            <Picker label="Dönem" value={record.era} options={options(meta?.eras)} onChange={(era) => update({ era })} allowEmpty placeholder="Belirtilmemiş" />
          </Cell>
        </Row>
        <View style={{ gap: 8 }}>
          {record.secondaryTypes.length > 0 && (
            <View style={styles.chips}>
              {record.secondaryTypes.map((code) => (
                <Button key={code} small kind="secondary" icon="close" label={types.find((t) => t.value === code)?.label ?? code} onPress={() => update({ secondaryTypes: record.secondaryTypes.filter((c) => c !== code) })} />
              ))}
            </View>
          )}
          <Picker
            label="Ek türler"
            value={null}
            options={types.filter((t) => t.value !== record.type && !record.secondaryTypes.includes(t.value))}
            onChange={(code) => code && update({ secondaryTypes: [...record.secondaryTypes, code] })}
            placeholder="Ek tür ekle"
          />
        </View>
        <TagsField label="Etiketler" values={record.tags} onChange={(tags) => update({ tags })} placeholder="ör. çok kubbeli, hat sanatı (Enter ile ekle)" />
        <Toggle label="Yayında" value={record.status === "published"} onChange={(on) => update({ status: on ? "published" : "draft" })} hint={record.status === "published" ? "Kaydedince uygulamada görünür." : "Taslak: yalnızca panelde görünür."} />
      </Group>
      <ListField
        title="Diğer adları"
        hint="Dosyanın Künye bölümünde görünür."
        items={record.alternateNames}
        onChange={(alternateNames) => update({ alternateNames })}
        make={() => ({ name: { tr: "", en: null }, note: null })}
        titleOf={(n) => n.name.tr}
        addLabel="Ad ekle"
        empty="Başka bir adla da biliniyorsa buraya ekle."
        render={(n, set) => (
          <>
            <PairField label="Ad" required value={n.name} onChange={(name) => set({ ...n, name: name ?? { tr: "", en: null } })} />
            <TextField label="Not" value={n.note} onChange={(note) => set({ ...n, note })} placeholder="ör. Evliya Çelebi'nin benzetmesi" />
          </>
        )}
      />
    </View>
  );
}

function Place({ record, update, meta, assets }: { record: R; update: Update; meta: MetaEnumsResponse | null; assets: AdminAsset[] }) {
  return (
    <Group>
      <Row>
        <Cell>
          <Picker label="İl *" value={record.city || null} options={options(meta?.cities)} onChange={(city) => update({ city: city ?? "" })} placeholder={meta ? "İl seç" : "Yükleniyor…"} />
        </Cell>
        <Cell>
          <Field label="İlçe *" value={record.district} onChangeText={(district) => update({ district })} placeholder="ör. Osmangazi" />
        </Cell>
      </Row>
      <Row>
        <Cell>
          <TextField label="Mahalle" value={record.neighborhood} onChange={(neighborhood) => update({ neighborhood })} />
        </Cell>
        <Cell grow={2}>
          <TextField label="Adres" value={record.address} onChange={(address) => update({ address })} placeholder="Cadde, sokak, no" />
        </Cell>
      </Row>
      <Coordinates value={record.coordinates} onChange={(coordinates) => update({ coordinates })} />
      <Picker
        label="Bağlı olduğu külliye"
        value={record.parentId}
        options={assets.map((asset) => ({ value: asset.id, label: `${asset.name} · ${asset.district}` }))}
        onChange={(parentId) => update({ parentId })}
        allowEmpty
        placeholder="Yok"
      />
    </Group>
  );
}

/** Latitude and longitude, kept as typed; the record gets a point once both read as numbers in Türkiye. */
function Coordinates({ value, onChange }: { value: R["coordinates"]; onChange: (value: R["coordinates"]) => void }) {
  const [lat, setLat] = useState(value ? String(value.lat) : "");
  const [lng, setLng] = useState(value ? String(value.lng) : "");
  const point = { lat: Number(lat.replace(",", ".")), lng: Number(lng.replace(",", ".")) };
  const inside = point.lat >= 35.5 && point.lat <= 42.5 && point.lng >= 25.5 && point.lng <= 45;
  const bad = (lat.trim() !== "" || lng.trim() !== "") && !(lat.trim() && lng.trim() && inside);
  const set = (nextLat: string, nextLng: string) => {
    setLat(nextLat);
    setLng(nextLng);
    const next = { lat: Number(nextLat.replace(",", ".")), lng: Number(nextLng.replace(",", ".")) };
    const ok = nextLat.trim() && nextLng.trim() && next.lat >= 35.5 && next.lat <= 42.5 && next.lng >= 25.5 && next.lng <= 45;
    onChange(ok ? next : null);
  };
  return (
    <Row>
      <Cell>
        <Field label="Enlem" value={lat} keyboardType="decimal-pad" placeholder="40.1842" onChangeText={(next) => set(next, lng)} error={bad ? "Türkiye içinde bir nokta yaz" : null} />
      </Cell>
      <Cell>
        <Field label="Boylam" value={lng} keyboardType="decimal-pad" placeholder="29.0611" hint="İkisi de dolu olunca eser haritada görünür." onChangeText={(next) => set(lat, next)} />
      </Cell>
    </Row>
  );
}

function Built({ record, update }: { record: R; update: Update }) {
  return (
    <View style={styles.stack}>
      <Group title="Ne zaman" hint="Bilinmeyenleri boş bırak.">
        <PairField label="Tarih" optional value={record.dating.display} onChange={(display) => update({ dating: { ...record.dating, display } })} placeholder="ör. H. 802 / M. 1399-1400" />
        <Row>
          <Cell>
            <NumberField label="Başlangıç yılı" value={record.dating.startYear} onChange={(startYear) => update({ dating: { ...record.dating, startYear } })} placeholder="1396" />
          </Cell>
          <Cell>
            <NumberField label="Bitiş yılı" value={record.dating.endYear} onChange={(endYear) => update({ dating: { ...record.dating, endYear } })} placeholder="1400" />
          </Cell>
        </Row>
        <Row>
          <Cell>
            <NumberField label="Hicrî yıl" value={record.dating.hijriYear} onChange={(hijriYear) => update({ dating: { ...record.dating, hijriYear } })} placeholder="802" />
          </Cell>
          <Cell>
            <NumberField label="Yüzyıl" value={record.dating.century} onChange={(century) => update({ dating: { ...record.dating, century } })} placeholder="14" />
          </Cell>
        </Row>
        <PairField label="Tarihlendirme dayanağı" optional multiline value={record.dating.basis} onChange={(basis) => update({ dating: { ...record.dating, basis } })} placeholder="ör. Minber kitabesindeki tarih" />
        <ConfidenceField optional value={record.dating.confidence} onChange={(confidence) => update({ dating: { ...record.dating, confidence } })} />
      </Group>
      <Group title="Kim yaptırdı">
        <Row>
          <Cell>
            <TextField label="Bânî" value={record.founder.name} onChange={(name) => update({ founder: { ...record.founder, name } })} placeholder="ör. Yıldırım Bayezid" />
          </Cell>
          <Cell>
            <TextField label="Unvanı" value={record.founder.role} onChange={(role) => update({ founder: { ...record.founder, role } })} placeholder="ör. Osmanlı padişahı" />
          </Cell>
        </Row>
        <ConfidenceField optional value={record.founder.confidence} onChange={(confidence) => update({ founder: { ...record.founder, confidence } })} />
      </Group>
      <Group title="Mimar">
        <TextField label="Mimar" value={record.architect.name} onChange={(name) => update({ architect: { ...record.architect, name } })} placeholder="Biliniyorsa" />
        <ConfidenceField optional value={record.architect.confidence} onChange={(confidence) => update({ architect: { ...record.architect, confidence } })} />
      </Group>
      <ListField
        title="Mimar adayları"
        hint="Mimar kesin bilinmiyorsa kaynaklarda adı geçenler."
        items={record.architect.candidates}
        onChange={(candidates) => update({ architect: { ...record.architect, candidates } })}
        make={() => ({ name: "", note: null })}
        titleOf={(c) => c.name}
        addLabel="Aday ekle"
        empty="Aday yok."
        render={(c, set) => (
          <>
            <Field label="Ad" value={c.name} onChangeText={(name) => set({ ...c, name })} />
            <TextField label="Not" value={c.note} onChange={(note) => set({ ...c, note })} />
          </>
        )}
      />
    </View>
  );
}

function Facts({ record, update }: { record: R; update: Update }) {
  return (
    <ListField
      hint="Sayı olanlar (ör. kubbe çapı) uygulamada büyük rakamlarla gösterilir; ilk ikisi rakamlar sayfasına çıkar."
      items={record.facts}
      onChange={(facts) => update({ facts })}
      make={() => ({ key: newId("bilgi"), label: { tr: "", en: null }, value: "", unit: null, note: null, confidence: "certain" as const })}
      titleOf={(f) => `${f.label.tr}${f.value ? `: ${f.value}${f.unit ? ` ${f.unit}` : ""}` : ""}`}
      addLabel="Ölçü ekle"
      empty="Ölçü ya da bilgi yok."
      render={(f, set) => (
        <>
          <PairField label="Ad" required value={f.label} onChange={(label) => set({ ...f, label: label ?? { tr: "", en: null } })} placeholder="ör. Kubbe sayısı" />
          <Row>
            <Cell grow={2}>
              <Field label="Değer *" value={f.value} onChangeText={(value) => set({ ...f, value })} placeholder="ör. 20" />
            </Cell>
            <Cell>
              <TextField label="Birim" value={f.unit} onChange={(unit) => set({ ...f, unit })} placeholder="ör. m" />
            </Cell>
          </Row>
          <PairField label="Not" optional value={f.note} onChange={(note) => set({ ...f, note })} />
          <ConfidenceField value={f.confidence} onChange={(confidence) => set({ ...f, confidence: confidence ?? "certain" })} />
        </>
      )}
    />
  );
}

function Highlights({ record, update }: { record: R; update: Update }) {
  const sections = record.sections.map((s) => ({ value: s.id, label: s.title.tr || "Başlıksız bölüm" }));
  return (
    <ListField
      hint="Ziyaretçinin yerinde bakması gereken ayrıntılar."
      items={record.highlights}
      onChange={(highlights) => update({ highlights })}
      make={() => ({ feature: "diger", title: { tr: "", en: null }, hint: { tr: "", en: null }, sectionId: null })}
      titleOf={(h) => h.title.tr}
      addLabel="Öne çıkan ekle"
      empty="Öne çıkan ayrıntı yok."
      render={(h, set) => (
        <>
          <PairField label="Başlık" required value={h.title} onChange={(title) => set({ ...h, title: title ?? { tr: "", en: null } })} placeholder="ör. Kündekâri minber" />
          <PairField label="İpucu" value={h.hint} onChange={(hint) => set({ ...h, hint: hint ?? { tr: "", en: null } })} placeholder="ör. Mihrabın sağında, ahşap" />
          <Picker label="“Devamını oku” ile açılan bölüm" value={h.sectionId} options={sections} onChange={(sectionId) => set({ ...h, sectionId })} allowEmpty placeholder="Yok" />
        </>
      )}
    />
  );
}

function Sections({ record, update }: { record: R; update: Update }) {
  return (
    <ListField
      hint="Eserin hikâyesi; ilk cümleleri sayfalarda görünür."
      items={record.sections}
      onChange={(sections) => update({ sections })}
      make={() => ({ id: newId("bolum"), title: { tr: "", en: null }, body: { tr: "", en: null }, confidence: "certain" as const })}
      titleOf={(s) => s.title.tr}
      addLabel="Bölüm ekle"
      empty="Henüz bölüm yok. En az bir bölüm eserin sayfasını doldurur."
      render={(s, set) => (
        <>
          <PairField label="Başlık" required value={s.title} onChange={(title) => set({ ...s, title: title ?? { tr: "", en: null } })} placeholder="ör. Tarihçe" />
          <PairField label="Metin" required multiline value={s.body} onChange={(body) => set({ ...s, body: body ?? { tr: "", en: null } })} />
          <ConfidenceField value={s.confidence} onChange={(confidence) => set({ ...s, confidence: confidence ?? "certain" })} />
        </>
      )}
    />
  );
}

function Timeline({ record, update, meta }: { record: R; update: Update; meta: MetaEnumsResponse | null }) {
  return (
    <ListField
      items={record.timeline}
      onChange={(timeline) => update({ timeline })}
      make={() => ({ id: newId("olay"), year: new Date().getFullYear(), date: null, hijri: null, type: "construction", title: { tr: "", en: null }, note: null, confidence: "certain" as const })}
      titleOf={(e) => `${e.year} · ${e.title.tr}`}
      addLabel="Olay ekle"
      empty="Olay yok: yapım, onarım, hasar gibi tarihleri ekle."
      render={(e, set) => (
        <>
          <Row>
            <Cell>
              <NumberField label="Yıl *" value={e.year} onChange={(year) => year !== null && set({ ...e, year })} />
            </Cell>
            <Cell>
              <TextField label="Hicrî" value={e.hijri} onChange={(hijri) => set({ ...e, hijri })} placeholder="ör. 802" />
            </Cell>
            <Cell grow={2}>
              <Picker label="Tür" value={e.type} options={options(meta?.timelineEventTypes)} onChange={(type) => type && set({ ...e, type })} />
            </Cell>
          </Row>
          <PairField label="Başlık" required value={e.title} onChange={(title) => set({ ...e, title: title ?? { tr: "", en: null } })} placeholder="ör. Büyük depremde zarar gördü" />
          <PairField label="Not" optional multiline value={e.note} onChange={(note) => set({ ...e, note })} />
          <ConfidenceField value={e.confidence} onChange={(confidence) => set({ ...e, confidence: confidence ?? "certain" })} />
        </>
      )}
    />
  );
}

const VERDICTS = [
  { value: "folk_belief", label: "Halk inanışı" },
  { value: "unverified", label: "Doğrulanmamış" },
  { value: "refuted_by_source", label: "Kaynaklarca çürütülmüş" },
] as const;

function Legends({ record, update }: { record: R; update: Update }) {
  return (
    <ListField
      hint="Tarihçeden ayrı tutulur; uygulamada her zaman rivayet olarak işaretlenir."
      items={record.legends}
      onChange={(legends) => update({ legends })}
      make={() => ({ id: newId("rivayet"), title: { tr: "", en: null }, body: { tr: "", en: null }, verdict: "folk_belief" as const })}
      titleOf={(l) => l.title.tr}
      addLabel="Rivayet ekle"
      empty="Rivayet yok."
      render={(l, set) => (
        <>
          <PairField label="Başlık" required value={l.title} onChange={(title) => set({ ...l, title: title ?? { tr: "", en: null } })} />
          <PairField label="Metin" required multiline value={l.body} onChange={(body) => set({ ...l, body: body ?? { tr: "", en: null } })} />
          <ChoiceField label="Kaynaklara göre" value={l.verdict} options={[...VERDICTS]} onChange={(verdict) => set({ ...l, verdict })} />
        </>
      )}
    />
  );
}

const LANGUAGES = [
  { value: "ar", label: "Arapça" },
  { value: "tr-ottoman", label: "Osmanlı Türkçesi" },
  { value: "fa", label: "Farsça" },
  { value: "tr", label: "Türkçe" },
  { value: "el", label: "Rumca" },
  { value: "la", label: "Latince" },
  { value: "hy", label: "Ermenice" },
  { value: "other", label: "Diğer" },
];

function Inscriptions({ record, update }: { record: R; update: Update }) {
  return (
    <ListField
      items={record.inscriptions}
      onChange={(inscriptions) => update({ inscriptions })}
      make={() => ({ id: newId("kitabe"), location: { tr: "", en: null }, language: "ar" as const, script: null, transliteration: null, translation: null, author: null, hijriYear: null, gregorian: null, note: null })}
      titleOf={(n) => n.location.tr}
      addLabel="Kitabe ekle"
      empty="Kitabe yok."
      render={(n, set) => (
        <>
          <PairField label="Yeri" required value={n.location} onChange={(location) => set({ ...n, location: location ?? { tr: "", en: null } })} placeholder="ör. Taç kapının üzerinde" />
          <Row>
            <Cell>
              <Picker label="Dil" value={n.language} options={LANGUAGES} onChange={(language) => language && set({ ...n, language: language as typeof n.language })} />
            </Cell>
            <Cell>
              <TextField label="Yazı" value={n.script} onChange={(script) => set({ ...n, script })} placeholder="ör. sülüs" />
            </Cell>
            <Cell>
              <TextField label="Yazan" value={n.author} onChange={(author) => set({ ...n, author })} />
            </Cell>
          </Row>
          <TextField label="Okunuş" multiline value={n.transliteration} onChange={(transliteration) => set({ ...n, transliteration })} />
          <PairField label="Anlamı" optional multiline value={n.translation} onChange={(translation) => set({ ...n, translation })} />
          <Row>
            <Cell>
              <NumberField label="Hicrî yıl" value={n.hijriYear} onChange={(hijriYear) => set({ ...n, hijriYear })} />
            </Cell>
            <Cell>
              <TextField label="Miladî" value={n.gregorian} onChange={(gregorian) => set({ ...n, gregorian })} placeholder="ör. 1399-1400" />
            </Cell>
          </Row>
          <PairField label="Not" optional value={n.note} onChange={(note) => set({ ...n, note })} />
        </>
      )}
    />
  );
}

function People({ record, update }: { record: R; update: Update }) {
  return (
    <ListField
      items={record.people}
      onChange={(people) => update({ people })}
      make={() => ({ name: "", role: { tr: "", en: null } })}
      titleOf={(p) => `${p.name}${p.role.tr ? ` · ${p.role.tr}` : ""}`}
      addLabel="Kişi ekle"
      empty="Eserle ilgili kişi yok."
      render={(p, set) => (
        <Row>
          <Cell>
            <Field label="Ad *" value={p.name} onChangeText={(name) => set({ ...p, name })} />
          </Cell>
          <Cell>
            <PairField label="Rolü" value={p.role} onChange={(role) => set({ ...p, role: role ?? { tr: "", en: null } })} placeholder="ör. Hattat" />
          </Cell>
        </Row>
      )}
    />
  );
}

function Waqf({ record, update }: { record: R; update: Update }) {
  return (
    <Group>
      <Row>
        <Cell grow={2}>
          <TextField label="Vakıf" value={record.waqf.name} onChange={(name) => update({ waqf: { ...record.waqf, name } })} />
        </Cell>
        <Cell>
          <TextField label="Vakfiye tarihi" value={record.waqf.deedDate} onChange={(deedDate) => update({ waqf: { ...record.waqf, deedDate } })} />
        </Cell>
      </Row>
      <PairField label="Vakfiyeden" optional multiline value={record.waqf.deedExcerpt} onChange={(deedExcerpt) => update({ waqf: { ...record.waqf, deedExcerpt } })} />
      <PairField label="Vakıf şartları" optional multiline value={record.waqf.conditions} onChange={(conditions) => update({ waqf: { ...record.waqf, conditions } })} />
      <PairField label="Arazi notu" optional multiline value={record.waqf.landNote} onChange={(landNote) => update({ waqf: { ...record.waqf, landNote } })} />
      <ConfidenceField optional value={record.waqf.confidence} onChange={(confidence) => update({ waqf: { ...record.waqf, confidence } })} />
    </Group>
  );
}

function Visit({ record, update }: { record: R; update: Update }) {
  return (
    <Group>
      <ChoiceField
        label="Ortam"
        value={record.visit.setting ?? "none"}
        options={[
          { value: "none", label: "Belirtilmemiş" },
          { value: "indoor", label: "Kapalı" },
          { value: "outdoor", label: "Açık" },
          { value: "mixed", label: "Karma" },
        ]}
        onChange={(setting) => update({ visit: { ...record.visit, setting: setting === "none" ? null : setting } })}
      />
      <NumberField label="Süre (dakika)" value={record.visit.durationMin} onChange={(durationMin) => update({ visit: { ...record.visit, durationMin } })} placeholder="ör. 30" hint="En az 5" />
      <ChoiceField
        label="Giriş"
        value={record.visit.entranceFee ?? "none"}
        options={[
          { value: "none", label: "Belirtilmemiş" },
          { value: "free", label: "Ücretsiz" },
          { value: "paid", label: "Ücretli" },
          { value: "unknown", label: "Bilinmiyor" },
        ]}
        onChange={(fee) => update({ visit: { ...record.visit, entranceFee: fee === "none" ? null : fee } })}
      />
      <PairField label="Notlar" optional multiline value={record.visit.notes} onChange={(notes) => update({ visit: { ...record.visit, notes } })} placeholder="ör. Cuma namazı saatlerinde ziyarete kapalı" />
    </Group>
  );
}

const A11Y = [
  { value: "yes", label: "Var" },
  { value: "partial", label: "Kısmen" },
  { value: "no", label: "Yok" },
  { value: "unknown", label: "Bilinmiyor" },
] as const;

function Access({ record, update }: { record: R; update: Update }) {
  const access = record.accessibility;
  const setAccess = (change: Partial<R["accessibility"]>) => update({ accessibility: { ...access, ...change } });
  return (
    <View style={styles.stack}>
      <Group title="Erişilebilirlik" hint="Bilinmeyeni “Bilinmiyor” bırak; uygulama bunu “erişilebilir” diye okumaz.">
        <ChoiceField label="Tekerlekli sandalye" value={access.wheelchair} options={[...A11Y]} onChange={(wheelchair) => setAccess({ wheelchair })} />
        <ChoiceField label="Basamaksız giriş" value={access.stepFree} options={[...A11Y]} onChange={(stepFree) => setAccess({ stepFree })} />
        <ChoiceField label="Rampa" value={access.ramp} options={[...A11Y]} onChange={(ramp) => setAccess({ ramp })} />
        <ChoiceField label="Tuvalet" value={access.toilet} options={[...A11Y]} onChange={(toilet) => setAccess({ toilet })} />
        <Toggle label="Yerinde doğrulandı" value={access.verified} onChange={(verified) => setAccess({ verified })} />
        <PairField label="Notlar" optional multiline value={access.notes} onChange={(notes) => setAccess({ notes })} />
      </Group>
      <Group title="Sesli betimleme" hint="Kamerasız ziyaret için eserin sesli anlatımı; son sayfada “Sesli betimle” olarak çıkar.">
        <PairField label="Metin" optional multiline value={access.audioDescription} onChange={(audioDescription) => setAccess({ audioDescription })} />
      </Group>
      <Group title="Ses kapsülü" hint="Boş bırakılırsa eser türünün sesi çalar.">
        <TextField label="Ses" value={record.ambientSound.key} onChange={(key) => update({ ambientSound: { ...record.ambientSound, key } })} placeholder="ör. cami-ic-mekan" />
        <PairField label="Alt yazı" optional value={record.ambientSound.caption} onChange={(caption) => update({ ambientSound: { ...record.ambientSound, caption } })} />
      </Group>
    </View>
  );
}

function Tips({ record, update }: { record: R; update: Update }) {
  return (
    <ListField
      items={record.tips}
      onChange={(tips) => update({ tips })}
      make={() => ({ text: { tr: "", en: null }, origin: "official" as const, collectedAt: null })}
      titleOf={(t) => t.text.tr}
      addLabel="İpucu ekle"
      empty="İpucu yok."
      render={(t, set) => (
        <>
          <PairField label="İpucu" required multiline value={t.text} onChange={(text) => set({ ...t, text: text ?? { tr: "", en: null } })} />
          <ChoiceField
            label="Kaynağı"
            value={t.origin}
            options={[
              { value: "official", label: "Resmî" },
              { value: "field_visit", label: "Saha ziyareti" },
              { value: "visitor_reviews_summary", label: "Ziyaretçi yorumları" },
            ]}
            onChange={(origin) => set({ ...t, origin })}
          />
        </>
      )}
    />
  );
}

function Media({ record, update, base }: { record: R; update: Update; base: AssetDetail | null }) {
  const a = useAdminColors();
  const photos = new Map((base?.media ?? []).map((m) => [m.key, m]));
  return (
    <View style={styles.stack}>
      <View style={[styles.notice, { backgroundColor: a.blueSoft }]}>
        <Ionicons name="information-circle-outline" size={18} color={a.primary} aria-hidden />
        <Text style={{ flex: 1, fontSize: 13, lineHeight: 19 }}>Fotoğraf yükleme yakında. Şimdilik var olan fotoğrafların sırası, kapağı ve açıklamaları düzenlenebilir.</Text>
      </View>
      <ListField
        items={record.media}
        onChange={(media) => update({ media })}
        make={() => record.media[0]!}
        titleOf={(m) => m.caption.tr || m.key}
        addLabel=""
        empty="Bu eserin fotoğrafı yok. Uygulama fotoğrafsız tasarımı gösterir."
        render={(m, set) => {
          const photo = photos.get(m.key);
          return (
            <>
              {photo && (
                <View style={styles.photo}>
                  <AssetImage media={photo} fill />
                  {m.isCover && (
                    <View style={styles.photoBadge}>
                      <Badge tone="gold" label="Kapak" />
                    </View>
                  )}
                </View>
              )}
              <PairField label="Açıklama" value={m.caption} onChange={(caption) => set({ ...m, caption: caption ?? { tr: "", en: null } })} />
              <PairField label="Alternatif metin" value={m.alt} onChange={(alt) => set({ ...m, alt: alt ?? { tr: "", en: null } })} hint="Ekran okuyucu için fotoğrafta ne göründüğü." />
              <Toggle
                label="Kapak fotoğrafı"
                value={m.isCover}
                onChange={(on) => update({ media: record.media.map((other) => (other.key === m.key ? { ...other, isCover: on } : { ...other, isCover: on ? false : other.isCover })) })}
              />
            </>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  notice: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 16 },
  photo: { height: 180, borderRadius: 14, overflow: "hidden" },
  photoBadge: { position: "absolute", top: 8, left: 8 },
});
