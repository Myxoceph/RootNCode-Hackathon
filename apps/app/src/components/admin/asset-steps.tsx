import Ionicons from "@expo/vector-icons/Ionicons";
import type { AdminAsset, AdminAssetRecord, AssetDetail, MetaEnumsResponse } from "@vagabonds/contracts";
import { fontFamily, palette, Text } from "@vagabonds/ui";
import { useState, type ReactNode } from "react";
import { ADMIN_PHOTO_MAX_BYTES, ADMIN_PHOTO_MIN_SIDE, ADMIN_PHOTO_TYPES } from "@vagabonds/contracts";
import { Image, Linking, Platform, Pressable, StyleSheet, View } from "react-native";

import { AssetImage } from "@/components/asset-image";
import { type DossierPlacements } from "@/lib/dossier-photos";
import { assetCategory, type MapCategory } from "@/map/asset-category";

import { deleteAssetPhoto, uploadAssetPhoto } from "@/data/admin";

import { Badge, Button, Confirm, errorText, Field, Picker, Toggle, useAdminColors, type IconName } from "./kit";
import { usePanel } from "./panel";
import { BilingualField, Cell, ChoiceField, fieldId, newId, NumberField, RichTextField, Row, TagsField, TextField } from "./record-fields";

/**
 * The asset editor's questions, one per screen, in the order a visitor meets the asset: first its
 * pages, then its dossier. Each asks in plain words for what one part of the app shows, with an
 * example; the rarer details (the Hijri year, notes) follow under their own heading.
 * What the pages and the dossier both show (the year, who had it built, the chapters, the
 * measurements) is asked once.
 */

type R = AdminAssetRecord;
type Pair = { tr: string; en: string | null };

export interface StepProps {
  record: R;
  set: (change: Partial<R>) => void;
  meta: MetaEnumsResponse | null;
  /** The asset as last saved, for its photos. */
  base: AssetDetail | null;
  /** Every asset, to pick the complex this one belongs to. */
  assets: AdminAsset[];
  /** Photos set between the dossier's blocks, by photo key. */
  placements: DossierPlacements;
  setPlacements: (placements: DossierPlacements) => void;
  /** Blocks the admin adds to the dossier. */
  customBlocks: CustomBlockDraft[];
  setCustomBlocks: (blocks: CustomBlockDraft[]) => void;
  /** Scrolls the phone to a place and marks it. */
  showPlace: (section: Section, place: string) => void;
  /** The asset being edited; null while a new one is not saved yet (it has nowhere to put a photo). */
  assetId: string | null;
  /** A photo was uploaded or removed: the server already has it, the editor reads it again. */
  onPhotosChanged: () => Promise<void>;
}

export type Section = "pages" | "dossier";

/** A block the admin adds to the dossier, in both languages, after the block it names: the record's own. */
export type CustomBlockDraft = R["customBlocks"][number];

/** A name's or a candidate's note with one language changed; with neither language, no note. */
type NoteText = { tr: string; en: string | null } | null;
const withNote = (note: NoteText, change: { tr?: string; en?: string }): NoteText => {
  const tr = change.tr ?? note?.tr ?? "";
  const en = change.en ?? note?.en ?? "";
  return tr || en ? { tr, en: en || null } : null;
};

export interface Step {
  key: string;
  section: Section;
  /** The record's fields it asks for, as the phone names them (see `Editable`); a list's name covers its items. */
  fields: string[];
  /** Where the phone goes for it, on the pages and in the dossier. */
  phone: Partial<Record<Section, string>>;
  /** Short, for the list of steps. */
  title: string;
  question: string;
  /** Where the answer shows in the app. */
  shows: Array<{ in: Section; place: string }>;
  help: string;
  /** A screen that explains instead of asking. */
  intro?: boolean;
  required?: boolean;
  /** Asked only when this holds. */
  when?: (r: R) => boolean;
  done: (r: R) => boolean;
  Body: (props: StepProps) => ReactNode;
  More?: (props: StepProps) => ReactNode;
}

export const SECTION_TITLE: Record<Section, string> = { pages: "Kaydırmalı sayfalar", dossier: "Eser bilgileri" };

const has = (text: string | null | undefined) => !!text && text.trim() !== "";
const tr = (pair: Pair | null) => pair?.tr ?? "";
const withTr = (pair: Pair | null, text: string): Pair => ({ tr: text, en: pair?.en ?? null });
/** An optional text: null once both languages are empty. */
const optionalTr = (pair: Pair | null, text: string): Pair | null => (text.trim() === "" && !has(pair?.en) ? null : withTr(pair, text));
const withEn = (pair: Pair | null, text: string): Pair => ({ tr: pair?.tr ?? "", en: text === "" ? null : text });

/** An optional text's English: null once both languages are empty. */
const optionalEn = (pair: Pair | null, text: string): Pair | null => (text.trim() === "" && !has(pair?.tr) ? null : withEn(pair, text));

/** A text the record keeps in Turkish and English, as one box with a line for each. */
function PairField({ pair, onChange, optional, ...rest }: { pair: Pair | null; onChange: (pair: Pair | null) => void; optional?: boolean; label: string; id?: string; multiline?: boolean; placeholder?: string; placeholderEn?: string; hideLabel?: boolean; hint?: string; stacked?: boolean }) {
  return (
    <BilingualField
      {...rest}
      tr={pair?.tr ?? ""}
      en={pair?.en ?? ""}
      onTr={(text) => onChange(optional ? optionalTr(pair, text) : withTr(pair, text))}
      onEn={(text) => onChange(optional ? optionalEn(pair, text) : withEn(pair, text))}
    />
  );
}

const options = (list: Array<{ code: string; label: string }> | undefined) => (list ?? []).map((item) => ({ value: item.code, label: item.label }));

