import {
  AssetDetailSchema,
  CityDishesResponseSchema,
  TripPlanResponseSchema,
  WeatherResponseSchema,
  type AssetDetail,
  type ChatCitation,
  type ChatCitationKind,
  type Lang,
  type TripPlanResponse,
} from "@vagabonds/contracts";
import { z } from "zod";
import { describeIssues } from "../../lib/validate.ts";
import { toIdFragment } from "../assets/assets.repository.ts";
import { addDays } from "../planner/planner.routes.ts";
import type { ToolSpec } from "./assistant.model.ts";
import type { AssistantRepository } from "./assistant.repository.ts";

/**
 * The tools the model may call. Each one reads our own API (through `ApiGet`, so
 * visibility, language and mapping rules stay in one place) and returns a compact
 * JSON text for the model. Every item the model may cite gets a numbered `ref`.
 */

/** GET on one of our own routes: the status code and the parsed JSON body. */
export type ApiGet = (path: string, query: Record<string, string>) => Promise<{ statusCode: number; body: unknown }>;

/** Numbers the sources of one question; the same item keeps its number. */
export class SourceRegistry {
  private readonly byKey = new Map<string, ChatCitation>();

  add(kind: ChatCitationKind, id: string, title: string): number {
    const key = `${kind}:${id}`;
    const existing = this.byKey.get(key);
    if (existing) return existing.ref;
    const ref = this.byKey.size + 1;
    this.byKey.set(key, { ref, kind, id, title });
    return ref;
  }

  get(ref: number): ChatCitation | undefined {
    return [...this.byKey.values()].find((source) => source.ref === ref);
  }
}

export interface ToolContext {
  api: ApiGet;
  repository: AssistantRepository;
  sources: SourceRegistry;
  lang: Lang;
  /** Local date and hour of the question (Türkiye). */
  today: string;
  hour: number;
}

export interface ToolResult {
  /** JSON text handed to the model. */
  content: string;
  /** Set by `plan_trip`, for the response's `attachments.trip`. */
  trip?: TripPlanResponse;
}

// Keeps a tool result within a small model's context window.
const SECTION_CHARS = 1_200;
const ASSET_CHARS = 7_000;
const DISH_CHARS = 400;
const SEARCH_LIMIT = 5;

/** Models write "Bursa" or "bursa"; city codes are lowercase ASCII. */
const CityArg = z
  .string()
  .min(2)
  .max(40)
  .transform((value) => toIdFragment(value).replace(/-/g, ""));

const ARGS = {
  search_assets: z.object({ query: z.string().trim().min(2).max(120), city: CityArg.optional() }),
  asset_details: z.object({ id: z.string().trim().min(2).max(120) }),
  plan_trip: z.object({
    city: CityArg,
    duration: z.enum(["half", "1", "2"]).default("1"),
    theme: z
      .string()
      .regex(/^(type|era):[a-z0-9-]+$/)
      .optional(),
    date: z.iso.date().optional(),
  }),
  city_dishes: z.object({ city: CityArg, kind: z.enum(["main", "meze", "dessert", "street"]).optional() }),
  weather: z.object({ city: CityArg }),
} as const;

type ToolName = keyof typeof ARGS;
type ToolArgs<Name extends ToolName> = z.output<(typeof ARGS)[Name]>;

