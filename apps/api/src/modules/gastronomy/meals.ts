/** What picking a dish for a trip's break needs to know about it. */
export interface MealDish {
  id: string;
  kind: string;
  /** Null for a dish of the whole city. */
  district: string | null;
}

/** The dish kinds that fit each break of a day. */
export const MEAL_KINDS = { lunch: ["main"], dessert: ["dessert"] } as const;

/**
 * Picks a dish for a break near `district`: one of that district first, then one of the
 * whole city, then any other; among equals one not served earlier in the trip, then the
 * one served least, then the data team's order. Null when the city has no dish of a fitting kind.
 */
export function pickDish<T extends MealDish>(
  dishes: T[],
  meal: keyof typeof MEAL_KINDS,
  district: string | null,
  served: ReadonlyMap<string, number>,
): T | null {
  const kinds: readonly string[] = MEAL_KINDS[meal];
  const place = (dish: T) => (dish.district === district ? 0 : dish.district === null ? 1 : 2);
  const rank = (dish: T) => place(dish) * 2 + (served.has(dish.id) ? 1 : 0);
  let best: T | null = null;
  for (const dish of dishes) {
    if (!kinds.includes(dish.kind)) continue;
    const servings = (d: T) => served.get(d.id) ?? 0;
    if (!best || rank(dish) < rank(best) || (rank(dish) === rank(best) && servings(dish) < servings(best))) best = dish;
  }
  return best;
}
