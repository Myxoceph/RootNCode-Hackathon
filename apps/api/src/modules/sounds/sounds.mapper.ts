import type { Lang, Sound, SoundRecording } from "@vagabonds/contracts";
import { z } from "zod";
import { pick } from "../../lib/lang.ts";
import type { SoundRecord } from "./sounds.repository.ts";

/** sound.captions as data/tools/db_rows.py writes it. */
const StoredCaptionsSchema = z.array(z.object({ at: z.number(), text_tr: z.string(), text_en: z.string().nullable() }));

const LicenseSchema = z.enum(["CC0-1.0", "CC-BY-4.0"]);
const LICENSE_LABEL: Record<z.infer<typeof LicenseSchema>, string> = { "CC0-1.0": "CC0", "CC-BY-4.0": "CC BY 4.0" };
const CREDIT_PREFIX: Record<Lang, string> = { tr: "Ses", en: "Sound" };

export function toSoundRecording(record: SoundRecord, mediaBaseUrl: string, lang: Lang): SoundRecording {
  const license = LicenseSchema.parse(record.license);
  const by = record.author ? `${record.author} (${LICENSE_LABEL[license]})` : LICENSE_LABEL[license];
  return {
    url: `${mediaBaseUrl}/${record.file_key}`,
    durationSeconds: record.duration_seconds,
    captions: StoredCaptionsSchema.parse(record.captions).map((c) => ({ at: c.at, text: pick(c.text_tr, c.text_en, lang) })),
    license,
    credit: `${CREDIT_PREFIX[lang]}: ${by}`,
    sourceUrl: record.source_url,
  };
}

export function toSound(record: SoundRecord, mediaBaseUrl: string, lang: Lang): Sound {
  return { key: record.key, title: pick(record.title_tr, record.title_en, lang), ...toSoundRecording(record, mediaBaseUrl, lang) };
}
