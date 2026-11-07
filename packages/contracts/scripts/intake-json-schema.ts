/**
 * Writes the JSON shapes of Veri Döngüsü's tables (intake.schema.ts) as JSON Schema for the Python
 * worker (data/pipeline), so what it writes into the jsonb columns is checked against the same
 * contract the API reads with:
 *
 *   npm run intake-schema -w @vagabonds/contracts
 *
 * Output: data/pipeline/contracts/intake.schema.json (committed; regenerate after changing intake.schema.ts).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import {
  BookMapSchema,
  InscriptionDraftSchema,
  IntakeAiSchema,
  IntakeChatInputSchema,
  IntakeDraftKindSchema,
  IntakeDraftMediaSchema,
  IntakeDraftStatusSchema,
  IntakeJobKindSchema,
  IntakeJobStatusSchema,
  IntakeLayoutSchema,
  IntakeSourceRefSchema,
  IntakeValidationSchema,
  PHOTO_SUBJECTS,
} from "../src/intake.schema";

const OUT = fileURLToPath(new URL("../../../data/pipeline/contracts/intake.schema.json", import.meta.url));

/** Column → shape: the jsonb columns of intake_job and intake_draft, and the enums of the text ones. */
const shapes = {
  "intake_job.status": IntakeJobStatusSchema,
  "intake_job.layout": IntakeLayoutSchema,
  "intake_job.book_map": BookMapSchema,
  "intake_job.input": IntakeChatInputSchema,
  "intake_job.kind": IntakeJobKindSchema,
  "intake_draft.kind": IntakeDraftKindSchema,
  "intake_draft.status": IntakeDraftStatusSchema,
  "intake_draft.media": z.array(IntakeDraftMediaSchema),
  "intake_draft.source_refs": z.array(IntakeSourceRefSchema),
  "intake_draft.validation": IntakeValidationSchema,
  "intake_draft.ai": IntakeAiSchema,
  "intake_draft.record (kind=inscription)": InscriptionDraftSchema,
};

const document = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $comment: "Generated from packages/contracts/src/intake.schema.ts; do not edit by hand.",
  photoSubjects: PHOTO_SUBJECTS,
  columns: Object.fromEntries(Object.entries(shapes).map(([column, schema]) => [column, z.toJSONSchema(schema, { io: "input" })])),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(document, null, 2)}\n`);
console.log(`${OUT}: ${Object.keys(shapes).length} columns`);
