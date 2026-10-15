import type { Monument } from "@vagabonds/contracts";

/**
 * Where the app reads its data from. Screens never talk to a source directly;
 * they use the hooks in `./hooks`, which go through the source picked in `./index`.
 *
 * Every implementation validates what it returns against `@vagabonds/contracts`
 * and throws a `DataError` when it cannot.
 */
export interface DataSource {
  listMonuments(): Promise<Monument[]>;
  /** Resolves to `null` when no monument has this slug. */
  getMonument(slug: string): Promise<Monument | null>;
}
