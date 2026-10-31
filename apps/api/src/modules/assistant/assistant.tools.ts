import {
  AssetDetailSchema,
  CityDishesResponseSchema,
  TransitEntryPointCodeSchema,
  TransitPlanResponseSchema,
  TripPlanResponseSchema,
  WeatherResponseSchema,
  type AssetDetail,
  type ChatCitation,
  type ChatCitationKind,
  type Lang,
  type TransitPlanResponse,
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
  /** The visitor's position, when the app sent it. */
  origin?: { lat: number; lng: number } | undefined;
}

export interface ToolResult {
  /** JSON text handed to the model. */
  content: string;
  /** Set by `plan_trip`, for the response's `attachments.trip`. */
  trip?: TripPlanResponse;
  /** Set by `transit_route`, for the response's `attachments.transit`. */
  transit?: TransitPlanResponse;
}

// Keeps a tool result within a small model's context window.
const SECTION_CHARS = 900;
// The answer's wait grows with the text the model reads: 7000 made the last call ~9 s on EVREN.
const ASSET_CHARS = 4_000;
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
  transit_route: z.object({
    to: z.string().trim().min(2).max(120),
    from: z.string().trim().min(2).max(120).default("current"),
  }),
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
      "Vakıf eserlerini adında ya da metninde geçen kelimelerle arar (cami, han, hamam, kişi adı, olay...). En iyi 5 eseri id, tarih, bani ve kısa bir alıntıyla döner; yalnızca tarihi ya da banisi soruluyorsa asset_details gerekmez.",
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
  {
    name: "transit_route",
    description:
      "Konya'da (pilot) bir esere otobüs ve tramvayla nasıl gidilir: yürüme, binilecek ve inilecek duraklar, hat ve saatler. Diğer illerde yoktur.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Varılacak eserin id'si (search_assets sonucundan)" },
        from: {
          type: "string",
          description: `Başlangıç: current (ziyaretçinin konumu), ${TransitEntryPointCodeSchema.options.join(", ")} ya da bir eserin id'si`,
        },
      },
      required: ["to"],
    },
  },
];

const failure = (message: string): ToolResult => ({ content: JSON.stringify({ error: message }) });

const clock = (iso: string) => iso.slice(11, 16);

/** The options in words the model can retell; the app draws the same plan on the map. */
function compactTransit(plan: TransitPlanResponse, ref: number): Record<string, unknown> {
  if (plan.itineraries.length === 0) {
    return { ref, from: plan.from.name, to: plan.to.name, options: [], note: "No bus or tram helps on this trip; suggest walking or a taxi." };
  }
  return {
    ref,
    from: plan.from.name,
    to: plan.to.name,
    // Set when nothing ran at the asked time (night): say the first departures are in the morning.
    searchedFrom: plan.searchedFrom,
    options: plan.itineraries.map((it) => ({
      leave: clock(it.departure),
      arrive: clock(it.arrival),
      minutes: it.durationMinutes,
      transfers: it.transfers,
      steps: it.legs.map((leg) =>
        leg.mode === "walk"
          ? `walk ${leg.distanceMeters} m to ${leg.to.name}`
          : `${leg.mode === "tram" ? leg.line?.name ?? "tram" : `bus ${leg.line?.name ?? ""}`}${leg.headsign ? ` towards ${leg.headsign}` : ""}: board at ${leg.from.name} ${clock(leg.departure)}, ${leg.stopsBetween + 1} stops, get off at ${leg.to.name} ${clock(leg.arrival)}`,
      ),
    })),
    source: `${plan.source.name}, ${plan.source.timetable}`,
  };
}

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
    // Without the note the model retried with every `kind` until the tool limit.
    if (dishes.length === 0) {
      return { content: JSON.stringify({ dishes: [], note: "The dataset has no registered dishes for this city yet; say so." }) };
    }
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

  async transit_route({ to, from }, { api, sources, lang, origin }) {
    const start = from === "current" ? origin && `${origin.lat},${origin.lng}` : from;
    if (!start) {
      return failure("The visitor's position is unknown: ask them to share their location, or where they start (a station, the bus terminal or a site).");
    }
    const { statusCode, body } = await api("/transit/plan", { from: start, to, lang });
    const code = (body as { error?: { code?: string } }).error?.code;
    if (code === "TRANSIT_NOT_AVAILABLE_HERE") return failure("Transit directions are piloted in Konya only, and only inside the city; say so.");
    if (statusCode === 404) return failure(`No asset with id "${to}"; use search_assets first.`);
    if (statusCode === 503) return failure("Transit directions are unavailable right now.");
    if (statusCode !== 200) return failure(`Cannot plan this trip (${code ?? statusCode}).`);
    const plan = TransitPlanResponseSchema.parse(body);
    const ref = sources.add("transit", plan.to.assetId ?? plan.city, `${plan.from.name} → ${plan.to.name}`);
    return { content: JSON.stringify(compactTransit(plan, ref)), transit: plan };
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
