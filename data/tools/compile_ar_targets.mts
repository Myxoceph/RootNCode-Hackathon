/**
 * AR hedeflerini MindAR'ın `.mind` biçimine derler: kitabelerinkini (Taşın Dili, Y13) ve
 * eserlerin ziyaret mührü fotoğraflarınınkini (Ziyaret Mührü).
 *
 *   npm run data:ar-targets
 *   npm run data:ar-targets -- --cities=bursa,konya   (mühürler yalnızca bu illerde)
 *   npm run data:ar-targets -- --no-seals             (yalnızca kitabeler)
 *   npm run data:ar-targets -- --assets=<id>,<id>     (mühürler yalnızca bu eserlerde; deneme için)
 *
 * Her hedef için fotoğrafın 1280 px JPEG sürümünü alır (önce data/build/media/, yoksa
 * MEDIA_BASE_URL; varsayılan https://media.allbytech.com), headless Chrome'da derler
 * (apps/app/scripts/mindar-compiler.mts) ve fotoğrafın sürümlerinin yanına yazar:
 * assets/<eser>/<medya>-<sha>/target-mindar-<sürüm>.mind (`arTargetMindKey`, packages/contracts).
 * API kitabe hedefinin adresini aynı kuralla kurar; uygulama mühür fotoğrafınınkini kendisi kurar
 * ve dosya yoksa fotoğrafı telefonda derler. Mühür fotoğrafını uygulamayla aynı kural seçer
 * (`pickSealPhoto`, packages/contracts). Bir fotoğraf hem kitabe hem mühür hedefiyse tek dosyadır.
 *
 * Derlenenler data/build/ar-targets.json'a yazılır; dosya media-manifest.json gibi git'e girer.
 * Fotoğrafı ve MindAR sürümü değişmemiş, dosyası diskte duran hedef yeniden derlenmez: betik
 * yarıda kesilirse yeniden çalıştırmak kaldığı yerden sürdürür (ilerleme 25 hedefte bir yazılır).
 * db_rows.py yalnızca `targets`'ı (kitabeler) okur; derlenmemiş kitabe hedefini içe aktarmaz.
 * `.mind` dosyaları fotoğraflarla aynı komutla R2'ye yüklenir (data/README.md §8).
 *
 * Önce media_pipeline.py: hedef fotoğraf manifestte olmalı.
 */
import { AR_MINDAR_VERSION, arTargetMindKey, pickSealPhoto } from "@vagabonds/contracts";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { withMindCompiler } from "../../apps/app/scripts/mindar-compiler.mts";

const DATA = fileURLToPath(new URL("..", import.meta.url));
const MEDIA = join(DATA, "build/media");
const OUT = join(DATA, "build/ar-targets.json");
const MEDIA_BASE_URL = (process.env.MEDIA_BASE_URL ?? "https://media.allbytech.com").replace(/\/+$/, "");
/** Bu kadar hedefte bir ilerleme diske yazılır. */
const SAVE_EVERY = 25;
/**
 * Chrome bu kadar derlemede bir kapatılıp yeniden açılır: MindAR sekmede bellek biriktiriyor
 * (tek Chrome'la yüzlerce fotoğrafta 14 GB'a çıkıp makineyi takasa düşürdü).
 */
const COMPILES_PER_CHROME = 30;

const args = process.argv.slice(2);
const sealCities = args.find((a) => a.startsWith("--cities="))?.slice("--cities=".length).split(",").filter(Boolean) ?? null;
const withSeals = !args.includes("--no-seals");
const sealAssets = args.find((a) => a.startsWith("--assets="))?.slice("--assets=".length).split(",").filter(Boolean) ?? null;

interface Variant {
  key: string;
  format: string;
  width: number;
}
type Manifest = Record<string, Record<string, { sha256: string; original?: { width: number; height: number }; variants: Variant[] }>>;

interface Compiled {
  sha256: string;
  key: string;
  bytes: number;
}

