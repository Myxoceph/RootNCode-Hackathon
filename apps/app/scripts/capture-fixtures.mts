/**
 * Captures the mock data source's fixtures from a running API (Turkish).
 *
 * Run again whenever the contract changes:
 *   npm run start --workspace @vagabonds/api        # in another terminal, with the dataset imported
 *   npm run fixtures --workspace @vagabonds/app
 *
 * Writes src/data/fixtures/{assets,details,relations}.json. The list holds the first
 * Bursa page; details and relations cover the demo set below, so the mock can open them.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const API_URL = (process.env.API_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const OUT_DIR = fileURLToPath(new URL("../src/data/fixtures/", import.meta.url));
const LIST_LIMIT = 24;

/** Ulucami and the assets it is linked to. */
const DEMO_IDS = [
  "bursa-osmangazi-ulucami",
  "bursa-osmangazi-orhan-bey-camii",
  "bursa-osmangazi-emir-hani",
  "bursa-osmangazi-koza-hani",
  "bursa-osmangazi-yildirim-bayezid-bedesteni",
  "bursa-osmangazi-muradiye-kulliyesi",
];

async function get(path: string): Promise<unknown> {
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) throw new Error(`${response.status} ${path}: ${await response.text()}`);
  return response.json();
}

const list = (await get(`/assets?city=bursa&lang=tr&limit=${LIST_LIMIT}`)) as { items: Array<{ id: string }> };
const details: Record<string, unknown> = {};
const relations: Record<string, unknown> = {};
for (const id of DEMO_IDS) {
  details[id] = await get(`/assets/${id}?lang=tr`);
  relations[id] = await get(`/assets/${id}/relations?lang=tr`);
}

// The demo set comes first so it is visible without scrolling.
const summaries = (await get(`/assets?city=bursa&lang=tr&limit=500`)) as { items: Array<{ id: string }> };
const demoSummaries = DEMO_IDS.map((id) => summaries.items.find((a) => a.id === id)).filter((a) => a !== undefined);
list.items = [...demoSummaries, ...list.items.filter((a) => !DEMO_IDS.includes(a.id))].slice(0, LIST_LIMIT);
Object.assign(list, { total: list.items.length });

mkdirSync(OUT_DIR, { recursive: true });
const write = (name: string, data: unknown) => writeFileSync(`${OUT_DIR}${name}`, `${JSON.stringify(data, null, 2)}\n`);
write("assets.json", list);
write("details.json", details);
write("relations.json", relations);
console.log(`✔ ${list.items.length} list items, ${DEMO_IDS.length} details and relations from ${API_URL}`);