export const STEPS: Step[] = [
  {
    key: "name",
    section: "pages",
    fields: ["name", "subtitle", "altNames"],
    phone: { pages: "name", dossier: "altNames" },
    title: "Adı",
    question: "Eserin adı ne?",
    shows: [{ in: "pages", place: "Kapak" }],
    help: "Listelerde ve haritada da bu ad görünür.",
    required: true,
    done: (r) => has(r.name.tr),
    Body: ({ record, set }) => (
      <>
        <BilingualField id="name" label="Adı" tr={record.name.tr} en={record.name.en ?? ""} onTr={(text) => set({ name: withTr(record.name, text) })} onEn={(text) => set({ name: withEn(record.name, text) })} placeholder="ör. Ulu Cami" placeholderEn="ör. Grand Mosque of Bursa" />
        <BilingualField
          id="subtitle"
          label="Kısa bir alt başlık (isteğe bağlı)"
          tr={tr(record.subtitle)}
          en={record.subtitle?.en ?? ""}
          onTr={(text) => set({ subtitle: optionalTr(record.subtitle, text) })}
          onEn={(text) => set({ subtitle: record.subtitle || text ? withEn(record.subtitle, text) : null })}
          placeholder="ör. Bursa'nın İncisi"
          placeholderEn="ör. The Pearl of Bursa"
        />
      </>
    ),
    More: ({ record, set }) => (
      <>
        <Items
          id="altNames"
          title="Başka adlarla da biliniyor mu?"
          items={record.alternateNames}
          onChange={(alternateNames) => set({ alternateNames })}
          make={() => ({ name: { tr: "", en: null }, note: null })}
          addLabel="Başka bir ad ekle"
          columns={[{ label: "Ad" }, { label: "Nereden geliyor? (isteğe bağlı)" }]}
          cells={(n, update) => [
            <PairField key="name" label="Ad" hideLabel pair={n.name} onChange={(v) => update({ ...n, name: v! })} placeholder="ör. Bursa Ulu Camii" />,
            <BilingualField
              key="note"
              label="Nereden geliyor?"
              hideLabel
              tr={n.note?.tr ?? ""}
              en={n.note?.en ?? ""}
              onTr={(tr) => update({ ...n, note: withNote(n.note, { tr }) })}
              onEn={(en) => update({ ...n, note: withNote(n.note, { en }) })}
              placeholder="ör. Evliya Çelebi'nin benzetmesi"
              placeholderEn="ör. Evliya Çelebi's simile"
            />,
          ]}
        />
      </>
    ),
  },
  {
    key: "type",
    section: "pages",
    fields: ["type"],
    phone: { pages: "type" },
    title: "Türü",
    question: "Bu ne tür bir yapı?",
    shows: [{ in: "pages", place: "Kapak, adın üstündeki etiket" }],
    help: "Uygulamadaki ortam sesi de türe göre seçilir.",
    required: true,
    done: (r) => has(r.type),
    Body: ({ record, set, meta }) => <TypeTiles options={options(meta?.assetTypes)} value={record.type} onChange={(type) => set({ type })} loading={!meta} />,
    More: ({ record, set, meta }) => {
      const types = options(meta?.assetTypes);
      return (
        <>
          <Row>
            <Cell>
              <Picker label="Dönemi" value={record.era} options={options(meta?.eras)} onChange={(era) => set({ era })} allowEmpty placeholder="Belirtilmemiş" hint="Zaman Yolculuğu'nda eserin yerini belirler." />
            </Cell>
            <Cell>
              <View style={{ gap: 8 }}>
                <Picker
                  label="Başka bir türe de giriyor mu?"
                  value={null}
                  options={types.filter((t) => t.value !== record.type && !record.secondaryTypes.includes(t.value))}
                  onChange={(code) => code && set({ secondaryTypes: [...record.secondaryTypes, code] })}
                  placeholder="Tür ekle"
                />
                {record.secondaryTypes.length > 0 && (
                  <View style={styles.wrap}>
                    {record.secondaryTypes.map((code) => (
                      <Button key={code} small kind="secondary" icon="close" label={types.find((t) => t.value === code)?.label ?? code} onPress={() => set({ secondaryTypes: record.secondaryTypes.filter((c) => c !== code) })} />
                    ))}
                  </View>
                )}
              </View>
            </Cell>
          </Row>
          <TagsField label="Arama için anahtar kelimeler" values={record.tags} onChange={(tags) => set({ tags })} placeholder="ör. çok kubbeli, hat sanatı (Enter ile ekle)" />
        </>
      );
    },
  },
  {
    key: "place",
    section: "pages",
    fields: ["place", "address", "parent", "coords"],
    phone: { pages: "place", dossier: "address" },
    title: "Yeri",
    question: "Eser nerede?",
    shows: [{ in: "pages", place: "Kapak, adın altı" }],
    help: "Eserin bulunduğu il ve ilçe.",
    required: true,
    done: (r) => has(r.city) && has(r.district),
    Body: ({ record, set, meta }) => (
      <Row>
        <Cell>
          <Picker label="İl" value={record.city || null} options={options(meta?.cities)} onChange={(city) => set({ city: city ?? "" })} placeholder={meta ? "İl seç" : "Yükleniyor…"} />
        </Cell>
        <Cell>
          <Field nativeID={fieldId("place")} label="İlçe" value={record.district} onChangeText={(district) => set({ district })} placeholder="ör. Osmangazi" />
        </Cell>
      </Row>
    ),
    More: ({ record, set, assets, meta }) => (
      <>
        <Box icon="home-outline" title="Adresi" phone="address" note="Eser bilgilerinde, künyede görünür.">
          <Row>
            <Cell>
              <TextField label="Mahalle" value={record.neighborhood} onChange={(neighborhood) => set({ neighborhood })} placeholder="ör. Tayakadın" />
            </Cell>
            <Cell grow={2}>
              <TextField id="address" label="Açık adres" value={record.address} onChange={(address) => set({ address })} placeholder="Cadde, sokak, no" />
            </Cell>
          </Row>
        </Box>
        <Coordinates value={record.coordinates} onChange={(coordinates) => set({ coordinates })} />
        <Box icon="git-network-outline" title="Külliyesi" phone="parent" note="Bir külliyenin parçasıysa, eser bilgilerinde külliyesine bağlanır.">
          <View nativeID={fieldId("parent")} />
          <Picker
            label="Bir külliyenin parçası mı?"
            hideLabel
            value={record.parentId}
            options={assets
              // The panel's list names the type, so a külliye is matched by its name.
              .filter((asset) => asset.type === (meta?.assetTypes.find((t) => t.code === "kulliye")?.label ?? "Külliye") || asset.id === record.parentId)
              .sort((one, other) => one.name.localeCompare(other.name, "tr"))
              .map((asset) => ({ value: asset.id, label: `${asset.name} · ${asset.district}` }))}
            onChange={(parentId) => set({ parentId })}
            allowEmpty
            placeholder="Hayır, tek başına bir yapı"
          />
        </Box>
      </>
    ),
  },
  {
    key: "summary",
    section: "pages",
    fields: ["summary"],
    phone: { pages: "summary" },
    title: "Kısa tanıtım",
    question: "Eseri bir iki cümleyle tanıt.",
    shows: [{ in: "pages", place: "Kapaktan sonraki ilk sayfa" }],
    help: "Ne olduğunu, ne zaman ve kimin için yapıldığını bir iki cümleyle söyle.",
    required: true,
    done: (r) => has(r.summary.tr),
    Body: ({ record, set }) => (
      <BilingualField
        id="summary"
        label="Kısa tanıtım"
        multiline
        tr={record.summary.tr}
        en={record.summary.en ?? ""}
        onTr={(text) => set({ summary: withTr(record.summary, text) })}
        onEn={(text) => set({ summary: withEn(record.summary, text) })}
        placeholder="ör. Osmanlıların Bursa'da yaptırdığı ilk büyük cami. Yıldırım Bayezid'in 1399'da tamamlattığı yirmi kubbeli yapı…"
        placeholderEn="ör. The first great mosque the Ottomans built in Bursa…"
      />
    ),
  },
  {
    key: "built",
    section: "pages",
    // "cover:year" is the year on the cover: picking it opens this, but the phone shows the figures page for it.
    fields: ["year", "cover:year", "founder", "architect", "dating"],
    phone: { pages: "year", dossier: "year" },
    title: "Yapımı",
    question: "Ne zaman yapıldı, kim yaptırdı?",
    shows: [{ in: "pages", place: "Rakamlar sayfası" }, { in: "dossier", place: "Künye" }],
    help: "Bilmediklerini boş bırak.",
    done: (r) => r.dating.startYear !== null || has(r.dating.display?.tr) || has(r.founder.name),
    Body: ({ record, set }) => (
      <>
        <Row>
          <Cell>
            <NumberField id="year" label="Yapım yılı" value={record.dating.startYear} onChange={(startYear) => set({ dating: { ...record.dating, startYear } })} placeholder="ör. 1396" />
          </Cell>
          <Cell grow={1.6}>
            <TextField id="founder" label="Kim yaptırdı?" value={record.founder.name} onChange={(name) => set({ founder: { ...record.founder, name } })} placeholder="ör. Yıldırım Bayezid" />
          </Cell>
          <Cell grow={1.6}>
            <TextField id="architect" label="Mimarı (biliniyorsa)" value={record.architect.name} onChange={(name) => set({ architect: { ...record.architect, name } })} placeholder="ör. Ali Neccar" />
          </Cell>
        </Row>
      </>
    ),
    More: ({ record, set }) => (
      <>
        <Box icon="calendar-outline" title="Tarihin ayrıntıları" phone="year" note="Yıl kesin değilse ya da kitabede başka türlü yazıyorsa.">
          <PairField
            id="dating"
            label="Tarih, kitabedeki gibi"
            pair={record.dating.display}
            optional
            onChange={(display) => set({ dating: { ...record.dating, display } })}
            placeholder="ör. H. 802 / M. 1399-1400"
            placeholderEn="ör. AH 802 / AD 1399-1400"
            hint="Yazılırsa eser bilgilerinde yıl yerine bu görünür."
          />
          <PairField
            label="Bu tarih nereden biliniyor?"
            pair={record.dating.basis}
            optional
            onChange={(basis) => set({ dating: { ...record.dating, basis } })}
            placeholder="ör. Minber kitabesindeki tarih"
            placeholderEn="ör. The date on the minbar inscription"
          />
          <Row>
            <Cell>
              <NumberField label="Bitiş yılı" value={record.dating.endYear} onChange={(endYear) => set({ dating: { ...record.dating, endYear } })} placeholder="ör. 1400" />
            </Cell>
            <Cell>
              <NumberField label="Hicrî yılı" value={record.dating.hijriYear} onChange={(hijriYear) => set({ dating: { ...record.dating, hijriYear } })} placeholder="ör. 802" />
            </Cell>
            <Cell>
              <NumberField label="Yüzyılı" value={record.dating.century} onChange={(century) => set({ dating: { ...record.dating, century } })} placeholder="ör. 14" hint="Yıl bilinmiyorsa" />
            </Cell>
          </Row>
        </Box>
        <Box icon="person-outline" title="Yaptıran ve mimar" phone="founder">
          <TextField label="Yaptıranın unvanı" value={record.founder.role} onChange={(role) => set({ founder: { ...record.founder, role } })} placeholder="ör. Osmanlı padişahı" />
          <Items
            id="architect:candidates"
            title="Mimar kesin bilinmiyorsa adı geçenler"
            items={record.architect.candidates}
            onChange={(candidates) => set({ architect: { ...record.architect, candidates } })}
            make={() => ({ name: "", note: null })}
            addLabel="Bir ad ekle"
            columns={[{ label: "Ad" }, { label: "Not (isteğe bağlı)" }]}
            cells={(c, update) => [
              <Field key="name" label="Ad" hideLabel value={c.name} onChangeText={(name) => update({ ...c, name })} />,
              <BilingualField key="note" label="Not" hideLabel tr={c.note?.tr ?? ""} en={c.note?.en ?? ""} onTr={(tr) => update({ ...c, note: withNote(c.note, { tr }) })} onEn={(en) => update({ ...c, note: withNote(c.note, { en }) })} />,
            ]}
          />
        </Box>
      </>
    ),
  },
  {
    key: "facts",
    section: "pages",
    fields: ["fact"],
    phone: { pages: "fact", dossier: "fact" },
    title: "Sayılarla",
    question: "Eseri anlatan sayılar var mı?",
    shows: [{ in: "pages", place: "Rakamlar sayfası (ilk ikisi)" }, { in: "dossier", place: "Ölçüler (hepsi)" }],
    help: "Kubbe çapı, minare sayısı gibi.",
    done: (r) => r.facts.length > 0,
    Body: ({ record, set }) => (
      <Items
        items={record.facts}
        onChange={(facts) => set({ facts })}
        make={() => ({ key: newId("bilgi"), label: { tr: "", en: null }, value: "", unit: null, note: null, confidence: "certain" as const })}
        addLabel="Bir sayı ekle"
        phone={(f) => `fact:${f.key}`}
        columns={[{ label: "Ne?", grow: 2.2 }, { label: "Kaç?", grow: 1 }, { label: "Birimi", grow: 0.8 }]}
        cells={(f, update) => [
          <PairField key="label" id={`fact:${f.key}`} label="Ne?" hideLabel pair={f.label} onChange={(v) => update({ ...f, label: v! })} placeholder="ör. Kubbe sayısı" />,
          <Field key="value" label="Kaç?" hideLabel value={f.value} onChangeText={(value) => update({ ...f, value })} placeholder="ör. 20" />,
          <Field key="unit" label="Birimi" hideLabel value={f.unit ?? ""} onChangeText={(unit) => update({ ...f, unit: unit || null })} placeholder="ör. m" />,
        ]}
      />
    ),
  },
  {
    key: "media",
    section: "pages",
    fields: ["media"],
    phone: { pages: "media" },
    title: "Fotoğraflar",
    question: "Fotoğrafları düzenle.",
    shows: [{ in: "pages", place: "Sayfaların arka planı ve galeri" }],
    help: "Kapak fotoğrafı ilk sayfada durur. Yeni fotoğrafı buradan yükleyebilirsin; yüklenen hemen kaydedilir.",
    done: (r) => r.media.length > 0,
    Body: (props) => (
      <View nativeID={fieldId("media")}>
        <Photos {...props} />
      </View>
    ),
  },
  {
    key: "sections",
    section: "pages",
    fields: ["section"],
    phone: { pages: "section", dossier: "section" },
    title: "Hikâyesi",
    question: "Eserin hikâyesini yaz.",
    shows: [{ in: "pages", place: "Hikâye sayfaları (ilk üç konu)" }, { in: "dossier", place: "Tarihçe (hepsi, tam metin)" }],
    help: "Konu konu böl: tarihçesi, mimarisi, ilginç bir ayrıntısı…",
    done: (r) => r.sections.length > 0,
    Body: ({ record, set }) => (
      <Items
        items={record.sections}
        onChange={(sections) => set({ sections })}
        make={() => ({ id: newId("bolum"), title: { tr: "", en: null }, body: { tr: "", en: null }, confidence: "certain" as const })}
        addLabel="Bir konu ekle"
        reorder
        summary={(s) => s.title.tr}
        keyOf={(s) => s.id}
        phone={(item) => `section:${item.id}:body`}
        noun="Konu"
        render={(s, update) => (
          <>
            <PairField id={`section:${s.id}:title`} label="Konunun başlığı" pair={s.title} onChange={(v) => update({ ...s, title: v! })} placeholder="ör. Tarihçe" />
            <PairField id={`section:${s.id}:body`} label="Metni" multiline pair={s.body} onChange={(v) => update({ ...s, body: v! })} placeholder="ör. Cami, Yıldırım Bayezid'in Niğbolu zaferinden sonra…" />
          </>
        )}
      />
    ),
  },
  {
    key: "highlights",
    section: "pages",
    fields: ["highlight"],
    phone: { pages: "highlight" },
    title: "Bakılacak yerler",
    question: "Ziyaretçi yerinde neye mutlaka bakmalı?",
    shows: [{ in: "pages", place: "“Yerinde bakın” sayfaları" }],
    help: "Her biri ayrı bir sayfa olur.",
    done: (r) => r.highlights.length > 0,
    Body: ({ record, set }) => (
      <Items
        items={record.highlights}
        onChange={(highlights) => set({ highlights })}
        make={() => ({ feature: "diger", title: { tr: "", en: null }, hint: { tr: "", en: null }, sectionId: null })}
        addLabel="Bakılacak bir yer ekle"
        phone={(_, i) => `highlight:${i}:title`}
        noun="Bakılacak yer"
        render={(h, update, i) => (
          <>
            <Row>
              <Cell grow={1.4}>
                <PairField id={`highlight:${i}:title`} label="Ne?" pair={h.title} onChange={(v) => update({ ...h, title: v! })} placeholder="ör. Kündekâri minber" />
              </Cell>
              <Cell>
                <Picker
                  label="Hikâyede anlatıldığı konu (isteğe bağlı)"
                  value={h.sectionId}
                  options={record.sections.map((s) => ({ value: s.id, label: s.title.tr || "Başlıksız konu" }))}
                  onChange={(sectionId) => update({ ...h, sectionId })}
                  allowEmpty
                  placeholder="Yok"
                  hint="Seçilirse sayfada “Devamını oku” çıkar."
                />
              </Cell>
            </Row>
            <PairField id={`highlight:${i}:hint`} label="Nerede, nasıl bulunur?" pair={h.hint} onChange={(v) => update({ ...h, hint: v! })} placeholder="ör. Mihrabın sağında, ahşap" />
          </>
        )}
      />
    ),
  },
  {
    key: "visit",
    section: "pages",
    fields: ["visit"],
    phone: { pages: "visit" },
    title: "Ziyaret",
    question: "Ziyaret etmek isteyen neyi bilmeli?",
    shows: [{ in: "pages", place: "Son sayfa, “Keşfe çık”" }],
    help: "Bilmediklerini boş bırak.",
    done: (r) => r.visit.durationMin !== null || r.visit.entranceFee !== null || has(r.visit.notes?.tr),
    Body: ({ record, set }) => (
      <>
        <View style={styles.visitRow}>
          <Box icon="time-outline" title="Süresi" phone="visit" tile={170}>
            <NumberField id="visit" label="Gezmek kaç dakika sürer?" value={record.visit.durationMin} onChange={(durationMin) => set({ visit: { ...record.visit, durationMin } })} placeholder="ör. 30" hint="En az 5" />
          </Box>
          <Box icon="ticket-outline" title="Girişi" phone="visit" tile={340}>
            <ChoiceField
              label="Giriş ücretli mi?"
              value={record.visit.entranceFee ?? "none"}
              options={[
                { value: "free", label: "Ücretsiz" },
                { value: "paid", label: "Ücretli" },
                { value: "unknown", label: "Bilmiyorum" },
                { value: "none", label: "Boş bırak" },
              ]}
              onChange={(fee) => set({ visit: { ...record.visit, entranceFee: fee === "none" ? null : fee } })}
            />
          </Box>
          <Box icon="sunny-outline" title="Gezilen yer" phone="visit" tile={340}>
            <ChoiceField
              label="İçeride mi, dışarıda mı?"
              value={record.visit.setting ?? "none"}
              options={[
                { value: "indoor", label: "Kapalı alan" },
                { value: "outdoor", label: "Açık alan" },
                { value: "mixed", label: "İkisi de" },
                { value: "none", label: "Boş bırak" },
              ]}
              onChange={(setting) => set({ visit: { ...record.visit, setting: setting === "none" ? null : setting } })}
            />
          </Box>
        </View>
        <PairField
          id="visit:notes"
          label="Bilmesi gereken bir şey var mı? (isteğe bağlı)"
          multiline
          pair={record.visit.notes}
          optional
          onChange={(notes) => set({ visit: { ...record.visit, notes } })}
          placeholder="ör. Cuma namazı saatlerinde ziyarete kapalı"
          placeholderEn="ör. Closed to visitors during Friday prayers"
        />
      </>
    ),
  },
  {
    key: "audio",
    section: "pages",
    fields: ["audio"],
    phone: { pages: "audio" },
    title: "Sesli anlatım",
    question: "Göremeyen bir ziyaretçiye eseri nasıl anlatırdın?",
    shows: [{ in: "pages", place: "Son sayfa, “Sesli betimle”" }],
    help: "Bu metin ziyaretçiye sesli okunur.",
    done: (r) => has(r.accessibility.audioDescription?.tr),
    Body: ({ record, set }) => (
      <PairField
        id="audio"
        label="Sesli anlatım"
        multiline
        pair={record.accessibility.audioDescription}
        optional
        onChange={(audioDescription) => set({ accessibility: { ...record.accessibility, audioDescription } })}
        placeholder="ör. Kapıdan girince geniş, yüksek bir mekândasın. Tavanda yirmi kubbe sıralanır…"
        placeholderEn="ör. Through the door you are in a wide, high hall. Twenty domes line the ceiling…"
      />
    ),
    More: ({ record, set }) => (
      <Box icon="musical-notes-outline" title="Ortam sesi" phone="audio" note="Sayfalar açıkken arkada çalan ses.">
        <TextField
          label="Çalacak ortam sesi"
          value={record.ambientSound.key}
          onChange={(key) => set({ ambientSound: { ...record.ambientSound, key } })}
          placeholder="ör. cami-ic-mekan"
          hint="Boş bırakılırsa eser türünün sesi çalar."
        />
        <PairField
          label="Sesin alt yazısı"
          pair={record.ambientSound.caption}
          optional
          onChange={(caption) => set({ ambientSound: { ...record.ambientSound, caption } })}
          placeholder="ör. Kubbenin altında su sesi"
          placeholderEn="ör. Water under the dome"
        />
      </Box>
    ),
  },
  {
    key: "tips",
    section: "pages",
    fields: ["tip"],
    phone: { pages: "tip" },
    title: "İpuçları",
    question: "Ziyaretçiye bir ipucun var mı?",
    shows: [{ in: "pages", place: "Son sayfa, ziyaretçi notları" }],
    help: "Ziyareti kolaylaştıracak kısa bir bilgi.",
    done: (r) => r.tips.length > 0,
    Body: ({ record, set }) => (
      <Items
        items={record.tips}
        onChange={(tips) => set({ tips })}
        make={() => ({ text: { tr: "", en: null }, origin: "official" as const, collectedAt: null })}
        addLabel="Bir ipucu ekle"
        phone={() => "tip"}
        columns={[{ label: "İpucu" }]}
        cells={(t, update, i) => [<PairField key="text" id={`tip:${i}`} label="İpucu" hideLabel multiline pair={t.text} onChange={(v) => update({ ...t, text: v! })} placeholder="ör. Sabah erken saatlerde ışık hat levhalarına vurur." />]}
      />
    ),
  },
  {
    key: "dossier",
    section: "dossier",
    fields: [],
    phone: { dossier: "year" },
    title: "Eser bilgileri nedir?",
    question: "Şimdi sıra eser bilgilerinde.",
    shows: [{ in: "dossier", place: "Eser bilgileri" }],
    help: "Bundan sonraki sorular kaydırmalı sayfalarda değil, eser bilgilerinde görünür.",
    intro: true,
    done: () => true,
    Body: () => <DossierIntro />,
  },
  {
    key: "timeline",
    section: "dossier",
    fields: ["event"],
    phone: { dossier: "event" },
    title: "Önemli tarihler",
    question: "Eserin başından neler geçti?",
    shows: [{ in: "dossier", place: "Zaman çizelgesi" }],
    help: "Yapım, onarım, deprem, yangın gibi olaylar; yıllara göre sıralanır.",
    done: (r) => r.timeline.length > 0,
    Body: ({ record, set, meta }) => (
      <Items
        items={record.timeline}
        onChange={(timeline) => set({ timeline })}
        make={() => ({ id: newId("olay"), year: record.dating.startYear ?? new Date().getFullYear(), date: null, hijri: null, type: "construction", title: { tr: "", en: null }, note: null, confidence: "certain" as const })}
        addLabel="Bir olay ekle"
        phone={(e) => `event:${e.id}`}
        columns={[{ label: "Yıl", grow: 0.7 }, { label: "Ne oldu?", grow: 3 }, { label: "Ne tür bir olay?", grow: 1.4 }]}
        cells={(e, update) => [
          <NumberField key="year" label="Yıl" hideLabel value={e.year} onChange={(year) => year !== null && update({ ...e, year })} />,
          <PairField key="title" id={`event:${e.id}`} label="Ne oldu?" hideLabel pair={e.title} onChange={(v) => update({ ...e, title: v! })} placeholder="ör. Büyük depremde minareleri yıkıldı" />,
          <Picker key="type" label="Ne tür bir olay?" hideLabel float value={e.type} options={options(meta?.timelineEventTypes)} onChange={(type) => type && update({ ...e, type })} />,
        ]}
      />
    ),
  },
  {
    key: "people",
    section: "dossier",
    fields: ["person"],
    phone: { dossier: "person" },
    title: "Kişiler",
    question: "Eserle ilgili başka kimler var?",
    shows: [{ in: "dossier", place: "Kişiler" }],
    help: "Hattatı, ustası, onu onaranlar…",
    done: (r) => r.people.length > 0,
    Body: ({ record, set }) => (
      <Items
        items={record.people}
        onChange={(people) => set({ people })}
        make={() => ({ name: "", role: { tr: "", en: null } })}
        addLabel="Bir kişi ekle"
        phone={(_, i) => `person:${i}`}
        columns={[{ label: "Adı" }, { label: "Eserle ilgisi" }]}
        cells={(p, update, i) => [
          <Field key="name" nativeID={fieldId(`person:${i}`)} label="Adı" hideLabel value={p.name} onChangeText={(name) => update({ ...p, name })} placeholder="ör. Ahmed Karahisarî" />,
          <PairField key="role" label="Eserle ilgisi" hideLabel pair={p.role} onChange={(v) => update({ ...p, role: v! })} placeholder="ör. Hattat" />,
        ]}
      />
    ),
  },
  {
    key: "inscriptions",
    section: "dossier",
    fields: ["inscription"],
    phone: { dossier: "inscription" },
    title: "Kitabeler",
    question: "Eserin üzerinde yazı (kitabe) var mı?",
    shows: [{ in: "dossier", place: "Kitabeler" }],
    help: "Taşın Dili kamerası da bunları okur.",
    done: (r) => r.inscriptions.length > 0,
    Body: ({ record, set }) => (
      <Items
        items={record.inscriptions}
        onChange={(inscriptions) => set({ inscriptions })}
        make={() => ({ id: newId("kitabe"), location: { tr: "", en: null }, language: "ar" as const, script: null, transliteration: null, translation: null, author: null, hijriYear: null, gregorian: null, note: null })}
        addLabel="Bir kitabe ekle"
        phone={(n) => `inscription:${n.id}`}
        noun="Kitabe"
        render={(n, update) => (
          <>
            <Row>
              <Cell grow={2}>
                <PairField id={`inscription:${n.id}`} label="Nerede?" pair={n.location} onChange={(v) => update({ ...n, location: v! })} placeholder="ör. Taç kapının üzerinde" />
              </Cell>
              <Cell>
                <Picker label="Hangi dilde?" value={n.language} options={LANGUAGES} onChange={(language) => language && update({ ...n, language: language as typeof n.language })} />
              </Cell>
            </Row>
            <PairField label="Anlamı" multiline pair={n.translation} optional onChange={(v) => update({ ...n, translation: v })} placeholder="ör. Bu hayırlı hamamı … yaptırdı, sene 1301." />
            <Inline label="Kitabenin ayrıntıları">
              <TextField label="Okunuşu" multiline value={n.transliteration} onChange={(transliteration) => update({ ...n, transliteration })} placeholder="Kitabede yazanın Latin harfleriyle okunuşu" />
              <Row>
                <Cell basis={130}>
                  <TextField label="Yazı türü" value={n.script} onChange={(script) => update({ ...n, script })} placeholder="ör. sülüs" />
                </Cell>
                <Cell basis={130}>
                  <TextField label="Yazan" value={n.author} onChange={(author) => update({ ...n, author })} placeholder="ör. Hattat Mehmed" />
                </Cell>
                <Cell basis={130}>
                  <NumberField label="Hicrî yılı" value={n.hijriYear} onChange={(hijriYear) => update({ ...n, hijriYear })} placeholder="ör. 1301" />
                </Cell>
                <Cell basis={130}>
                  <TextField label="Miladî yılı" value={n.gregorian} onChange={(gregorian) => update({ ...n, gregorian })} placeholder="ör. 1884" />
                </Cell>
              </Row>
            </Inline>
          </>
        )}
      />
    ),
  },
  {
    key: "waqf",
    section: "dossier",
    fields: ["waqf"],
    phone: { dossier: "waqf" },
    title: "Vakfı",
    question: "Eserin bir vakfı var mı?",
    shows: [{ in: "dossier", place: "Vakıf" }],
    help: "Eseri yaşatmak için kurulan vakıf ve kuruluş belgesi (vakfiye).",
    done: (r) => has(r.waqf.name) || has(r.waqf.deedExcerpt?.tr),
    Body: ({ record, set }) => (
      <Row>
        <Cell grow={2}>
          <TextField id="waqf" label="Vakfın adı" value={record.waqf.name} onChange={(name) => set({ waqf: { ...record.waqf, name } })} placeholder="ör. Yıldırım Bayezid Vakfı" />
        </Cell>
        <Cell>
          <TextField label="Vakfiyenin tarihi" value={record.waqf.deedDate} onChange={(deedDate) => set({ waqf: { ...record.waqf, deedDate } })} placeholder="ör. 1400" />
        </Cell>
      </Row>
    ),
    More: ({ record, set }) => (
      <Box icon="document-text-outline" title="Vakfiye" phone="waqf" note="Vakfın kuruluş belgesinde yazanlar.">
        <PairField label="Vakfiyeden bir alıntı" multiline pair={record.waqf.deedExcerpt} optional onChange={(deedExcerpt) => set({ waqf: { ...record.waqf, deedExcerpt } })} placeholder="ör. “…hamamın gelirinden imarete her gün…”" />
        <PairField label="Vakfın şartları" multiline pair={record.waqf.conditions} optional onChange={(conditions) => set({ waqf: { ...record.waqf, conditions } })} placeholder="ör. Gelirin yarısı onarıma ayrılır" placeholderEn="ör. Half of the income goes to repairs" />
        <PairField label="Vakfın arazileri" multiline pair={record.waqf.landNote} optional onChange={(landNote) => set({ waqf: { ...record.waqf, landNote } })} placeholder="ör. İnegöl'de iki köy" placeholderEn="ör. Two villages in İnegöl" />
      </Box>
    ),
  },
  {
    key: "legends",
    section: "dossier",
    fields: ["legend"],
    phone: { dossier: "legend" },
    title: "Rivayetler",
    question: "Eser hakkında anlatılan bir efsane ya da rivayet var mı?",
    shows: [{ in: "dossier", place: "Rivayetler" }],
    help: "Her zaman “rivayet” diye işaretlenir; tarih gibi anlatılmaz.",
    done: (r) => r.legends.length > 0,
    Body: ({ record, set }) => (
      <Items
        items={record.legends}
        onChange={(legends) => set({ legends })}
        make={() => ({ id: newId("rivayet"), title: { tr: "", en: null }, body: { tr: "", en: null }, verdict: "folk_belief" as const })}
        addLabel="Bir rivayet ekle"
        phone={(l) => `legend:${l.id}`}
        noun="Rivayet"
        render={(l, update) => (
          <>
            <PairField id={`legend:${l.id}`} label="Başlığı" pair={l.title} onChange={(v) => update({ ...l, title: v! })} placeholder="ör. Yirmi cami yerine yirmi kubbe" />
            <PairField label="Anlatılan" multiline pair={l.body} onChange={(v) => update({ ...l, body: v! })} />
            <ChoiceField
              label="Doğru mu?"
              value={l.verdict}
              options={[
                { value: "folk_belief", label: "Halk arasında anlatılır" },
                { value: "unverified", label: "Doğrulanmadı" },
                { value: "refuted_by_source", label: "Kaynaklar yalanlıyor" },
              ]}
              onChange={(verdict) => update({ ...l, verdict })}
            />
          </>
        )}
      />
    ),
  },
  {
    key: "access",
    section: "dossier",
    fields: ["access"],
    phone: { dossier: "access" },
    title: "Engelli erişimi",
    question: "Eser engelli ziyaretçiler için uygun mu?",
    shows: [{ in: "dossier", place: "Erişilebilirlik" }],
    help: "Bilmediğini “Bilmiyorum” bırak; uygulama bunu “uygun” diye okumaz.",
    done: (r) => [r.accessibility.wheelchair, r.accessibility.stepFree, r.accessibility.ramp, r.accessibility.toilet].some((v) => v !== "unknown"),
    Body: ({ record, set }) => {
      const a = useAdminColors();
      const access = record.accessibility;
      const setAccess = (change: Partial<R["accessibility"]>) => set({ accessibility: { ...access, ...change } });
      return (
        <>
          <View nativeID={fieldId("access")} style={styles.visitRow}>
            <Box icon="accessibility-outline" title="Tekerlekli sandalye" tile={340}>
              <ChoiceField label="Tekerlekli sandalyeyle gezilebilir mi?" value={access.wheelchair} options={[...A11Y]} onChange={(wheelchair) => setAccess({ wheelchair })} />
            </Box>
            <Box icon="footsteps-outline" title="Giriş" tile={340}>
              <ChoiceField label="Girişte basamak yok mu?" value={access.stepFree} options={[...A11Y]} onChange={(stepFree) => setAccess({ stepFree })} />
            </Box>
            <Box icon="trending-up-outline" title="Rampa" tile={340}>
              <ChoiceField label="Rampa var mı?" value={access.ramp} options={[...A11Y]} onChange={(ramp) => setAccess({ ramp })} />
            </Box>
            <Box icon="water-outline" title="Tuvalet" tile={340}>
              <ChoiceField label="Engelli tuvaleti var mı?" value={access.toilet} options={[...A11Y]} onChange={(toilet) => setAccess({ toilet })} />
            </Box>
          </View>
          <View style={[styles.verified, { borderColor: access.verified ? a.success : a.line, backgroundColor: access.verified ? a.roseSoft : "transparent" }]}>
            <Toggle label="Bunları yerinde gördüm" value={access.verified} onChange={(verified) => setAccess({ verified })} />
          </View>
        </>
      );
    },
    More: ({ record, set }) => (
      <PairField
        label="Erişim hakkında not"
        multiline
        placeholder="ör. Yan kapıdan basamaksız girilir; görevliden açmasını isteyin."
        placeholderEn="ör. Step-free entry by the side door; ask the attendant to open it."
        pair={record.accessibility.notes}
        optional
        onChange={(notes) => set({ accessibility: { ...record.accessibility, notes } })}
      />
    ),
  },
  {
    key: "custom",
    section: "dossier",
    fields: ["custom"],
    phone: { dossier: "custom" },
    title: "Yeni bölümler",
    question: "Eser bilgilerine kendi bölümünü eklemek ister misin?",
    shows: [{ in: "dossier", place: "Seçtiğin bölümden sonra, ayrı bir bölüm olarak" }],
    help: "Tarihçe, Zaman çizelgesi gibi ana bir bölüm olur. Metni alt başlık, kalın yazı, liste ve alıntıyla düzenleyebilirsin.",
    done: (r) => r.customBlocks.length > 0,
    Body: (props) => <CustomBlocks {...props} />,
  },
  {
    key: "dossierPhotos",
    section: "dossier",
    fields: ["photo-in"],
    phone: { dossier: "photo-in" },
    title: "Eser bilgilerindeki fotoğraflar",
    question: "Eser bilgilerinde bölümlerin arasına fotoğraf koymak ister misin?",
    shows: [{ in: "dossier", place: "Seçtiğin bölümün hemen altı" }],
    help: "Bir yer seç, oraya koyacağın fotoğrafı seç. Bir yere birden çok fotoğraf koyabilirsin.",
    when: (r) => r.media.length > 0,
    done: (r) => r.media.some((m) => m.dossierAfter !== null),
    Body: (props) => <DossierPhotos {...props} />,
  },
];

