# Ajan talimatı: bölük metninden eser JSON taslağı

> Bu dosya Claude Code'da **Sonnet** alt ajanına verilir (bkz. [README.md](README.md)).
> `<…>` ile işaretli yerleri doldurun. Denemede (2026-10-14) Sonnet uydurma yapmadan,
> kaynaktaki çelişkileri işaretleyerek veri ekibinin elle yazdığı kayda çok yakın sonuç verdi.

---

You are drafting structured dataset records from a historical inventory book chapter.
Accuracy and honesty matter far more than completeness.

## Task
The chapter text below describes **<BÖLÜK ADI>** (<il>, <ilçe>). Create ONE eser JSON file per
building described in its own section. If the chapter describes a complex (külliye) with several
buildings, also create a parent record (`type: "kulliye"`) and set `parent_id` on the children.
Every file must pass the validator.

## Inputs (read only these)
- Chapter text: `<METİN DOSYASI, ör. data/build/cache/text/6-orhan-bey.txt>`
  `===== PAGE n =====` markers are PDF pages; standalone 2-3 digit lines are the BOOK's printed
  page numbers — use those for `source_refs[].pages`.
- Rules: `data/README.md` — read ONLY section 3 (backend rules), section 4 (JSON structure)
  and section 11 (data team rules).
- Schema: `data/schema/eser.schema.json` · Codes: `data/enums.json` · Sources: `data/sources.json`
  (this chapter's source id: `<ör. vk-bursa-c1>`)
- Format example: `data/eserler/bursa/bursa-osmangazi-ulucami.json` — structure and style only;
  never copy its facts.

Do not search the web. Do not overwrite any existing file in `data/eserler/`; if a record with
the same id already exists, stop and report it.

## Rules
- Only information stated in the chapter text. No outside knowledge. Unknown → `null` /
  `"unknown"` and a line in `meta.todos`.
- `confidence`: `certain` when the source states it plainly, `probable` for estimates or links
  the book implies but does not state, `disputed` when the source gives multiple views or
  contradicts itself, `legend` only for legends. Legends/folk beliefs go to `legends[]`.
- Source contradictions — including between the Turkish and English text, and Hijri/Gregorian
  dates that do not match — keep the source's values, mark `disputed`, and explain in
  `meta.data_quality_notes` (`[{field, note}]`).
- Every section/fact/timeline event/inscription/relation needs `source_refs` with printed pages.
- Text fields are `{ "tr": ..., "en": ... }`; use the book's English translation for `en`
  (condense, do not invent).
- Inscriptions: copy transliteration exactly as printed (keep â, î, û, ʿ, ’);
  `translation.tr` from the book's "Mealen" text.
- Waqf information goes to `waqf` and to relations (`waqf_income`, `waqf_land`, `same_complex`,
  `same_founder` … see enums.json). Relation target ids: `<il>-<ilçe>-<ad>` (lowercase, ascii,
  hyphens); targets may not exist yet. If a target's district is not in the text, say so in todos.
- Do NOT invent coordinates, photos, Drive ids or file names: omit `location.coordinates`, set
  `media: []`, `archive_media: []`, `media_folder: null`, and add todos for both.
- Ids: `<il>-<ilçe>-<ad>`; file name = id. `meta.status: "draft"`,
  `meta.prepared_by: "ai-draft:sonnet"`, `meta.reviewed_by: null`, dates = today.
- `accessibility`: all statuses `"unknown"`, `verified: false`; `audio_description` may be
  written from the book's architectural description (factual, from the text only).

## Output
Write the files into `data/eserler/<il>/` and validate them together until there is no `✗`
(warnings are fine):
```
python3 data/tools/validate.py data/eserler/<il>/<id1>.json data/eserler/<il>/<id2>.json ...
```

## Final report (under 150 words)
Files written, validator result, per-file counts (sections, legends, facts, timeline events,
inscriptions, relations), and the points you were least sure about.
