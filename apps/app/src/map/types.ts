import type { StyleProp, ViewStyle } from "react-native";

import type { MapCategory } from "./asset-category";
import type { LngLatBounds } from "./dense-area";
import type { MapTier } from "./prominence";

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** One asset on the map. */
export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  title: string;
  /** False for coordinates nobody has checked on site; drawn hollow. */
  verified: boolean;
  /** Drawn above the fog instead of as a plain pin: a found asset (star) or the hidden end of a hint ("?"). */
  mark?: "found" | "hint";
}

/** One link between two assets, as a line on the map. */
export interface MapLink {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  color: string;
  /** A hint towards an asset still under the fog. */
  dashed: boolean;
}

/** The fog over the map, the clearings in it and the links drawn above it (Kentsel Ağ). */
export interface MapNetwork {
  /** Assets whose surroundings are clear; a new one clears with a growing circle. */
  clearings: Array<{ id: string; lat: number; lng: number }>;
  /** Radius of each clearing, in meters. */
  clearRadius: number;
  links: MapLink[];
  /** False when "Hareketi azalt" is on: no growing clearings, no pulsing hints. */
  motion: boolean;
}

/** A province with assets: outlined in color and named on the map. */
export interface MapProvince {
  /** Licence plate code (16 = Bursa). */
  plate: number;
  name: string;
  /** When names would overlap, the higher rank is shown (the asset count). */
  rank?: number;
}

/** One asset of the chosen city, marked and named above the fog. */
export interface MapCityAsset {
  id: string;
  title: string;
  lat: number;
  lng: number;
  /** The kind of place: the icon on its seal. */
  category: MapCategory;
  /** The city's best-known asset, where the camera opens: drawn larger, its name shown first. */
  landmark?: boolean;
  /** How long it stays as the map zooms out (`mapTiers`): 3 to the last, 0 first to go. */
  tier: MapTier;
  /** Unlocked by the visitor: its seal has no padlock and no "Kilidini aç". */
  unlocked?: boolean;
  /** The other assets on this map related to it, once unlocked: "İlişkili eserleri gör" draws lines to them. */
  relatedTo?: string[];
}

/** The chosen city: a light mist over the map, each of its assets on its own cloud. */
export interface MapCity {
  plate: number;
  assets: MapCityAsset[];
  /** Where the camera flies: the landmark and its streets. `null` frames the whole province. */
  focus: LngLatBounds | null;
}

/** Turkey's provinces: every border drawn quietly, the ones with assets outlined in color and named. */
export interface MapProvinces {
  highlighted: MapProvince[];
  /** Set while a city is chosen; `null` is the Turkey view. */
  city?: MapCity | null;
  /** Turkey rises out of the fog the first time the map opens. False when "Hareketi azalt" is on. */
  reveal: boolean;
}

/**
 * The map every screen uses (ADR 0003). Screens pass pins and the selection and
 * never see which renderer draws them. The map is visual only: whatever a
 * screen-reader user needs (the selected asset, the list) lives outside it.
 */
/** Screen points the map tour points at; null when not on screen. */
export interface MapSpots {
  /** The name of the province with the most assets, in the Turkey view. */
  province: { x: number; y: number; name: string } | null;
  asset: { x: number; y: number } | null;
  unlock: { x: number; y: number; width: number; height: number } | null;
}

export interface AssetMapProps {
  pins: MapPin[];
  selectedId: string | null;
  /** `null` when the empty map is tapped. */
  onSelect: (id: string | null) => void;
  /** Called once, when the base map and the pins are drawn. */
  onReady?: () => void;
  onError?: (message: string) => void;
  /** Room the screen covers with its own panels; pins are framed inside the rest. */
  fitPadding?: MapPadding;
  /** Fog and links over the map; without it the map is plain. */
  network?: MapNetwork | null;
  /** Turkey with its province outlines; without pins the map frames the whole country. */
  provinces?: MapProvinces | null;
  /** A highlighted province (or its name) was tapped in the Turkey view. */
  onSelectProvince?: (plate: number) => void;
  /** The city was zoomed out to the Turkey view: the map has let go of it, the screen should too. */
  onLeaveCity?: () => void;
  /** The camera has finished flying into the chosen city. */
  onCityLanded?: (plate: number) => void;
  /** "Kilidini aç" over the chosen city asset was tapped: open its Ziyaret Mührü. */
  onUnlock?: (id: string) => void;
  /** "İncele" over an unlocked city asset was tapped: open its card. */
  onInspect?: (id: string) => void;
  /** Beside "Kapat", while an asset's related assets show: open their list. */
  onOpenRelatedList?: (id: string) => void;
  /** "Not bırak" over an unlocked city asset was tapped. */
  onLeaveNote?: (id: string) => void;
  /** An unlocking scene has finished playing over the map. */
  onSceneEnd?: () => void;
  /** True while the screen wants `onSpots`: the map tour's bubble follows them. */
  watchSpots?: boolean;
  /** Where the chosen asset and "Kilidini aç" are on screen, sent as they move. */
  onSpots?: (spots: MapSpots) => void;
  style?: StyleProp<ViewStyle>;
}
