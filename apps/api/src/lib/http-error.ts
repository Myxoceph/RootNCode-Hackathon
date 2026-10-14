/**
 * An expected, client-facing error. The error handler turns it into
 * `{ error: { code, message } }` with the given status code.
 */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
