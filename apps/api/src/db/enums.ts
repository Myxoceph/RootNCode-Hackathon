import type {
  MonumentType as ContractMonumentType,
  RelationType as ContractRelationType,
  TipStatus as ContractTipStatus,
} from "@vagabonds/contracts";
import type { MonumentType, RelationType, TipStatus } from "../generated/prisma/enums.ts";

/**
 * Explicit mapping between contract enum values ("same_waqf") and Prisma enum
 * values ("SAME_WAQF"). Typed as Record so adding a value on either side
 * without updating these tables is a compile error.
 */
export const monumentTypeToDb: Record<ContractMonumentType, MonumentType> = {
  mosque: "MOSQUE",
  madrasa: "MADRASA",
  bath: "BATH",
  fountain: "FOUNTAIN",
  arasta: "ARASTA",
  caravanserai: "CARAVANSERAI",
  bridge: "BRIDGE",
  tomb: "TOMB",
  other: "OTHER",
};

export const relationTypeToDb: Record<ContractRelationType, RelationType> = {
  revenue: "REVENUE",
  water_supply: "WATER_SUPPLY",
  same_waqf: "SAME_WAQF",
  architect: "ARCHITECT",
};

export const tipStatusToDb: Record<ContractTipStatus, TipStatus> = {
  pending: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
};

function invert<K extends string, V extends string>(map: Record<K, V>): Record<V, K> {
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [value, key])) as Record<V, K>;
}

export const monumentTypeFromDb = invert(monumentTypeToDb);
export const relationTypeFromDb = invert(relationTypeToDb);
export const tipStatusFromDb = invert(tipStatusToDb);
