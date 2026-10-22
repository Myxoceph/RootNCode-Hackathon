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
  style?: StyleProp<ViewStyle>;
}
