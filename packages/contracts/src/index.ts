/**
 * Version of the API contract. Bump it (semver) whenever a schema changes;
 * the API reports it in list responses and in the OpenAPI document.
 */
export const CONTRACT_VERSION = "0.2.0";

export * from "./asset.schema";
export * from "./monument.schema";
