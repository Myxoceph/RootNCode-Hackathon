import type { z } from "zod";
import { HttpError } from "./http-error.ts";

export function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

/** Parses request input with Zod; failures become a 400 with the given error code. */
export function parseWith<T extends z.ZodType>(schema: T, value: unknown, code: string): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, code, describeIssues(result.error));
  return result.data;
}