const A11Y = [
  { value: "yes", label: "Evet" },
  { value: "partial", label: "Kısmen" },
  { value: "no", label: "Hayır" },
  { value: "unknown", label: "Bilmiyorum" },
] as const;

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


/* ───────────── Pieces ───────────── */

/** What the dossier is and how a visitor gets to it, before the questions that fill it. */
function DossierIntro() {
  const a = useAdminColors();
  return (
    <View style={{ gap: 16 }}>
      <View style={styles.introRow}>
        <View style={[styles.introBox, { backgroundColor: a.goldSoft }]}>
          <Ionicons name="swap-vertical-outline" size={22} color={a.goldMark} aria-hidden />
          <Text style={styles.introTitle}>Kaydırmalı sayfalar</Text>
          <Text color="textSecondary" style={styles.note}>
            Kısa sayfalar, kaydırarak. Az yazı, büyük fotoğraf. Şimdiye kadar doldurdukların.
          </Text>
        </View>
        <View style={styles.introArrow}>
          <Ionicons name="arrow-forward" size={20} color={a.textSecondary} aria-hidden />
          <Text color="textSecondary" style={{ fontSize: 11.5, textAlign: "center" }}>
            “Eser bilgileri” düğmesi
          </Text>
        </View>
        <View style={[styles.introBox, { backgroundColor: a.blueSoft }]}>
          <Ionicons name="document-text-outline" size={22} color={a.primary} aria-hidden />
          <Text style={styles.introTitle}>Eser bilgileri</Text>
          <Text color="textSecondary" style={styles.note}>
            Merak edenler için uzun okuma: tarihler, kişiler, kitabeler, vakıf, rivayetler.
          </Text>
        </View>
      </View>
      <Text style={{ fontSize: 14, lineHeight: 21 }}>
        Ziyaretçi kaydırmalı sayfalardaki “Eser bilgileri” düğmesine basınca bu bölüm açılır. Sağdaki telefon da şimdi eser bilgilerini gösteriyor; yazdıkların orada görünecek. Bu soruların hepsi isteğe bağlı.
      </Text>
    </View>
  );
}

