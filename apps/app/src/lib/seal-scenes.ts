import type { AssetDetail, Lang, Media } from "@vagabonds/contracts";

import { CAPSULE_SECONDS } from "@/content/capsules";
import { messages } from "@/i18n/messages";

/** One line of a seal's sequence, over a photo of the asset. */
export interface SealScene {
  id: string;
  head: string;
  text: string;
}

/** What fits on the screen and can be read in a scene's five seconds or so. */
const TEXT_MAX = 150;
const LONG_TEXT_MAX = 260;
const SCENES = 3;
/** History's upkeep: told last, when the record has nothing more to say. */
const ROUTINE_EVENTS = new Set(["restoration", "repair"]);
const OPENING_SECONDS = 4;
const CLOSING_SECONDS = 5;

/** Ordinals and short abbreviations end in a dot without ending a sentence: "II. Bayezid", "Hz. Ali". */
const NOT_AN_END = /(?:^|\s)(?:[IVXLCDM]+|\d+|\S{1,2})\.$/u;

/** The first sentence of a text, without its markdown; null when it is too long to read in a scene. */
export function firstSentence(source: string, max = TEXT_MAX): string | null {
  const text = source.replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim();
  for (const end of text.matchAll(/[.!?…]["”']?(?=\s)/gu)) {
    const sentence = text.slice(0, end.index + end[0].length);
    if (!NOT_AN_END.test(sentence)) return sentence.length <= max ? sentence : null;
  }
  return text.length > 0 && text.length <= max ? text : null;
}

/** Disputed and probable claims need a badge next to them (`ConfidenceSchema`); a scene has none, so it leaves them out. */
const certain = (claim: { confidence: { code: string } | null }) => !claim.confidence || claim.confidence.code === "certain";

/**
 * Up to three things worth a moment about the asset, from its own record: who built it, what its
 * deed says, what to look at, a legend (said to be one), what it is, its history. Nothing is written for the
 * sequence, so its words are as sourced as the asset's page.
 */
export function sealScenes(asset: AssetDetail, lang: Lang): SealScene[] {
  const w = messages[lang].seal;
  const scenes: SealScene[] = [];
  const add = (id: string, head: string, text: string | null | undefined) => {
    if (text && scenes.length < SCENES && !scenes.some((scene) => scene.text === text)) scenes.push({ id, head, text });
  };

  const year = asset.dating && certain(asset.dating) ? asset.yearLabel : null;
  const founder = asset.founder && certain(asset.founder) ? asset.founder.name : null;
  if (founder) add("origin", year ?? w.sceneOrigin, w.sceneBuilt(founder));

  if (asset.waqf && certain(asset.waqf)) {
    add("waqf", w.sceneWaqf, firstSentence(asset.waqf.deedExcerpt ?? "") ?? firstSentence(asset.waqf.conditions ?? ""));
  }

  // One of a kind first, so three scenes tell three different things; then whatever is left.
  const highlights = asset.highlights.map((highlight) => ({ id: `highlight-${highlight.feature}`, text: firstSentence(highlight.hint ?? "") ?? firstSentence(highlight.title) }));
  const legends = asset.legends.filter((legend) => legend.verdict !== "refuted_by_source").map((legend) => ({ id: `legend-${legend.id}`, text: firstSentence(legend.body) }));
  // Only an event's title: its note is often the editor's, on how the source was read. The year the origin gives is no news.
  const events = asset.timeline
    .filter((event) => certain(event) && event.year !== null && event.year !== asset.dating?.startYear && String(event.year) !== asset.yearLabel)
    .sort((a, b) => Number(ROUTINE_EVENTS.has(a.type.code)) - Number(ROUTINE_EVENTS.has(b.type.code)))
    .map((event) => ({ id: `event-${event.id}`, head: String(event.year), text: firstSentence(event.title) }));

  const highlight = highlights.find((h) => h.text);
  if (highlight) add(highlight.id, w.sceneHighlight, highlight.text);
  const legend = legends.find((l) => l.text);
  if (legend) add(legend.id, w.sceneLegend, legend.text);
  add("summary", w.sceneStory, firstSentence(asset.summary));
  for (const event of events) add(event.id, event.head, event.text);
  for (const h of highlights) add(h.id, w.sceneHighlight, h.text);
  for (const l of legends) add(l.id, w.sceneLegend, l.text);
  // A record with nothing short gets its summary's opening at more length, rather than no words at all.
  if (scenes.length === 0) add("summary", w.sceneStory, firstSentence(asset.summary, LONG_TEXT_MAX));
  return scenes;
}

/** The photos to show, the cover first, then the rest in order; none from above, no drawings. */
export function scenePhotos(asset: AssetDetail): Media[] {
  const photos = asset.media.filter((media) => media.kind === "photo" && media.subject !== "aerial");
  return [...photos.filter((media) => media.isCover), ...photos.filter((media) => !media.isCover)];
}

/** How long each step lasts, in seconds: the opening, every scene, the closing. Together a capsule's length. */
export function stepSeconds(scenes: number): number[] {
  const middle = CAPSULE_SECONDS - OPENING_SECONDS - CLOSING_SECONDS;
  if (scenes === 0) return [middle + OPENING_SECONDS, CLOSING_SECONDS];
  return [OPENING_SECONDS, ...Array.from({ length: scenes }, () => middle / scenes), CLOSING_SECONDS];
}
