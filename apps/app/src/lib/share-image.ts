import type { ComponentRef, RefObject } from "react";
import type { View } from "react-native";

/** A story's size: what WhatsApp and Instagram show edge to edge. */
export const STORY_SIZE = { width: 1080, height: 1920 } as const;

/**
 * The web has no story to share to, and turning a page into a picture there needs another library
 * (`html2canvas-pro`): the button is not offered. The phone's version is `share-image.native.ts`.
 */
export const canShareImage = false;

export type ShareResult = "shared" | "unavailable";

export async function shareViewAsImage(_view: RefObject<ComponentRef<typeof View> | null>, _dialogTitle: string): Promise<ShareResult> {
  return "unavailable";
}
