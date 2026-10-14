import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { CONTRACT_VERSION } from "@vagabonds/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

/**
 * Converts a Zod schema to the JSON Schema used in the OpenAPI document, so the
 * docs are generated from the same schemas that validate requests and responses.
 */
export function toOpenApiSchema(schema: z.ZodType, io: "input" | "output" = "output"): Record<string, unknown> {
  const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema, { io, unrepresentable: "throw" });
  return jsonSchema;
}

/**
 * OpenAPI 3.1 document at /docs/json and Swagger UI at /docs.
 *
 * Route `schema` objects are documentation only: Zod stays the single source of
 * validation (keeping our error codes), and responses are serialized as-is with
 * JSON.stringify instead of Fastify's schema-based serializer.
 */
export function registerOpenApi(app: FastifyInstance): void {
  app.setValidatorCompiler(() => () => true);
  app.setSerializerCompiler(() => (data) => JSON.stringify(data));

  app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Vagabonds API",
        version: CONTRACT_VERSION,
        description:
          "Vakıf eserleri, kitabeler, eserler arası ilişki ağı, şehir mutfağı ve ziyaretçi ipuçları. " +
          "Yanıtlar `@vagabonds/contracts` sözleşmesiyle doğrulanır. " +
          "Hatalar her zaman `{ error: { code, message } }` biçimindedir.",
      },
      tags: [
        { name: "monuments", description: "Eserler ve şehir mutfakları" },
        { name: "system", description: "Sunucu durumu" },
      ],
    },
  });

  app.register(swaggerUi, { routePrefix: "/docs" });
}
