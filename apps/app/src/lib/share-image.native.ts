import * as Sharing from "expo-sharing";
import type { ComponentRef, RefObject } from "react";
import type { View } from "react-native";
import { captureRef } from "react-native-view-shot";

/** A story's size: what WhatsApp and Instagram show edge to edge. */
export const STORY_SIZE = { width: 1080, height: 1920 } as const;

export const canShareImage = true;

export type ShareResult = "shared" | "unavailable";

/**
 * The view as a picture the size of a story, handed to the system's share sheet: WhatsApp, Instagram
 * and the rest are chosen there. The file is the app's own temporary one; nothing goes to the photos.
 */
export async function shareViewAsImage(
  view: RefObject<ComponentRef<typeof View> | null>,
  dialogTitle: string,
  size: { width: number; height: number } = STORY_SIZE,
): Promise<ShareResult> {
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  const uri = await captureRef(view, { format: "jpg", quality: 0.92, result: "tmpfile", ...size });
  await Sharing.shareAsync(uri, { mimeType: "image/jpeg", UTI: "public.jpeg", dialogTitle });
  return "shared";
}
