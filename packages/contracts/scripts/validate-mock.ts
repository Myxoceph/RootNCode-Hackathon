/**
 * Validates mock/mock_monuments.json against the data contract.
 *
 * 1. Schema: the payload must parse with MonumentsPayloadSchema.
 * 2. Integrity: ids/slugs are unique, every relation points at a monument in
 *    the payload with a matching slug and name, and every edge appears on both
 *    ends with opposite directions (as the API will return it).
 *
 * Usage: npm run contracts:validate
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MONUMENTS_CONTRACT_VERSION, MonumentsPayloadSchema, type MonumentsPayload } from "../src/index";

const MOCK_PATH = fileURLToPath(new URL("../mock/mock_monuments.json", import.meta.url));

function checkIntegrity(payload: MonumentsPayload): string[] {
  const errors: string[] = [];
  const byId = new Map(payload.monuments.map((m) => [m.id, m]));

  const seen = new Set<string>();
  const allIds = [
    ...payload.monuments.flatMap((m) => [
      m.id,
      ...m.inscriptions.map((i) => i.id),
      ...m.visitorTips.map((t) => t.id),
    ]),
    ...payload.cityCuisines.map((c) => c.id),
  ];
  for (const id of allIds) {
    if (seen.has(id)) errors.push(`duplicate id: ${id}`);
    seen.add(id);
  }

  const slugs = payload.monuments.map((m) => m.slug);
  for (const slug of new Set(slugs)) {
    if (slugs.filter((s) => s === slug).length > 1) errors.push(`duplicate slug: ${slug}`);
  }

  for (const monument of payload.monuments) {
    for (const rel of monument.relations) {
      const where = `${monument.slug} -> ${rel.relatedMonumentSlug} (${rel.relationType})`;
      const related = byId.get(rel.relatedMonumentId);

      if (rel.relatedMonumentId === monument.id) {
        errors.push(`${where}: monument is related to itself`);
        continue;
      }
      if (!related) {
        errors.push(`${where}: relatedMonumentId not found in payload`);
        continue;
      }
      if (related.slug !== rel.relatedMonumentSlug || related.name !== rel.relatedMonumentName) {
        errors.push(`${where}: slug/name does not match the related monument`);
      }

      const mirrored = related.relations.some(
        (r) =>
          r.relatedMonumentId === monument.id &&
          r.relationType === rel.relationType &&
          r.direction !== rel.direction,
      );
      if (!mirrored) errors.push(`${where}: missing mirrored edge on ${related.slug}`);
    }
  }

  return errors;
}

const raw: unknown = JSON.parse(readFileSync(MOCK_PATH, "utf8"));
const result = MonumentsPayloadSchema.safeParse(raw);

if (!result.success) {
  console.error("✖ Schema validation failed:\n");
  for (const issue of result.error.issues) {
    console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}

const integrityErrors = checkIntegrity(result.data);
if (result.data.version !== MONUMENTS_CONTRACT_VERSION) {
  integrityErrors.push(`version is ${result.data.version}, expected ${MONUMENTS_CONTRACT_VERSION}`);
}
if (integrityErrors.length > 0) {
  console.error("✖ Integrity check failed:\n");
  for (const error of integrityErrors) console.error(`  - ${error}`);
  process.exit(1);
}

const { monuments, cityCuisines } = result.data;
const edgeCount = monuments.reduce((n, m) => n + m.relations.length, 0) / 2;
console.log(
  `✔ mock_monuments.json is valid: ${monuments.length} monuments, ${edgeCount} relations, ${cityCuisines.length} city cuisines`,
);