export interface ArTargetsFile {
  mindar_version: string;
  /** Kitabeler: eser id → medya id → derlenen hedef. */
  targets: Record<string, Record<string, Compiled>>;
  /** Ziyaret mührü: eser id → mühür fotoğrafının derlenen hedefi. */
  seals?: Record<string, Compiled & { media_id: string }>;
}

interface AssetRecord {
  id: string;
  media?: Array<{ id: string; type: string; subject?: string | null; is_cover?: boolean }>;
  inscriptions?: Array<{ id: string; ar_target_media_id?: string | null }>;
}

function records(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? records(path) : name.endsWith(".json") ? [path] : [];
  });
}

async function photo(variant: Variant): Promise<Buffer> {
  const local = join(MEDIA, variant.key);
  if (existsSync(local)) return readFileSync(local);
  const response = await fetch(`${MEDIA_BASE_URL}/${variant.key}`);
  if (!response.ok) throw new Error(`${response.status} ${MEDIA_BASE_URL}/${variant.key}`);
  return Buffer.from(await response.arrayBuffer());
}

const manifest = JSON.parse(readFileSync(join(DATA, "build/media-manifest.json"), "utf8")) as Manifest;
const previous: ArTargetsFile | null = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as ArTargetsFile) : null;
const reusable = previous?.mindar_version === AR_MINDAR_VERSION ? previous : null;
const result: ArTargetsFile = { mindar_version: AR_MINDAR_VERSION, targets: {}, seals: {} };
const missing: string[] = [];

/** Derlenmiş ve hâlâ geçerli hedefler, `.mind` anahtarına göre: bir fotoğraf bir kez derlenir. */
const known = new Map<string, Compiled>();
for (const entry of [
  ...Object.values(reusable?.targets ?? {}).flatMap((byMedia) => Object.values(byMedia)),
  ...Object.values(reusable?.seals ?? {}),
]) {
  if (existsSync(join(MEDIA, entry.key))) known.set(entry.key, { sha256: entry.sha256, key: entry.key, bytes: entry.bytes });
}

/** Bir eserin bir fotoğrafının 1280 px JPEG'i ve manifest kaydı; yoksa null. */
function variantOf(assetId: string, mediaId: string) {
  const entry = manifest[assetId]?.[mediaId];
  // MindAR resmi kendisi küçültüyor; 1280 px özellik çıkarmaya yetiyor.
  const variant = entry?.variants.find((v) => v.format === "jpg" && v.width === 1280) ?? entry?.variants.find((v) => v.format === "jpg");
  return entry && variant ? { entry, variant } : null;
}

const files = records(join(DATA, "eserler")).sort();
const assets = files.map((file) => ({
  city: relative(join(DATA, "eserler"), file).split(sep)[0]!,
  record: JSON.parse(readFileSync(file, "utf8")) as AssetRecord,
}));

/** Bu çalıştırmada mührüne bakılan eserler; öbürlerinin önceki mühür hedefi olduğu gibi kalır. */
const sealScope = new Set<string>();
/** Derlenecekler: kitabe hedefleri ve (istenirse) mühür fotoğrafları. */
const jobs: Array<{ assetId: string; mediaId: string; label: string; seal: boolean; inscription: boolean }> = [];
for (const { city, record } of assets) {
  for (const inscription of record.inscriptions ?? []) {
    const mediaId = inscription.ar_target_media_id;
    if (mediaId) jobs.push({ assetId: record.id, mediaId, label: `${record.id} / ${inscription.id}`, seal: false, inscription: true });
  }
  if (!withSeals || (sealCities && !sealCities.includes(city)) || (sealAssets && !sealAssets.includes(record.id))) continue;
  sealScope.add(record.id);
  // Uygulamanın gördüğü fotoğraflar: manifestte olanlar, API'nin verdiği boyutla (özgün fotoğrafınki).
  const candidates = (record.media ?? []).flatMap((m) => {
    const original = manifest[record.id]?.[m.id]?.original;
    return original ? [{ id: m.id, kind: m.type, subject: m.subject ?? null, width: original.width, height: original.height, isCover: m.is_cover === true }] : [];
  });
  const picked = pickSealPhoto(candidates);
  if (picked) jobs.push({ assetId: record.id, mediaId: picked.photo.id, label: `${record.id} / mühür (${picked.subject ?? "kapak"})`, seal: true, inscription: false });
}

