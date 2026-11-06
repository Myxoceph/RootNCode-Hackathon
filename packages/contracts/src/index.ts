/**
 * Version of the API contract. Bump it (semver) whenever a schema changes;
 * the API reports it in every /assets and /meta response and in the OpenAPI document.
 * While the major version is 0, a minor bump means a breaking change and a patch
 * bump an addition, so `^0.2.0` dependents keep working across patches.
 */
export const CONTRACT_VERSION = "0.3.28";

export * from "./achievement.schema";
export * from "./admin.schema";
export * from "./asset.schema";
export * from "./chat.schema";
export * from "./community.schema";
export * from "./gastronomy.schema";
export * from "./meta.schema";
export * from "./planner.schema";
export * from "./reward.schema";
export * from "./sound.schema";
export * from "./transit.schema";
export * from "./vision.schema";
export * from "./voice.schema";
