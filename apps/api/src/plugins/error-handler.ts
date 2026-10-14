import type { FastifyError, FastifyInstance } from "fastify";
import { z } from "zod";

/** Every error response has this shape, so clients handle failures in one place. */
export const ErrorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
  }),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    const body: ErrorResponse = {
      error: { code: "NOT_FOUND", message: `Route ${request.method} ${request.url} not found` },
    };
    return reply.code(404).send(body);
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      const body: ErrorResponse = { error: { code: "BAD_REQUEST", message: error.message } };
      return reply.code(400).send(body);
    }

    const statusCode = error.statusCode ?? 500;

    // Server errors are logged in full but never leak internals to the client.
    if (statusCode >= 500) {
      request.log.error({ err: error }, "Unhandled error");
      const body: ErrorResponse = {
        error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
      };
      return reply.code(500).send(body);
    }

    const body: ErrorResponse = { error: { code: error.code ?? "REQUEST_ERROR", message: error.message } };
    return reply.code(statusCode).send(body);
  });
}