// Mühürlerin bir kısmını derleyen bir çalıştırma, öbürlerini silmez (dosyası hâlâ diskteyse).
for (const [assetId, seal] of Object.entries(reusable?.seals ?? {})) {
  if (!sealScope.has(assetId) && known.has(seal.key)) result.seals![assetId] = seal;
}

const started = Date.now();
let compiledNow = 0;
/**
 * Ara kayıtta henüz sırası gelmemiş kitabe hedefleri önceki dosyadan korunur: yarıda kesilen bir
 * çalıştırma db_rows.py'nin okuduğu `targets`'ı eksiltmez. Son kayıt yalnızca bu çalıştırmanınkini yazar.
 */
const save = (final: boolean) => {
  const targets = final ? result.targets : { ...(reusable?.targets ?? {}), ...result.targets };
  writeFileSync(OUT, `${JSON.stringify({ ...result, targets }, null, 2)}\n`);
};

/** Sıradaki iş: her yeni Chrome kaldığı yerden sürdürür. */
let next = 0;
while (next < jobs.length) {
  let compiledHere = 0;
  await withMindCompiler(async (compile) => {
    for (; next < jobs.length && compiledHere < COMPILES_PER_CHROME; next++) {
      const index = next;
      const job = jobs[index]!;
      const found = variantOf(job.assetId, job.mediaId);
      if (!found) {
        missing.push(`${job.label}: '${job.mediaId}' manifestte yok (önce media_pipeline.py)`);
        continue;
      }
      const key = arTargetMindKey(found.variant.key);
      let compiled = known.get(key);
      if (!compiled || compiled.sha256 !== found.entry.sha256) {
        let mind: Buffer;
        try {
          mind = await compile([`data:image/jpeg;base64,${(await photo(found.variant)).toString("base64")}`]);
        } catch (error) {
          // Bir fotoğraf (geçici bir ağ hatası, MindAR'ın derleyemediği bir resim) ötekileri durdurmaz.
          missing.push(`${job.label}: derlenemedi (${error instanceof Error ? error.message.split("\n")[0] : String(error)})`);
          continue;
        }
        mkdirSync(dirname(join(MEDIA, key)), { recursive: true });
        writeFileSync(join(MEDIA, key), mind);
        compiled = { sha256: found.entry.sha256, key, bytes: mind.length };
        known.set(key, compiled);
        compiledNow++;
        compiledHere++;
        const each = (Date.now() - started) / compiledNow;
        const left = Math.round(((jobs.length - index - 1) * each) / 60_000);
        console.log(`✔ [${index + 1}/${jobs.length}] ${job.label} → ${key} (${Math.round(mind.length / 1024)} KB, ~${left} dk kaldı)`);
      }
      if (job.inscription) (result.targets[job.assetId] ??= {})[job.mediaId] = compiled;
      if (job.seal) result.seals![job.assetId] = { ...compiled, media_id: job.mediaId };
      if ((index + 1) % SAVE_EVERY === 0) save(false);
    }
  });
}

save(true);
const inscriptions = Object.values(result.targets).reduce((n, targets) => n + Object.keys(targets).length, 0);
const seals = Object.keys(result.seals ?? {}).length;
console.log(`${OUT}: ${inscriptions} kitabe, ${seals} mühür hedefi (MindAR ${AR_MINDAR_VERSION}); bu çalıştırmada ${compiledNow} derlendi`);
for (const line of missing) console.warn(`⚠ ${line}`);
if (compiledNow > 0) console.log("R2'ye yükle: data/README.md §8'deki rclone komutu (`.mind` dosyaları da data/build/media/ altında).");
