/**
 * Kitabelerin AR hedeflerini MindAR'ın `.mind` biçimine derler (Taşın Dili, Y13).
 *
 *   npm run data:ar-targets
 *
 * `ar_target_media_id` taşıyan her kitabe için hedef fotoğrafın 1280 px JPEG sürümünü alır
 * (önce data/build/media/, yoksa MEDIA_BASE_URL; varsayılan https://media.allbytech.com),
 * headless Chrome'da derler (apps/app/scripts/mindar-compiler.mts) ve fotoğrafın sürümlerinin
 * yanına yazar: assets/<eser>/<medya>-<sha>/target-mindar-<sürüm>.mind. API dosyanın adresini
 * aynı kuralla kurar (`arTargetMindKey`, packages/contracts).
 *
 * Derlenenler data/build/ar-targets.json'a yazılır; dosya media-manifest.json gibi git'e girer.
 * db_rows.py derlenmemiş (ya da fotoğrafı ya da MindAR sürümü değişmiş) hedefi içe aktarmaz.
 * `.mind` dosyaları fotoğraflarla aynı komutla R2'ye yüklenir (data/README.md §8).
 *
 * Önce media_pipeline.py: hedef fotoğraf manifestte olmalı.
 */
import { AR_MINDAR_VERSION, arTargetMindKey } from "@vagabonds/contracts";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { compileMindTargets } from "../../apps/app/scripts/mindar-compiler.mts";

const DATA = fileURLToPath(new URL("..", import.meta.url));
const MEDIA = join(DATA, "build/media");
const OUT = join(DATA, "build/ar-targets.json");
const MEDIA_BASE_URL = (process.env.MEDIA_BASE_URL ?? "https://media.allbytech.com").replace(/\/+$/, "");

interface Variant {
  key: string;
  format: string;
  width: number;
}
type Manifest = Record<string, Record<string, { sha256: string; variants: Variant[] }>>;

export interface ArTargetsFile {
  mindar_version: string;
  /** Eser id → medya id → derlenen hedef. */
  targets: Record<string, Record<string, { sha256: string; key: string; bytes: number }>>;
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
const result: ArTargetsFile = { mindar_version: AR_MINDAR_VERSION, targets: {} };
const missing: string[] = [];

for (const file of records(join(DATA, "eserler")).sort()) {
  const asset = JSON.parse(readFileSync(file, "utf8")) as { id: string; inscriptions?: Array<{ id: string; ar_target_media_id?: string | null }> };
  for (const inscription of asset.inscriptions ?? []) {
    const mediaId = inscription.ar_target_media_id;
    if (!mediaId) continue;
    const entry = manifest[asset.id]?.[mediaId];
    // MindAR resmi kendisi küçültüyor; 1280 px özellik çıkarmaya yetiyor.
    const variant = entry?.variants.find((v) => v.format === "jpg" && v.width === 1280) ?? entry?.variants.find((v) => v.format === "jpg");
    if (!entry || !variant) {
      missing.push(`${asset.id} / ${inscription.id}: '${mediaId}' manifestte yok (önce media_pipeline.py)`);
      continue;
    }
    const mind = await compileMindTargets([`data:image/jpeg;base64,${(await photo(variant)).toString("base64")}`]);
    const key = arTargetMindKey(variant.key);
    mkdirSync(dirname(join(MEDIA, key)), { recursive: true });
    writeFileSync(join(MEDIA, key), mind);
    (result.targets[asset.id] ??= {})[mediaId] = { sha256: entry.sha256, key, bytes: mind.length };
    console.log(`✔ ${asset.id} / ${inscription.id} → ${key} (${Math.round(mind.length / 1024)} KB)`);
  }
}

writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
const count = Object.values(result.targets).reduce((n, targets) => n + Object.keys(targets).length, 0);
console.log(`${OUT}: ${count} hedef (MindAR ${AR_MINDAR_VERSION})`);
for (const line of missing) console.warn(`⚠ ${line}`);
if (count > 0) console.log("R2'ye yükle: data/README.md §8'deki rclone komutu (`.mind` dosyaları da data/build/media/ altında).");
