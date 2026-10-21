import type { Media } from "@vagabonds/contracts";
import { Image, type ImageStyle } from "expo-image";
import { StyleSheet, type StyleProp } from "react-native";

interface AssetImageProps {
  media: Media;
  /**
   * Hide the image from screen readers when the surrounding element already
   * says what it shows (e.g. a card announcing the asset's name).
   */
  decorative?: boolean;
  style?: StyleProp<ImageStyle>;
}

/**
 * One photo from the API. The box keeps the photo's aspect ratio and is painted with its
 * dominant color, then the blurred preview, so the layout never jumps while it loads.
 * expo-image picks the smallest variant that covers the rendered size.
 */
export function AssetImage({ media, decorative = false, style }: AssetImageProps) {
  const sources = (media.sources.webp.length > 0 ? media.sources.webp : media.sources.jpg).map((s) => ({
    uri: s.url,
    width: s.width,
    height: s.height,
  }));
  const focal = media.focalPoint;

  return (
    <Image
      source={sources}
      placeholder={media.lqip ? { uri: media.lqip } : undefined}
      contentFit="cover"
      contentPosition={focal ? { left: `${focal.x * 100}%`, top: `${focal.y * 100}%` } : "center"}
      transition={200}
      accessible={!decorative}
      // Read by screen readers on native; the `alt` attribute on the web.
      alt={decorative ? "" : media.alt}
      style={[styles.image, { aspectRatio: media.aspectRatio, backgroundColor: media.dominantColor ?? undefined }, style]}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    width: "100%",
  },
});
