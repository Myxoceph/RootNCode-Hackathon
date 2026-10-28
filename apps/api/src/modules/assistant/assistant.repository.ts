import type { Lang } from "@vagabonds/contracts";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import { pick } from "../../lib/lang.ts";
import { toIdFragment, visibleStatuses, type AssetVisibility } from "../assets/assets.repository.ts";

export interface AssetSearchHit {
  id: string;
  name: string;
  city: string;
  type: string;
  district: string;
  /** A short passage around the first matching word, or the summary when only the name matched. */
  snippet: string;
}

export interface AssistantRepository {
  /** Visible assets whose name or text mentions the query's words, best match first. */
  searchAssets(query: string, options: { city?: string | undefined; lang: Lang; limit: number }): Promise<AssetSearchHit[]>;
}

// Words that would match almost every text.
const STOPWORDS = new Set([
  "ve", "ile", "bir", "bu", "şu", "da", "de", "mi", "mı", "ne", "nedir", "hangi", "nerede", "kim", "kimdir", "için",
  "the", "and", "what", "where", "who", "which", "about",
]);
const MAX_TERMS = 6;
const CANDIDATES = 40;
const SNIPPET_CHARS = 240;

/** Lowercase search words, without stopwords and very short words. */
export function searchTerms(query: string): string[] {
  const words = query
    .toLocaleLowerCase("tr")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  return [...new Set(words)].slice(0, MAX_TERMS);
}

/**
 * PostgreSQL's ILIKE does not fold Turkish İ/ı, so a word is also tried with its
 * first letter capitalised the Turkish way ("inegöl" → "İnegöl").
 */
function variants(term: string): string[] {
  const capitalised = term.charAt(0).toLocaleUpperCase("tr") + term.slice(1);
  return capitalised === term ? [term] : [term, capitalised];
}

function hits(text: string | null | undefined, term: string): number {
  if (!text) return 0;
  return text.toLocaleLowerCase("tr").split(term).length - 1;
}

function snippetAround(text: string, term: string): string {
  const at = Math.max(0, text.toLocaleLowerCase("tr").indexOf(term));
  const start = Math.max(0, at - Math.floor(SNIPPET_CHARS / 3));
  const slice = text.slice(start, start + SNIPPET_CHARS).trim();
  return `${start > 0 ? "…" : ""}${slice}${start + SNIPPET_CHARS < text.length ? "…" : ""}`;
}

const searchSelect = {
  id: true,
  name_tr: true,
  name_en: true,
  district: true,
  summary_tr: true,
  summary_en: true,
  city: { select: { label_tr: true, label_en: true } },
  asset_type: { select: { label_tr: true, label_en: true } },
  asset_section: { select: { title_tr: true, body_tr: true, body_en: true }, orderBy: { sort_order: "asc" } },
} satisfies Prisma.assetSelect;

type SearchRecord = Prisma.assetGetPayload<{ select: typeof searchSelect }>;

/**
 * ASCII form of a word without its last letter for longer words, so a suffix does not
 * stop a match: "camii" finds "Ulucami", "hamamı" finds "Hamam".
 */
function stemOf(term: string): string {
  const ascii = toIdFragment(term);
  return ascii.length >= 5 ? ascii.slice(0, -1) : ascii;
}

/** Name score: every query word found in the name, accents ignored ("ordekli" finds "Ördekli"). */
function nameScore(names: Array<string | null>, terms: string[]): number {
  const ascii = names.map((name) => (name ? toIdFragment(name) : "")).join(" ");
  const found = terms.filter((term) => {
    const stem = stemOf(term);
    return stem !== "" && ascii.includes(stem);
  }).length;
  // A word in the name says far more than one somewhere in a long text; all of them, more still.
  return found * 10 + (found === terms.length ? 15 : 0);
}

function textScore(record: SearchRecord, terms: string[]): number {
  return terms.reduce(
    (sum, term) => sum + Math.min(record.asset_section.reduce((n, s) => n + hits(s.body_tr, term) + hits(s.title_tr, term), 0), 5),
    0,
  );
}

function toHit(record: SearchRecord, terms: string[], lang: Lang): AssetSearchHit {
  const bodies = record.asset_section.map((s) => pick(s.body_tr, s.body_en, lang));
  const match = terms
    .map((term) => ({ term, body: bodies.find((body) => hits(body, term) > 0) }))
    .find(({ body }) => body !== undefined);
  return {
    id: record.id,
    name: pick(record.name_tr, record.name_en, lang),
    city: pick(record.city.label_tr, record.city.label_en, lang),
    type: pick(record.asset_type.label_tr, record.asset_type.label_en, lang),
    district: record.district,
    snippet: match?.body ? snippetAround(match.body, match.term) : pick(record.summary_tr, record.summary_en, lang),
  };
}

/**
 * The dataset is a few hundred assets with a few thousand sections, so scanning names
 * and an ILIKE over the sections is fast enough and needs no search index.
 */
export function createAssistantRepository(prisma: PrismaClient, visibility: AssetVisibility): AssistantRepository {
  const statuses = visibleStatuses(visibility);

  return {
    async searchAssets(query, { city, lang, limit }) {
      const terms = searchTerms(query);
      if (terms.length === 0) return [];

      const visible: Prisma.assetWhereInput = { status: { in: statuses }, ...(city && { city_code: city }) };
      // Names are scored over every visible asset (a few hundred short rows), so a word
      // that many names share cannot crowd out the one that matches all the words.
      const names = await prisma.asset.findMany({ where: visible, select: { id: true, name_tr: true, name_en: true } });
      const byName = new Map(
        names
          .map((asset) => [asset.id, nameScore([asset.name_tr, asset.name_en], terms)] as const)
          .filter(([, score]) => score > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, CANDIDATES),
      );
      const inText = await prisma.asset.findMany({
        where: {
          ...visible,
          OR: terms.flatMap((term) =>
            variants(term).map((word) => ({ asset_section: { some: { body_tr: { contains: word, mode: "insensitive" as const } } } })),
          ),
        },
        select: { id: true },
        take: CANDIDATES,
      });
      const ids = [...new Set([...byName.keys(), ...inText.map((asset) => asset.id)])];
      const records = await prisma.asset.findMany({ where: { id: { in: ids } }, select: searchSelect });

      return records
        .map((record) => ({ record, score: (byName.get(record.id) ?? 0) + textScore(record, terms) }))
        .sort((a, b) => b.score - a.score || a.record.name_tr.localeCompare(b.record.name_tr, "tr"))
        .slice(0, limit)
        .map(({ record }) => toHit(record, terms, lang));
    },
  };
}
