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
    // Routes have no base path to strip, and stripping would parse the relative server URL below as absolute.
    stripBasePath: false,
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Vagabonds API",
        version: CONTRACT_VERSION,
        description:
          "Vakıf eserleri: tarihçe, kitabeler, zaman çizelgesi, eserler arası ilişki ağı ve görseller; " +
          "her içerik kaynağı ve güven düzeyiyle birlikte. " +
          "Yanıtlar `@vagabonds/contracts` sözleşmesiyle doğrulanır. " +
          "Hatalar her zaman `{ error: { code, message } }` biçimindedir.",
      },
      // Relative to this document (`<api root>/docs/json`), so "Try it out" also works
      // when a proxy serves the API under a prefix (`/api` on the demo server).
      servers: [{ url: "..", description: "Bu API" }],
      tags: [
        { name: "assets", description: "Vakıf eserleri" },
        { name: "meta", description: "Kod listeleri ve etiketler" },
        { name: "planner", description: "Vakıf Travel Planner: tematik yürüyüş rotası ve hava durumu" },
        { name: "gastronomy", description: "Yöresel Kültür & Gastronomi: ilin coğrafi işaretli yöresel lezzetleri" },
        { name: "community", description: "Ziyaretçi Nabzı: anonim oturum, katkılar, nabız akışı" },
        { name: "assistant", description: "AI asistan: veri setinden, kaynaklı cevaplar" },
        { name: "moderation", description: "Katkı moderasyonu (moderatör token'ı gerekir)" },
        { name: "system", description: "Sunucu durumu" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            description: "`POST /auth/anonymous`, `/auth/register` ya da `/auth/login` ile alınan token",
          },
        },
      },
    },
  });

  // Replaces the API's `default-src 'none'` policy on the /docs routes with one Swagger UI loads under.
  // Based on the plugin's `staticCSP: true` policy, minus `upgrade-insecure-requests` (it would break the
  // docs on a demo server served over plain HTTP) and plus inline styles, which Swagger UI's bundle sets.
  app.register(swaggerUi, {
    routePrefix: "/docs",
    staticCSP: {
      "default-src": "'self'",
      "base-uri": "'self'",
      "font-src": "'self' https: data:",
      "frame-ancestors": "'self'",
      "img-src": "'self' data: validator.swagger.io",
      "object-src": "'none'",
      "script-src": "'self'",
      "script-src-attr": "'none'",
      "style-src": "'self' 'unsafe-inline' https:",
    },
  });
}