const cityParam = { type: "string", description: "İl kodu, küçük harf (ör. bursa, hatay, konya)" };
/** From this hour a trip without a date starts tomorrow: today's stops from 09:00 are already past. */
const LATE_HOUR = 16;

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "search_assets",
    description:
      "Vakıf eserlerini adında ya da metninde geçen kelimelerle arar (cami, han, hamam, kişi adı, olay...). En iyi 5 eseri id ve kısa bir alıntıyla döner.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Aranacak kelimeler" }, city: cityParam },
      required: ["query"],
    },
  },
  {
    name: "asset_details",
    description:
      "Bir eserin kaynaklı bilgileri: tarihçe bölümleri, banisi, mimarı, vakfiyesi, kitabeleri, rivayetleri, ziyaret ve erişilebilirlik bilgisi.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Eser id'si (search_assets sonucundan)" } },
      required: ["id"],
    },
  },
  {
    name: "plan_trip",
    description:
      "Bir ilde yarım, bir ya da iki günlük gezi planı: önemli eserler önce, hava tahminine göre sıralı, öğle ve tatlı molalarında yöresel lezzetle.",
    parameters: {
      type: "object",
      properties: {
        city: cityParam,
        duration: { type: "string", enum: ["half", "1", "2"], description: "half: yarım gün, 1: tam gün, 2: iki gün" },
        theme: { type: "string", description: "İsteğe bağlı: type:<tür kodu> (ör. type:cami, type:han) ya da era:<dönem kodu>" },
        date: { type: "string", description: "İsteğe bağlı: ilk günün tarihi YYYY-MM-DD (bugünden en çok 2 gün sonrası)" },
      },
      required: ["city"],
    },
  },
  {
    name: "city_dishes",
    description: "Bir ilin coğrafi işaretli yöresel lezzetleri (Türk Patent tescilli), açıklamaları ve hikâyeleriyle.",
    parameters: {
      type: "object",
      properties: {
        city: cityParam,
        kind: {
          type: "string",
          enum: ["main", "meze", "dessert", "street"],
          description: "İsteğe bağlı: ana yemek, meze, tatlı, sokak lezzeti",
        },
      },
      required: ["city"],
    },
  },
  {
    name: "weather",
    description: "Bir ilin anlık hava durumu ve 3 günlük tahmini.",
    parameters: { type: "object", properties: { city: cityParam }, required: ["city"] },
  },
];

const failure = (message: string): ToolResult => ({ content: JSON.stringify({ error: message }) });

const clip = (text: string | null | undefined, max: number) => (!text ? null : text.length > max ? `${text.slice(0, max)}…` : text);

const hhmm = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** The parts of an asset a model answers from. Visitor contributions are never included. */
export function compactAsset(asset: AssetDetail, ref: number): Record<string, unknown> {
  const sections = [];
  let budget = ASSET_CHARS;
  for (const section of asset.sections) {
    if (budget <= 0) break;
    const text = clip(section.body, Math.min(SECTION_CHARS, budget))!;
    budget -= text.length;
    sections.push({ title: section.title, text, confidence: section.confidence.label });
  }
  return {
    ref,
    id: asset.id,
    name: asset.name,
    type: asset.type.label,
    city: asset.city.label,
    district: asset.district,
    era: asset.era?.label ?? null,
    dating: asset.datingDisplay,
    summary: asset.summary,
    founder: asset.founder && { name: asset.founder.name, role: asset.founder.role, confidence: asset.founder.confidence?.label },
    architect: asset.architect && {
      name: asset.architect.name,
      candidates: asset.architect.candidates.map((candidate) => candidate.name),
      confidence: asset.architect.confidence?.label,
    },
    waqf: asset.waqf && { name: asset.waqf.name, deedDate: asset.waqf.deedDate, conditions: clip(asset.waqf.conditions, 600) },
    sections,
    facts: asset.facts.map((fact) => ({
      label: fact.label,
      value: fact.value ?? (fact.valueNum !== null ? `${fact.valueNum}${fact.unit ? ` ${fact.unit}` : ""}` : null),
    })),
    timeline: asset.timeline.map((event) => ({
      year: event.year,
      title: event.title,
      note: clip(event.note, 200),
      confidence: event.confidence.label,
    })),
    legends: asset.legends.map((legend) => ({ title: legend.title, text: clip(legend.body, 500), verdict: legend.verdict })),
    inscriptions: asset.inscriptions
      .filter((inscription) => inscription.translation)
      .map((inscription) => ({ location: inscription.location, translation: clip(inscription.translation, 500), year: inscription.gregorian })),
    visit: asset.visit,
    accessibility: {
      wheelchair: asset.accessibility.wheelchair,
      ramp: asset.accessibility.ramp,
      verifiedOnSite: asset.accessibility.verified,
      notes: asset.accessibility.notes,
    },
  };
}

function compactTrip(trip: TripPlanResponse, ref: number): Record<string, unknown> {
  return {
    ref,
    city: trip.city.label,
    duration: trip.duration,
    days: trip.days.map((day) => ({
      day: day.day,
      date: day.date,
      weather: day.weatherNote.text,
      items: day.items.map((item) =>
        item.kind === "stop"
          ? { at: hhmm(item.at), stop: item.asset.name, id: item.asset.id, setting: item.setting, visitMinutes: item.visitMinutes }
          : { at: hhmm(item.at), meal: item.label, dish: item.dish?.name ?? null, minutes: item.minutes },
      ),
    })),
    notPlanned: trip.notPlannedCount,
    note: trip.estimateNote,
  };
}

