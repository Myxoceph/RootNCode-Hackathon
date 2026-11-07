import type { Media } from "@vagabonds/contracts";
import { Image, type ImageStyle } from "expo-image";
import { Platform, StyleSheet, type StyleProp } from "react-native";

interface AssetImageProps {
  media: Media;
  /**
   * Hide the image from screen readers when the surrounding element already
   * says what it shows (e.g. a card announcing the asset's name).
   */
  decorative?: boolean;
  style?: StyleProp<ImageStyle>;
  /** Fill the parent and crop, instead of keeping the photo's own aspect ratio. */
  fill?: boolean;
  /** How the photo sits in a filled box: cropped to cover it, or whole. */
  fit?: "cover" | "contain";
  /** Called when no variant loads (offline, missing file). */
  onError?: () => void;
}

/**
 * One photo from the API. The box keeps the photo's aspect ratio and is painted with its
 * dominant color, then the blurred preview, so the layout never jumps while it loads.
 * expo-image picks the smallest variant that covers the rendered size.
 */
export function AssetImage({ media, decorative = false, fill = false, fit = "cover", style, onError }: AssetImageProps) {
  const sources = (media.sources.webp.length > 0 ? media.sources.webp : media.sources.jpg).map((s) => ({
    uri: s.url,
    width: s.width,
    height: s.height,
  }));
  const focal = media.focalPoint;
  // On the web expo-image draws its placeholder as a second <img> with no alt, which fails audits.
  const webPreview = Platform.OS === "web" && media.lqip ? ({ backgroundImage: `url("${media.lqip}")`, backgroundSize: fit, backgroundPosition: "center", backgroundRepeat: "no-repeat" } as object) : null;

  return (
    <Image
      source={sources}
      placeholder={media.lqip && Platform.OS !== "web" ? { uri: media.lqip } : undefined}
      placeholderContentFit={fit}
      contentFit={fit}
      contentPosition={focal && fit === "cover" ? { left: `${focal.x * 100}%`, top: `${focal.y * 100}%` } : "center"}
      transition={200}
      onError={onError}
      accessible={!decorative}
      // Read by screen readers on native; the `alt` attribute on the web.
      alt={decorative ? "" : media.alt}
      // On the web expo-image gives its main <img> only this, not `alt`.
      accessibilityLabel={decorative ? "" : media.alt}
      // An empty label leaves the web's <img> with no `alt` at all: a decorative one is hidden outright instead.
      aria-hidden={decorative || undefined}
      importantForAccessibility={decorative ? "no-hide-descendants" : undefined}
      style={[fill ? StyleSheet.absoluteFill : [styles.image, { aspectRatio: media.aspectRatio }], { backgroundColor: media.dominantColor ?? undefined }, webPreview, style]}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    width: "100%",
  },
});
