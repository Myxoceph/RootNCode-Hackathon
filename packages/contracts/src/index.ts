/**
 * Version of the API contract. Bump it (semver) whenever a schema changes;
 * the API reports it in every /assets and /meta response and in the OpenAPI document.
 * While the major version is 0, a minor bump means a breaking change and a patch
 * bump an addition, so `^0.2.0` dependents keep working across patches.
 */
export const CONTRACT_VERSION = "0.2.2";

export * from "./asset.schema";
export * from "./community.schema";
export * from "./meta.schema";
export * from "./monument.schema";
