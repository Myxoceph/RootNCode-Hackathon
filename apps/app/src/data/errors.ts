/** The part of a `ZodError` we read; keeps the app from depending on zod directly. */
interface SchemaError {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}

/**
 * - `invalid`: the data arrived but does not match the contract.
 * - `unavailable`: the data could not be fetched at all (network, server down).
 */
export type DataErrorKind = "invalid" | "unavailable";

export class DataError extends Error {
  readonly kind: DataErrorKind;
  /** Developer-facing details, e.g. "monuments.0.latitude: Too big". Never shown in production. */
  readonly details: string[];

  constructor(kind: DataErrorKind, message: string, details: string[] = []) {
    super(message);
    this.name = "DataError";
    this.kind = kind;
    this.details = details;
  }

  static fromSchema(source: string, error: SchemaError): DataError {
    return new DataError(
      "invalid",
      `${source} beklenen biçimde değil.`,
      error.issues.map((issue) => `${issue.path.map(String).join(".") || "(kök)"}: ${issue.message}`),
    );
  }
}
