/** The part of a `ZodError` we read; keeps the app from depending on zod directly. */
interface SchemaError {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}

/** Any `@vagabonds/contracts` schema. */
export interface SchemaParser<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: SchemaError };
}

/**
 * - `invalid`: the data arrived but does not match the contract.
 * - `unavailable`: the data could not be fetched at all (network, server down).
 * - `rejected`: the API refused a visitor's request (a limit, a ban, an input it does not accept).
 */
export type DataErrorKind = "invalid" | "unavailable" | "rejected";

export class DataError extends Error {
  readonly kind: DataErrorKind;
  /** Developer-facing details, e.g. "monuments.0.latitude: Too big". Never shown in production. */
  readonly details: string[];
  /** The API's error code, when the caller acts on it (e.g. `CONVERSATION_ARCHIVED`). */
  readonly code: string | null;

  constructor(kind: DataErrorKind, message: string, details: string[] = [], code: string | null = null) {
    super(message);
    this.name = "DataError";
    this.kind = kind;
    this.details = details;
    this.code = code;
  }

  static fromSchema(source: string, error: SchemaError, message = `${source} beklenen biçimde değil.`): DataError {
    return new DataError(
      "invalid",
      message,
      error.issues.map((issue) => `${issue.path.map(String).join(".") || "(kök)"}: ${issue.message}`),
    );
  }
}