const TOOLS: { [Name in ToolName]: (args: ToolArgs<Name>, context: ToolContext) => Promise<ToolResult> } = {
  async search_assets({ query, city }, { repository, sources, lang }) {
    const found = await repository.searchAssets(query, { city, lang, limit: SEARCH_LIMIT });
    if (found.length === 0) return { content: JSON.stringify({ results: [], note: "No matching asset in the dataset." }) };
    return { content: JSON.stringify({ results: found.map((hit) => ({ ref: sources.add("asset", hit.id, hit.name), ...hit })) }) };
  },

  async asset_details({ id }, { api, sources, lang }) {
    const { statusCode, body } = await api(`/assets/${encodeURIComponent(id)}`, { lang });
    if (statusCode === 400 || statusCode === 404) return failure(`No asset with id "${id}"; use search_assets first.`);
    const asset = AssetDetailSchema.parse(body);
    return { content: JSON.stringify(compactAsset(asset, sources.add("asset", asset.id, asset.name))) };
  },

  async plan_trip({ city, duration, theme, date }, { api, sources, lang, today, hour }) {
    const start = date ?? (hour >= LATE_HOUR ? addDays(today, 1) : undefined);
    const { statusCode, body } = await api("/routes/trip", { city, duration, lang, ...(theme && { theme }), ...(start && { date: start }) });
    if (statusCode === 404) return failure(`Unknown city "${city}".`);
    if (statusCode === 400) return failure("Invalid trip parameters: the date must be today or within the next 2 days.");
    const trip = TripPlanResponseSchema.parse(body);
    const days = trip.duration === "half" ? "½" : trip.duration;
    const title = `${trip.city.label} · ${days} ${lang === "en" ? "day trip" : "günlük gezi"}`;
    return { content: JSON.stringify(compactTrip(trip, sources.add("trip", trip.city.code, title))), trip };
  },

  async city_dishes({ city, kind }, { api, sources, lang }) {
    const { statusCode, body } = await api(`/cities/${encodeURIComponent(city)}/dishes`, { lang });
    if (statusCode === 400 || statusCode === 404) return failure(`Unknown city "${city}".`);
    const { dishes } = CityDishesResponseSchema.parse(body);
    return {
      content: JSON.stringify({
        dishes: dishes
          .filter((dish) => !kind || dish.kind.code === kind)
          .map((dish) => ({
            ref: sources.add("dish", dish.id, dish.name),
            name: dish.name,
            kind: dish.kind.label,
            district: dish.district,
            description: clip(dish.description, DISH_CHARS),
            story: clip(dish.story, DISH_CHARS),
          })),
      }),
    };
  },

  async weather({ city }, { api, sources, lang }) {
    const { statusCode, body } = await api("/weather", { city, lang });
    if (statusCode === 400 || statusCode === 404) return failure(`Unknown city "${city}".`);
    const weather = WeatherResponseSchema.parse(body);
    if (!weather.available) return failure("Weather is unavailable right now.");
    const title = `${weather.city.label} · ${lang === "en" ? "weather" : "hava durumu"}`;
    return {
      content: JSON.stringify({ ref: sources.add("weather", weather.city.code, title), current: weather.current, daily: weather.daily }),
    };
  },
};

/** Runs a tool call from the model. A bad name or argument becomes an error text for the model, never a throw. */
export async function runTool(name: string, rawArgs: string, context: ToolContext): Promise<ToolResult> {
  if (!Object.hasOwn(ARGS, name)) return failure(`Unknown tool "${name}".`);
  const toolName = name as ToolName;
  let args: unknown;
  try {
    args = rawArgs.trim() === "" ? {} : JSON.parse(rawArgs);
  } catch {
    return failure("Arguments are not valid JSON.");
  }
  const parsed = ARGS[toolName].safeParse(args);
  if (!parsed.success) return failure(`Invalid arguments: ${describeIssues(parsed.error)}`);
  const tool = TOOLS[toolName] as (args: unknown, context: ToolContext) => Promise<ToolResult>;
  return tool(parsed.data, context);
}
