import { describe, expect, it } from "vitest";
import { pickDish, type MealDish } from "../src/modules/gastronomy/meals.ts";

const dishes: MealDish[] = [
  { id: "city-kebab", kind: "main", district: null },
  { id: "city-kofte", kind: "main", district: null },
  { id: "inegol-kofte", kind: "main", district: "İnegöl" },
  { id: "city-helva", kind: "dessert", district: null },
  { id: "city-pide", kind: "street", district: null },
];

const ids = (dish: MealDish | null) => dish?.id ?? null;

describe("pickDish", () => {
  it("serves a main dish for lunch and a dessert for dessert", () => {
    expect(ids(pickDish(dishes, "lunch", null, new Set()))).toBe("city-kebab");
    expect(ids(pickDish(dishes, "dessert", null, new Set()))).toBe("city-helva");
  });

  it("prefers a dish of the stop's district, then one of the whole city", () => {
    expect(ids(pickDish(dishes, "lunch", "İnegöl", new Set()))).toBe("inegol-kofte");
    expect(ids(pickDish(dishes, "lunch", "Osmangazi", new Set()))).toBe("city-kebab");
  });

  it("does not repeat a dish while another fits, and repeats rather than skipping a break", () => {
    expect(ids(pickDish(dishes, "lunch", null, new Set(["city-kebab"])))).toBe("city-kofte");
    expect(ids(pickDish(dishes, "dessert", null, new Set(["city-helva"])))).toBe("city-helva");
  });

  it("returns null when no dish fits the break", () => {
    expect(pickDish(dishes.filter((d) => d.kind !== "dessert"), "dessert", null, new Set())).toBeNull();
    expect(pickDish([], "lunch", null, new Set())).toBeNull();
  });
});
