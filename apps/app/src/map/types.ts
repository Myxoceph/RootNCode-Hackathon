import type { StyleProp, ViewStyle } from "react-native";

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

/** Turkey's provinces: the ones with assets are outlined, the others carry no mark at all. */
export interface MapProvinces {
  /** Licence plate codes of the provinces to outline (16 = Bursa). */
  plates: number[];
  /** Turkey rises out of the fog the first time the map opens. False when "Hareketi azalt" is on. */
  reveal: boolean;
}

/**
 * The map every screen uses (ADR 0003). Screens pass pins and the selection and
 * never see which renderer draws them. The map is visual only: whatever a
 * screen-reader user needs (the selected asset, the list) lives outside it.
 */
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
  style?: StyleProp<ViewStyle>;
}
