/** The kinds of place the city map draws an icon for. */
export type MapCategory = "worship" | "tomb" | "school" | "trade" | "water" | "charity" | "other";

/** Asset type codes (data/enums.json) grouped into the kinds of place the city map tells apart. */
const CATEGORY_OF_TYPE: Record<string, MapCategory> = {
  cami: "worship",
  mescit: "worship",
  namazgah: "worship",
  tekke: "worship",
  makam: "worship",
  kilise: "worship",
  turbe: "tomb",
  hazire: "tomb",
  medrese: "school",
  mektep: "school",
  kutuphane: "school",
  han: "trade",
  kervansaray: "trade",
  bedesten: "trade",
  hamam: "water",
  cesme: "water",
  kulliye: "charity",
  imaret: "charity",
  darussifa: "charity",
};

/** The kind of place an asset type is drawn as; types the map does not tell apart are "other". */
export function assetCategory(typeCode: string): MapCategory {
  return CATEGORY_OF_TYPE[typeCode] ?? "other";
}