/** The kinds of place the types fall into, as the city map tells them apart, in the order shown. */
const TYPE_GROUPS: Array<{ category: MapCategory; label: string; icon: IconName }> = [
  { category: "worship", label: "İbadet", icon: "moon-outline" },
  { category: "tomb", label: "Türbe ve mezar", icon: "flower-outline" },
  { category: "school", label: "Eğitim", icon: "book-outline" },
  { category: "trade", label: "Ticaret", icon: "storefront-outline" },
  { category: "water", label: "Su", icon: "water-outline" },
  { category: "charity", label: "Hayır ve sağlık", icon: "heart-outline" },
  { category: "other", label: "Diğer", icon: "shapes-outline" },
];

/** The asset's type as tiles, gathered under the kind of place each is, the picked one in gold. */
function TypeTiles({ options: list, value, onChange, loading }: { options: Array<{ value: string; label: string }>; value: string; onChange: (value: string) => void; loading?: boolean }) {
  const a = useAdminColors();
  if (loading) return <Text color="textSecondary">Yükleniyor…</Text>;
  return (
    <View nativeID={fieldId("type")} accessibilityRole="radiogroup" accessibilityLabel="Türü" style={styles.groups}>
      {TYPE_GROUPS.map((group) => {
        const types = list.filter((t) => assetCategory(t.value) === group.category);
        if (types.length === 0) return null;
        const picked = types.some((t) => t.value === value);
        return (
          <View key={group.category} style={[styles.group, { backgroundColor: picked ? a.goldSoft : a.card }]}>
            <View style={styles.groupHead}>
              <View style={[styles.groupIcon, { backgroundColor: picked ? a.accent : a.well }]}>
                <Ionicons name={group.icon} size={15} color={picked ? a.onAccent : a.textSecondary} aria-hidden />
              </View>
              <Text style={styles.groupName}>{group.label}</Text>
            </View>
            <View style={styles.wrap}>
              {types.map((option) => {
                const on = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => onChange(option.value)}
                    style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.tile, { backgroundColor: on ? a.ink : a.well, borderColor: on ? a.ink : hovered ? a.goldMark : a.line }]}
                  >
                    {on && <Ionicons name="checkmark-circle" size={16} color={a.onInk} aria-hidden />}
                    <Text colorValue={on ? a.onInk : a.text} style={[styles.tileText, on && { fontFamily: fontFamily.sansSemiBold }]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * A list of things and a button for one more. Short things are rows under their column names, each
 * with its bin; longer ones are cards with their fields open.
 */
function Items<T>({
  id,
  title,
  items,
  onChange,
  make,
  addLabel,
  noun,
  phone,
  reorder,
  summary,
  keyOf,
  render,
  columns,
  cells,
}: {
  /** The field the list is, so the phone can send the editor to it. */
  id?: string;
  title?: string;
  items: T[];
  onChange: (items: T[]) => void;
  make: () => T;
  addLabel: string;
  /** What one card is, for its heading: “Konu 1”, “Konu 2”… */
  noun?: string;
  /** The place on the phone an item shows in. */
  phone?: (item: T, index: number) => string;
  /** Cards can be moved up and down; the list keeps the order. */
  reorder?: boolean;
  /** A card's own name, beside its number in its heading. */
  summary?: (item: T) => string;
  /** A stable key for an item, so a moved card keeps its inputs. */
  keyOf?: (item: T) => string;
  render?: (item: T, update: (item: T) => void, index: number) => ReactNode;
  /** For a table: its columns, and each item's inputs in them, without labels. */
  columns?: Array<{ label: string; grow?: number }>;
  cells?: (item: T, update: (item: T) => void, index: number) => ReactNode[];
}) {
  const a = useAdminColors();
  const update = (i: number) => (next: T) => onChange(items.map((old, x) => (x === i ? next : old)));
  const remove = (i: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${i + 1}. öğeyi sil`}
      onPress={() => onChange(items.filter((_, x) => x !== i))}
      hitSlop={4}
      style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.bin, hovered && { backgroundColor: a.redSoft }]}
    >
      {({ hovered }: { pressed: boolean; hovered?: boolean }) => <Ionicons name="trash-outline" size={16} color={hovered ? a.warning : a.textSecondary} aria-hidden />}
    </Pressable>
  );
  const move = (i: number, by: number) => {
    const next = [...items];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item!);
    onChange(next);
  };
  const arrow = (i: number, by: -1 | 1) => {
    const off = i + by < 0 || i + by >= items.length;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${i + 1}. öğeyi ${by < 0 ? "yukarı" : "aşağı"} taşı`}
        accessibilityState={{ disabled: off }}
        disabled={off}
        onPress={() => move(i, by)}
        hitSlop={4}
        style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.bin, off && { opacity: 0.3 }, hovered && !off && { backgroundColor: a.hover }]}
      >
        <Ionicons name={by < 0 ? "arrow-up" : "arrow-down"} size={16} color={a.textSecondary} aria-hidden />
      </Pressable>
    );
  };
  return (
    <View nativeID={id && fieldId(id)} style={{ gap: 10 }}>
      {title && <Text style={styles.label}>{title}</Text>}
      {columns && cells ? (
        items.length > 0 && (
          <View style={{ gap: 8 }}>
            <View style={styles.tableRow}>
              {columns.map((c) => (
                <Text key={c.label} color="textSecondary" style={[styles.columnName, { flex: c.grow ?? 1 }]}>
                  {c.label}
                </Text>
              ))}
              <View style={styles.binRoom} />
            </View>
            {items.map((item, i) => (
              <View key={i} {...({ dataSet: { phone: phone?.(item, i) } } as object)} style={[styles.tableRow, { zIndex: items.length - i }]}>
                {cells(item, update(i), i).map((cell, c) => (
                  <View key={c} style={{ flex: columns[c]?.grow ?? 1, minWidth: 0 }}>
                    {cell}
                  </View>
                ))}
                <View style={styles.binRoom}>{remove(i)}</View>
              </View>
            ))}
          </View>
        )
      ) : (
        items.map((item, i) => (
          <View key={keyOf?.(item) ?? i} {...({ dataSet: { phone: phone?.(item, i) } } as object)} style={[styles.item, { borderColor: a.line }]}>
            <View style={styles.itemHead}>
              <Text color="textSecondary" style={[styles.itemTitle, { flex: 1 }]} numberOfLines={1}>
                {noun ? `${noun} ${i + 1}` : `${i + 1}.`}
                {summary?.(item).trim() ? <Text style={styles.itemSummary}>{`  ·  ${summary(item).trim()}`}</Text> : null}
              </Text>
              <View style={styles.itemTools}>
                {reorder && items.length > 1 && (
                  <>
                    {arrow(i, -1)}
                    {arrow(i, 1)}
                  </>
                )}
                {remove(i)}
              </View>
            </View>
            {render?.(item, update(i), i)}
          </View>
        ))
      )}
      {items.length === 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange([...items, make()])}
          style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.empty, { borderColor: hovered ? a.goldMark : a.line, backgroundColor: hovered ? a.goldSoft : a.card }]}
        >
          <View style={[styles.emptyIcon, { backgroundColor: a.accent }]}>
            <Ionicons name="add" size={20} color={a.onAccent} aria-hidden />
          </View>
          <Text style={styles.emptyTitle}>{addLabel}</Text>
          <Text color="textSecondary" style={{ fontSize: 12.5 }}>
            Yoksa boş bırakabilirsin.
          </Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange([...items, make()])}
          style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.add, { borderColor: a.goldMark, backgroundColor: hovered ? a.goldSoft : "transparent" }]}
        >
          <Ionicons name="add" size={17} color={a.gold} aria-hidden />
          <Text colorValue={a.gold} style={styles.addText}>
            {addLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** A few rarer fields inside a list item, under their own small heading. */
function Inline({ label, children }: { label: string; children: ReactNode }) {
  const a = useAdminColors();
  return (
    <View style={[styles.inline, { borderTopColor: a.line }]}>
      <Text color="textSecondary" style={styles.inlineTitle}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function Photos(props: StepProps) {
  const { record, set, base, assetId, onPhotosChanged } = props;
  const a = useAdminColors();
  // Uploading and removing are an admin's; a moderator sees the photos as they are.
  const admin = usePanel().role === "admin";
  const [removing, setRemoving] = useState<{ key: string; n: number } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const photos = new Map((base?.media ?? []).map((m) => [m.key, m]));
  const remove = async (key: string) => {
    if (!assetId) return;
    setBusyKey(key);
    setRemoveError(null);
    try {
      await deleteAssetPhoto(assetId, key);
      setRemoving(null);
      await onPhotosChanged();
    } catch (error) {
      setRemoving(null);
      setRemoveError(errorText(error));
    } finally {
      setBusyKey(null);
    }
  };
  return (
    <View style={{ gap: 14 }}>
      {admin && <PhotoUpload assetId={assetId} first={record.media.length === 0} onUploaded={onPhotosChanged} />}
      {removeError && <Message tone="error" text={removeError} />}
      {record.media.length === 0 && !admin && (
        <Text color="textSecondary" style={styles.note}>
          Bu eserin henüz fotoğrafı yok.
        </Text>
      )}
    <View style={styles.photos}>
      {record.media.map((m, i) => {
        const photo = photos.get(m.key);
        const edit = (change: Partial<typeof m>) => set({ media: record.media.map((x) => (x.key === m.key ? { ...x, ...change } : x)) });
        return (
          <View key={m.key} style={[styles.photo, { backgroundColor: a.card, borderColor: m.isCover ? a.goldMark : a.line }]}>
            <View style={styles.photoImage}>
              {photo && <AssetImage media={photo} fill />}
              <View style={styles.photoTop}>
                <View style={styles.photoNumber}>
                  <Text colorValue={palette.white} style={styles.photoNumberText}>
                    {i + 1}
                  </Text>
                </View>
                {m.isCover ? (
                  <Badge tone="gold" label="Kapak" />
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${i + 1}. fotoğrafı kapak yap`}
                    onPress={() => set({ media: record.media.map((x) => ({ ...x, isCover: x.key === m.key })) })}
                    style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.photoCover, hovered && { backgroundColor: "rgba(6,8,13,0.8)" }]}
                  >
                    <Ionicons name="star-outline" size={13} color={palette.white} aria-hidden />
                    <Text colorValue={palette.white} style={styles.photoCoverText}>
                      Kapak yap
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
            <View style={{ padding: 10, gap: 8 }}>
              <PairField stacked label="Altında yazan" pair={m.caption} onChange={(caption) => edit({ caption: caption! })} placeholder="ör. Kadınlar kısmının kubbesi" placeholderEn="ör. The dome of the women's side" />
              <PairField stacked label="Ne görünüyor? (ekran okuyucu için)" pair={m.alt} onChange={(alt) => edit({ alt: alt! })} placeholder="ör. Tepesinde ışık delikleri olan kubbe" placeholderEn="ör. A dome with light holes at its top" />
              {/* Only a photo uploaded from the panel can go; the dataset's come back with the next import. */}
              {admin && m.uploaded && assetId && (
                <Button
                  label="Fotoğrafı kaldır"
                  icon="trash-outline"
                  kind="danger"
                  small
                  busy={busyKey === m.key}
                  onPress={() => setRemoving({ key: m.key, n: i + 1 })}
                />
              )}
            </View>
          </View>
        );
      })}
    </View>
      {removing && (
        <Confirm
          title={`${removing.n}. fotoğraf kaldırılsın mı?`}
          body="Fotoğraf eserden hemen kaldırılır; uygulamada da görünmez. Geri almak için yeniden yüklemen gerekir."
          confirmLabel="Kaldır"
          danger
          busy={busyKey === removing.key}
          onConfirm={() => void remove(removing.key)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </View>
  );
}

/** A photo picked to upload: its object URL (the preview, read again to send it), type, size and sides. */
interface PickedPhoto {
  uri: string;
  type: (typeof ADMIN_PHOTO_TYPES)[number];
  name: string;
  bytes: number;
  width: number;
  height: number;
}

/**
 * Asks for an asset photo in the panel's file dialog: a JPEG, PNG or WebP of at most 15 MB, its
 * short side 300 px or more. A file that does not fit is refused here with the reason, before it is
 * sent; null when nothing is chosen.
 */
function pickAssetPhoto(): Promise<PickedPhoto | null> {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return Promise.reject(new Error("Fotoğrafı panelin web sürümünden yükle."));
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ADMIN_PHOTO_TYPES.join(",");
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (!(ADMIN_PHOTO_TYPES as readonly string[]).includes(file.type)) return reject(new Error("Bu dosya türü desteklenmiyor: JPEG, PNG ya da WebP olmalı."));
      if (file.size > ADMIN_PHOTO_MAX_BYTES) return reject(new Error("Dosya çok büyük: en çok 15 MB olabilir."));
      const uri = URL.createObjectURL(file);
      const image = new window.Image();
      image.onload = () => {
        if (Math.min(image.naturalWidth, image.naturalHeight) < ADMIN_PHOTO_MIN_SIDE) {
          URL.revokeObjectURL(uri);
          return reject(new Error(`Fotoğraf çok küçük: kısa kenarı en az ${ADMIN_PHOTO_MIN_SIDE} piksel olmalı.`));
        }
        resolve({ uri, type: file.type as PickedPhoto["type"], name: file.name, bytes: file.size, width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = () => {
        URL.revokeObjectURL(uri);
        reject(new Error("Fotoğraf açılamadı; başka bir dosya dene."));
      };
      image.src = uri;
    };
    input.click();
  });
}

const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`;

/**
 * Uploading a new photo: pick a file, say what it shows and who took it, send it. The server keeps
 * it at once (it does not wait for the record's save) and makes its sizes, which takes a few seconds.
 */
function PhotoUpload({ assetId, first, onUploaded }: { assetId: string | null; first: boolean; onUploaded: () => Promise<void> }) {
  const a = useAdminColors();
  const [picked, setPicked] = useState<PickedPhoto | null>(null);
  const [alt, setAlt] = useState<Pair>({ tr: "", en: null });
  const [caption, setCaption] = useState<Pair>({ tr: "", en: null });
  const [credit, setCredit] = useState("");
  const [cover, setCover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  if (!assetId) {
    return <Message tone="info" text="Fotoğraf yüklemek için önce eseri kaydet; kaydedince bu adımdan yükleyebilirsin." />;
  }

  const altText = alt.tr.trim();
  const creditText = credit.trim();
  const altProblem = altText.length < 3 ? "Ne göründüğünü en az 3 harfle yaz." : null;
  const creditProblem = creditText.length < 2 ? "Fotoğrafı kimin çektiğini ya da kime ait olduğunu yaz." : null;
  const altEnText = alt.en?.trim() ?? "";
  const altEnProblem = altEnText.length > 0 && altEnText.length < 3 ? "İngilizcesi de en az 3 harf olmalı." : null;

  const reset = () => {
    if (picked) URL.revokeObjectURL(picked.uri);
    setPicked(null);
    setAlt({ tr: "", en: null });
    setCaption({ tr: "", en: null });
    setCredit("");
    setCover(false);
    setTried(false);
  };
  const choose = async () => {
    setError(null);
    setDone(null);
    try {
      const file = await pickAssetPhoto();
      if (!file) return;
      if (picked) URL.revokeObjectURL(picked.uri);
      setPicked(file);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : errorText(reason));
    }
  };
  const upload = async () => {
    setTried(true);
    if (!picked || altProblem || creditProblem || altEnProblem) return;
    setBusy(true);
    setError(null);
    try {
      await uploadAssetPhoto(assetId, picked, {
        alt: altText,
        altEn: altEnText || undefined,
        caption: caption.tr.trim() || undefined,
        captionEn: caption.en?.trim() || undefined,
        credit: creditText,
        isCover: cover ? "true" : "false",
      });
      reset();
      setDone("Fotoğraf yüklendi ve esere eklendi.");
      await onUploaded();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.upload, { borderColor: a.line, backgroundColor: a.card }]}>
      <View style={styles.uploadHead}>
        <View style={[styles.uploadIcon, { backgroundColor: a.goldSoft }]}>
          <Ionicons name="cloud-upload-outline" size={18} color={a.gold} aria-hidden />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.uploadTitle}>Yeni fotoğraf yükle</Text>
          <Text color="textSecondary" style={styles.note}>
            {`JPEG, PNG ya da WebP; en çok 15 MB, kısa kenarı en az ${ADMIN_PHOTO_MIN_SIDE} piksel. Yüklenen fotoğraf hemen kaydedilir.`}
            {first ? " Eserin ilk fotoğrafı kendiliğinden kapak olur." : ""}
          </Text>
        </View>
      </View>

      {picked ? (
        <View style={styles.uploadBody}>
          <View style={styles.uploadPicked}>
            <Image source={{ uri: picked.uri }} style={styles.uploadPreview} accessibilityIgnoresInvertColors alt="" />
            <View style={{ flex: 1, gap: 4 }}>
              <Text numberOfLines={1} style={styles.uploadName}>
                {picked.name}
              </Text>
              <Text color="textSecondary" style={styles.note}>
                {`${picked.width} × ${picked.height} piksel · ${megabytes(picked.bytes)}`}
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                <Button label="Başka dosya seç" small onPress={() => void choose()} disabled={busy} />
                <Button label="Vazgeç" kind="ghost" small onPress={reset} disabled={busy} />
              </View>
            </View>
          </View>
          <PairField
            stacked
            label="Ne görünüyor? (zorunlu, ekran okuyucu için)"
            pair={alt}
            onChange={(next) => setAlt(next ?? { tr: "", en: null })}
            placeholder="ör. Taç kapının mukarnaslı kavsarası"
            placeholderEn="ör. The muqarnas hood of the portal"
          />
          {tried && (altProblem || altEnProblem) && <Message tone="error" text={(altProblem ?? altEnProblem)!} />}
          <PairField
            stacked
            label="Altında yazan (boşsa ne göründüğü yazılır)"
            pair={caption}
            onChange={(next) => setCaption(next ?? { tr: "", en: null })}
            placeholder="ör. Kuzey cephesi, öğleden sonra"
            placeholderEn="ör. The north front in the afternoon"
          />
          <Field
            label="Kim çekti? (zorunlu)"
            value={credit}
            onChangeText={setCredit}
            placeholder="ör. Kübra Alkan ya da Vakıflar Genel Müdürlüğü"
            error={tried ? creditProblem : null}
            hint="Fotoğrafın altında görünür."
          />
          {!first && <Toggle label="Kapak fotoğrafı yap" value={cover} onChange={setCover} hint="Veri setindeki bir eserde içe aktarma kapağı veri setininkine geri alır." />}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Button label={busy ? "Yükleniyor…" : "Fotoğrafı yükle"} icon="cloud-upload-outline" kind="primary" busy={busy} onPress={() => void upload()} />
            {busy && (
              <Text color="textSecondary" style={styles.note} accessibilityLiveRegion="polite">
                Sunucu fotoğrafın boyutlarını hazırlıyor; birkaç saniye sürebilir.
              </Text>
            )}
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: "row" }}>
          <Button label="Fotoğraf seç" icon="image-outline" onPress={() => void choose()} />
        </View>
      )}
      {error && <Message tone="error" text={error} />}
      {done && !error && <Message tone="ok" text={done} />}
    </View>
  );
}

/** A line under the upload: what went wrong, what went right, or what to do first. */
function Message({ tone, text }: { tone: "error" | "ok" | "info"; text: string }) {
  const a = useAdminColors();
  const look = {
    error: { bg: a.redSoft, fg: a.warning, icon: "alert-circle-outline" as const },
    ok: { bg: a.roseSoft, fg: a.success, icon: "checkmark-circle-outline" as const },
    info: { bg: a.goldSoft, fg: a.gold, icon: "information-circle-outline" as const },
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: look.bg }]} accessibilityLiveRegion="polite" accessibilityRole={tone === "error" ? "alert" : undefined}>
      <Ionicons name={look.icon} size={16} color={look.fg} aria-hidden />
      <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18 }}>{text}</Text>
    </View>
  );
}

/** The dossier's own blocks an added block can follow, in their order. */
const BLOCK_NAMES: Array<{ key: string; label: string }> = [
  { key: "identity", label: "Künye" },
  { key: "history", label: "Tarihçe" },
  { key: "timeline", label: "Zaman çizelgesi" },
  { key: "people", label: "Kişiler" },
  { key: "waqf", label: "Vakıf" },
  { key: "inscriptions", label: "Kitabeler" },
  { key: "facts", label: "Ölçüler" },
  { key: "legends", label: "Rivayetler" },
  { key: "accessibility", label: "Erişilebilirlik" },
];

/** The admin's own dossier blocks: a title, where it goes, and its formatted text in both languages. */
function CustomBlocks({ customBlocks, setCustomBlocks, showPlace }: StepProps) {
  const after = (block: CustomBlockDraft) => [
    ...BLOCK_NAMES.map((b) => ({ value: b.key, label: `${b.label} bölümünden sonra` })),
    ...customBlocks.filter((other) => other.id !== block.id).map((other) => ({ value: `custom:${other.id}`, label: `“${other.title.tr.trim() || "Başlıksız bölüm"}” bölümünden sonra` })),
  ];
  return (
    <>
      <Items
        items={customBlocks}
        onChange={setCustomBlocks}
        make={() => ({ id: newId("bolum"), title: { tr: "", en: null }, body: { tr: "", en: null }, after: "accessibility" })}
        addLabel="Yeni bir bölüm ekle"
        noun="Yeni bölüm"
        phone={(b) => `custom:${b.id}`}
        render={(b, update) => (
          <>
            <Row>
              <Cell grow={1.4}>
                <PairField label="Bölümün adı" pair={b.title} onChange={(title) => update({ ...b, title: title! })} placeholder="ör. Restorasyonlar" placeholderEn="ör. Restorations" />
              </Cell>
              <Cell>
                <Picker
                  label="Eser bilgilerinde nereye gelsin?"
                  value={b.after}
                  options={after(b)}
                  onChange={(place) => {
                    if (!place) return;
                    update({ ...b, after: place });
                    setTimeout(() => showPlace("dossier", `custom:${b.id}`), 250);
                  }}
                />
              </Cell>
            </Row>
            <RichTextField
              id={`custom:${b.id}`}
              label="Metni (Türkçe)"
              value={b.body.tr}
              onChange={(text) => update({ ...b, body: { ...b.body, tr: text } })}
              placeholder="ör. Yapı 2004-2008 yılları arasında kapsamlı bir onarım gördü…"
              hint="Kutudaki ## ve ** gibi işaretler telefonda biçime dönüşür; nasıl göründüğüne sağdan bak."
            />
            <RichTextField label="Metni (İngilizce)" value={b.body.en ?? ""} onChange={(text) => update({ ...b, body: { ...b.body, en: text || null } })} placeholder="ör. The building was fully restored between 2004 and 2008…" />
          </>
        )}
      />
    </>
  );
}

/** The dossier's places a photo can follow, in the order the dossier shows them; empty blocks are left out. */
function dossierPlaces(r: R, custom: CustomBlockDraft[] = []): Array<{ key: string; label: string; chapter?: boolean }> {
  const places: Array<{ key: string; label: string; chapter?: boolean } | false> = [
    { key: "identity", label: "Künye" },
    ...r.sections.map((s, i) => ({ key: `section:${s.id}`, label: s.title.tr.trim() || `${i + 1}. konu`, chapter: true })),
    r.timeline.length > 0 && { key: "timeline", label: "Zaman çizelgesi" },
    r.people.length > 0 && { key: "people", label: "Kişiler" },
    (has(r.waqf.name) || has(r.waqf.conditions?.tr) || has(r.waqf.landNote?.tr) || has(r.waqf.deedExcerpt?.tr)) && { key: "waqf", label: "Vakıf" },
    r.inscriptions.length > 0 && { key: "inscriptions", label: "Kitabeler" },
    r.facts.length > 0 && { key: "facts", label: "Ölçüler" },
    r.legends.length > 0 && { key: "legends", label: "Rivayetler" },
    { key: "accessibility", label: "Erişilebilirlik" },
  ];
  const shown = places.filter((p): p is { key: string; label: string; chapter?: boolean } => !!p);
  // Added blocks go after the block they name (after its chapters, for Tarihçe), else at the end.
  for (const block of custom) {
    const anchor = block.after === "history" ? shown.map((p) => p.key).filter((k) => k.startsWith("section:")).pop() ?? "identity" : block.after;
    const at = shown.findIndex((p) => p.key === anchor);
    let index = at < 0 ? shown.length : at + 1;
    while (shown[index]?.key.startsWith("custom:") && at >= 0) index++;
    shown.splice(index, 0, { key: `custom:${block.id}`, label: block.title.tr.trim() || "Yeni bölüm" });
  }
  return shown;
}

/**
 * The dossier as a list of its blocks, with a slot under each: the photos set there and a button
 * to set one more, picked from the asset's photos. A photo is in one place at a time.
 */
function DossierPhotos({ record, base, placements, setPlacements, showPlace, customBlocks }: StepProps) {
  const a = useAdminColors();
  const [open, setOpen] = useState<string | null>(null);
  const photos = new Map((base?.media ?? []).map((m) => [m.key, m]));
  const all = record.media.filter((m) => photos.has(m.key));
  const places = dossierPlaces(record, customBlocks);
  const labelOf = (key: string) => places.find((p) => p.key === key)?.label;
  const place = (key: string, after: string | null) => {
    const next = { ...placements };
    if (after) next[key] = after;
    else delete next[key];
    setPlacements(next);
    // The phone draws the photo a beat later; then it can go to it.
    if (after) setTimeout(() => showPlace("dossier", `photo-in:${after}`), 250);
  };
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.places}>
        {places.map((p) => {
          const here = all.filter((m) => placements[m.key] === p.key);
          const picking = open === p.key;
          return (
            <View key={p.key} {...({ dataSet: { phone: `photo-in:${p.key}` } } as object)} style={[styles.place, p.chapter && styles.placeChapter, { borderColor: a.line }]}>
              <View style={styles.placeHead}>
                {p.chapter ? (
                  <Ionicons name="return-down-forward" size={14} color={a.textSecondary} aria-hidden />
                ) : (
                  <Text color="textSecondary" style={styles.placeNumber}>
                    {String(places.filter((x) => !x.chapter).indexOf(p) + 1).padStart(2, "0")}
                  </Text>
                )}
                <Text style={[styles.placeName, p.chapter && { fontFamily: fontFamily.sansMedium }]} numberOfLines={1}>
                  {p.label}
                </Text>
              </View>
              <View style={styles.slot}>
                {here.map((m) => {
                  const photo = photos.get(m.key)!;
                  return (
                    <View key={m.key} style={styles.slotPhoto}>
                      <AssetImage media={photo} fill />
                      <Pressable accessibilityRole="button" accessibilityLabel={`${m.caption.tr || "Fotoğrafı"} buradan kaldır`} onPress={() => place(m.key, null)} style={styles.slotRemove}>
                        <Ionicons name="close" size={13} color={palette.white} aria-hidden />
                      </Pressable>
                    </View>
                  );
                })}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: picking }}
                  accessibilityLabel={`${p.label} bölümünün altına fotoğraf koy`}
                  onPress={() => setOpen(picking ? null : p.key)}
                  style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.slotAdd, { borderColor: picking || hovered ? a.goldMark : a.line, backgroundColor: picking ? a.goldSoft : "transparent" }]}
                >
                  <Ionicons name={picking ? "close" : "add"} size={16} color={a.gold} aria-hidden />
                  <Text colorValue={a.gold} style={styles.addText}>
                    {picking ? "Vazgeç" : "Buraya fotoğraf koy"}
                  </Text>
                </Pressable>
              </View>
              {picking && (
                <View style={[styles.picker, { backgroundColor: a.card }]}>
                  <Text color="textSecondary" style={{ fontSize: 12.5 }}>
                    {`“${p.label}” bölümünün altına hangi fotoğraf gelsin?`}
                  </Text>
                  <View style={styles.pickerGrid}>
                    {all.map((m, i) => {
                      const elsewhere = placements[m.key] && placements[m.key] !== p.key ? labelOf(placements[m.key]!) : null;
                      const on = placements[m.key] === p.key;
                      return (
                        <Pressable
                          key={m.key}
                          accessibilityRole="button"
                          accessibilityLabel={`${i + 1}. fotoğraf${m.caption.tr ? `: ${m.caption.tr}` : ""}${elsewhere ? `, şu an ${elsewhere} altında` : ""}`}
                          onPress={() => {
                            place(m.key, p.key);
                            setOpen(null);
                          }}
                          style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.pickerPhoto, { borderColor: on ? a.goldMark : hovered ? a.goldMark : "transparent" }]}
                        >
                          <View style={styles.pickerImage}>
                            <AssetImage media={photos.get(m.key)!} fill />
                            {elsewhere && (
                              <View style={styles.pickerBadge}>
                                <Text colorValue={palette.white} style={{ fontSize: 10.5, fontFamily: fontFamily.sansSemiBold }} numberOfLines={1}>
                                  {elsewhere}
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text style={{ fontSize: 11.5 }} numberOfLines={1}>
                            {m.caption.tr || `${i + 1}. fotoğraf`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** A few fields that belong together, on a soft card with a small heading and what they are for. */
function Box({ icon, title, note, status, tile, phone, children }: { icon: IconName; title: string; note?: string; status?: ReactNode; /** Its width in a row of boxes. */ tile?: number; /** The place on the phone its fields show in. */ phone?: string; children: ReactNode }) {
  const a = useAdminColors();
  return (
    <View {...({ dataSet: { phone } } as object)} style={[styles.box, tile !== undefined && { flexGrow: 1, flexBasis: tile }, { backgroundColor: a.card }]}>
      <View style={styles.boxHead}>
        <View style={[styles.groupIcon, { backgroundColor: a.well }]}>
          <Ionicons name={icon} size={15} color={a.textSecondary} aria-hidden />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.groupName}>{title}</Text>
          {note && (
            <Text color="textSecondary" style={{ fontSize: 12.5 }}>
              {note}
            </Text>
          )}
        </View>
        {status}
      </View>
      {children}
    </View>
  );
}

/** “40.18775, 29.06828” as Google Maps copies it, or with Turkish commas, or with a space between. */
function parsePoint(text: string): { lat: number; lng: number } | null {
  const match = text.trim().match(/^(-?\d+(?:[.,]\d+)?)[\s,;]+(-?\d+(?:[.,]\d+)?)$/);
  if (!match) return null;
  const point = { lat: Number(match[1]!.replace(",", ".")), lng: Number(match[2]!.replace(",", ".")) };
  return point.lat >= 35.5 && point.lat <= 42.5 && point.lng >= 25.5 && point.lng <= 45 ? point : null;
}

/** Where the asset is on the map, pasted in one go, with a look at it and what it turns on. */
function Coordinates({ value, onChange }: { value: R["coordinates"]; onChange: (value: R["coordinates"]) => void }) {
  const a = useAdminColors();
  const [text, setText] = useState(value ? `${value.lat}, ${value.lng}` : "");
  const bad = text.trim() !== "" && !value;
  return (
    <Box
      icon="location-outline"
      phone="visit"
      title="Haritadaki yeri"
      note="Haritadaki iğne ve son sayfadaki “Yol tarifi al” düğmesi buna göre çıkar."
      status={
        value ? (
          <View style={[styles.status, { backgroundColor: a.roseSoft }]}>
            <Ionicons name="checkmark-circle" size={14} color={a.success} aria-hidden />
            <Text colorValue={a.success} style={styles.statusText}>
              Yol tarifi açık
            </Text>
          </View>
        ) : null
      }
    >
      <View nativeID={fieldId("coords")} style={styles.coordsRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Field
            label="Enlem ve boylam"
            hideLabel
            value={text}
            placeholder="ör. 40.18775, 29.06828"
            keyboardType="numbers-and-punctuation"
            error={bad ? "İki sayı yaz, virgülle ayırarak; nokta Türkiye içinde olmalı" : null}
            hint={bad ? undefined : "Google Haritalar'da yerin üstüne sağ tıkla, en üstteki sayılara bas ve buraya yapıştır."}
            onChangeText={(next) => {
              setText(next);
              onChange(parsePoint(next));
            }}
          />
        </View>
        {value && <Button small kind="secondary" icon="open-outline" label="Haritada gör" onPress={() => void Linking.openURL(`https://www.google.com/maps?q=${value.lat},${value.lng}`)} />}
      </View>
    </Box>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  groups: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  box: { borderRadius: 18, padding: 14, gap: 12 },
  visitRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  notice: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  places: { gap: 0 },
  place: { gap: 8, borderLeftWidth: 2, paddingLeft: 14, paddingVertical: 10 },
  placeChapter: { marginLeft: 18 },
  placeHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  placeNumber: { fontFamily: fontFamily.monoMedium, fontSize: 12 },
  placeName: { flexShrink: 1, fontFamily: fontFamily.sansSemiBold, fontSize: 14 },
  slot: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  slotPhoto: { width: 96, height: 64, borderRadius: 10, overflow: "hidden" },
  slotRemove: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(6,8,13,0.65)" },
  slotAdd: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1.5, borderStyle: "dashed", paddingHorizontal: 14, paddingVertical: 7 },
  picker: { gap: 10, borderRadius: 16, padding: 12 },
  pickerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pickerPhoto: { width: 112, gap: 4, borderRadius: 12, borderWidth: 2, padding: 2 },
  pickerImage: { height: 72, borderRadius: 9, overflow: "hidden" },
  pickerBadge: { position: "absolute", left: 4, right: 4, bottom: 4, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, backgroundColor: "rgba(6,8,13,0.65)" },
  verified: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  boxHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  coordsRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  status: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontFamily: fontFamily.sansSemiBold, fontSize: 12 },
  group: { flexGrow: 1, flexBasis: 220, borderRadius: 18, padding: 12, gap: 10 },
  groupHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  groupIcon: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  groupName: { fontFamily: fontFamily.sansSemiBold, fontSize: 13 },
  tile: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  tileText: { fontFamily: fontFamily.sansMedium, fontSize: 13.5 },
  label: { fontFamily: fontFamily.sansSemiBold, fontSize: 13.5 },
  note: { fontSize: 13, lineHeight: 19 },
  item: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 8 },
  itemHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemTools: { flexDirection: "row", alignItems: "center", gap: 2 },
  itemSummary: { textTransform: "none", letterSpacing: 0, fontFamily: fontFamily.sansSemiBold },
  itemTitle: { fontFamily: fontFamily.sansBold, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" },
  tableRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  columnName: { fontFamily: fontFamily.sansSemiBold, fontSize: 12.5, paddingLeft: 2 },
  binRoom: { width: 36, alignItems: "center" },
  bin: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: 4, borderRadius: 18, borderWidth: 1.5, borderStyle: "dashed", paddingVertical: 22 },
  emptyIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 14 },
  add: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderRadius: 999, borderWidth: 1.5, borderStyle: "dashed", paddingHorizontal: 16, paddingVertical: 8 },
  addText: { fontFamily: fontFamily.sansSemiBold, fontSize: 13.5 },
  inline: { gap: 10, borderTopWidth: 1, paddingTop: 12, marginTop: 2 },
  inlineTitle: { fontFamily: fontFamily.sansBold, fontSize: 11.5, letterSpacing: 0.6, textTransform: "uppercase" },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  introRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "stretch", gap: 12 },
  introBox: { flexGrow: 1, flexBasis: 200, borderRadius: 18, padding: 16, gap: 6 },
  introTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 15 },
  introArrow: { width: 90, alignItems: "center", justifyContent: "center", gap: 4 },
  photo: { flexGrow: 1, flexBasis: 220, maxWidth: 300, borderRadius: 16, borderWidth: 1.5, overflow: "hidden" },
  photoImage: { height: 140 },
  photoTop: { position: "absolute", top: 8, left: 8, right: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  photoNumber: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(6,8,13,0.6)" },
  photoNumberText: { fontFamily: fontFamily.sansBold, fontSize: 12 },
  photoCover: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "rgba(6,8,13,0.6)" },
  photoCoverText: { fontFamily: fontFamily.sansSemiBold, fontSize: 12 },
  upload: { borderWidth: 1, borderStyle: "dashed", borderRadius: 18, padding: 14, gap: 12 },
  uploadHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  uploadIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  uploadTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 14.5 },
  uploadBody: { gap: 12 },
  uploadPicked: { flexDirection: "row", alignItems: "center", gap: 12 },
  uploadPreview: { width: 96, height: 72, borderRadius: 10 },
  uploadName: { fontFamily: fontFamily.sansSemiBold, fontSize: 13.5 },
});
