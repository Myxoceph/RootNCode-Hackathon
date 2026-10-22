/**
 * Validates the app's mock fixtures (apps/app/src/data/fixtures) against the contract.
 *
 * 1. Schema: the list, every detail and every relations body parse with the
 *    `/assets` response schemas.
 * 2. Integrity: list ids are unique, every detail and relations entry is keyed
 *    by its own asset id and appears in the list, and every body carries the
 *    current CONTRACT_VERSION (otherwise recapture with `npm run fixtures`).
 *
 * Usage: npm run contracts:validate
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ZodType } from "zod";
import {
  AssetDetailSchema,
  AssetListResponseSchema,
  AssetRelationsResponseSchema,
  CONTRACT_VERSION,
} from "../src/index";

const FIXTURES_DIR = fileURLToPath(new URL("../../../apps/app/src/data/fixtures/", import.meta.url));

const readFixture = (name: string): unknown => JSON.parse(readFileSync(`${FIXTURES_DIR}${name}`, "utf8"));

const errors: string[] = [];

function parse<T>(schema: ZodType<T>, raw: unknown, where: string): T | null {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    errors.push(`${where}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  return null;
}

function checkVersion(version: string, where: string): void {
  if (version !== CONTRACT_VERSION) errors.push(`${where}: version is ${version}, expected ${CONTRACT_VERSION}`);
}

const list = parse(AssetListResponseSchema, readFixture("assets.json"), "assets.json");
const listIds = new Set<string>();
if (list) {
  checkVersion(list.version, "assets.json");
  for (const { id } of list.items) {
    if (listIds.has(id)) errors.push(`assets.json: duplicate id ${id}`);
    listIds.add(id);
  }
  if (list.total !== list.items.length) errors.push(`assets.json: total is ${list.total}, list has ${list.items.length}`);
}

const details = readFixture("details.json") as Record<string, unknown>;
for (const [key, raw] of Object.entries(details)) {
  const detail = parse(AssetDetailSchema, raw, `details.json ${key}`);
  if (!detail) continue;
  if (detail.id !== key) errors.push(`details.json ${key}: body is asset ${detail.id}`);
  if (list && !listIds.has(key)) errors.push(`details.json ${key}: not in assets.json`);
}

const relations = readFixture("relations.json") as Record<string, unknown>;
for (const [key, raw] of Object.entries(relations)) {
  const body = parse(AssetRelationsResponseSchema, raw, `relations.json ${key}`);
  if (!body) continue;
  checkVersion(body.version, `relations.json ${key}`);
  if (body.assetId !== key) errors.push(`relations.json ${key}: body is asset ${body.assetId}`);
  if (!(key in details)) errors.push(`relations.json ${key}: no matching details.json entry`);
}
for (const key of Object.keys(details)) {
  if (!(key in relations)) errors.push(`details.json ${key}: no matching relations.json entry`);
}

if (errors.length > 0) {
  console.error("✖ Fixture validation failed:\n");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `✔ app fixtures are valid (v${CONTRACT_VERSION}): ${listIds.size} list items, ` +
    `${Object.keys(details).length} details, ${Object.keys(relations).length} relations`,
);
