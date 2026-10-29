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
- Format example: `data/eserler/bursa/osmangazi/bursa-osmangazi-ulucami.json` — structure and style only;
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
  `meta.from` = the chapter PDF name without the leading number and without `.pdf` (e.g. `Sivil Mimari`, `Kestel`), placed right after `reviewed_by`.
- `accessibility`: all statuses `"unknown"`, `verified: false`; `audio_description` may be
  written from the book's architectural description (factual, from the text only).

## Output
Write the files into `data/eserler/<il>/<ilçe-slug>/` (e.g. `data/eserler/bursa/kestel/`; ascii, lowercase) and validate them together until there is no `✗`
(warnings are fine):
```
python3 data/tools/validate.py data/eserler/<il>/<ilçe>/<id1>.json data/eserler/<il>/<ilçe>/<id2>.json ...
```

## Final report (under 150 words)
Files written, validator result, per-file counts (sections, legends, facts, timeline events,
inscriptions, relations), and the points you were least sure about.

## Hard rules (learned from reviewing earlier drafts)
- **No invented numbers.** `dating.start_year` / `end_year` only when the text gives that year or
  range; otherwise `null` and say why in `basis`. Never fill a range from a century guess.
- **No placeholder values.** Never write "Bilinmiyor", "Unknown", "N/A" as a name. Unknown founder /
  architect / waqf → `null` plus a todo.
- **Founder only if stated.** `founder` is the person the text says had the building made. A
  person who only repaired it goes to `timeline` / `people`, not `founder`.
- **Translations are the book's.** `inscriptions[].translation.tr` is copied from the book's
  "Mealen" / "Translation" text. If the book gives none, set `translation: null` (or put the
  inscription text itself with a note); never translate yourself.
- **Relations are one-directional.** Write child → parent (or younger → older) once. Never write
  the reverse relation in the other record. Use `same_complex` for buildings of one külliye.
  `same_founder` only when the text names the same person as founder of both.
- **`parent_id`** only when the parent record is created in your range and its id is known.
- **Era.** `era` must be one of the codes in `enums.json`; if none fits (antique, Byzantine) use
  `null` and a todo.
- **Language of inscriptions.** Use the schema codes; when the text does not name the language
  use `"other"` and explain in `note`.
- **Dates that disagree** (Hijri vs Gregorian, Turkish vs English text, two pages) → keep both in
  `data_quality_notes`, set `confidence: disputed`.
- **`meta.from`** = the chapter PDF name without number and `.pdf` (e.g. `İznik`), directly after
  `reviewed_by`.
- **District folder.** Write into `data/eserler/<il>/<ilçe-slug>/` and set `location.district`
  to the proper district name (e.g. `İznik`).
- **Photos.** Do not add media; photos are attached later by `match_photos.py`. Keep
  `media: []`, `media_folder: null`, and the todo.

## Konya Vakıf Eserleri I. Cilt (source `vk-konya-c1`) — differences
- One single PDF for the whole volume: `data/build/cache/text/konya-1.txt` (not one file per chapter).
  You get a PDF-page range; handle only buildings whose heading STARTS inside it.
- A PDF page is a book spread: the text of the left and right page is interleaved, Turkish and
  English blocks alternate. The printed page number(s) stand alone at the END of the PDF page
  (`75`, or two numbers like `76 77`). Use the printed numbers of the PDF pages a section spans
  for `source_refs[].pages` (e.g. `76-77`). Photo-only pages have no text.
- The table of contents (PDF pages 6-7 of the same file) lists each building's start page; use it
  to find building boundaries.
- Region `ic-anadolu`, city `konya`, ids `konya-<ilçe>-<ad>`, folder `data/eserler/konya/<ilçe>/`.
- There is no Drive photo archive for this volume: keep `media: []`, `media_folder: null`.
- `meta.from` = `"konya-envanteri-1_cilt-web"`.

