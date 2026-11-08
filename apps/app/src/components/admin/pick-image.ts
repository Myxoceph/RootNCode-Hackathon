import { ACHIEVEMENT_IMAGE_MAX_BYTES, ACHIEVEMENT_IMAGE_MIN_SIDE, INTAKE_UPLOAD_MAX_BYTES, INTAKE_UPLOAD_TYPES } from "@vagabonds/contracts";
import { Platform } from "react-native";

export interface PickedImage {
  /** An object URL of the file: shown as the preview and read again to upload it. */
  uri: string;
  type: "image/jpeg" | "image/png";
}

/** The API's own limit on how far from square a badge picture may be (achievements.routes.ts). */
const MAX_ASPECT = 1.25;

/**
 * Asks for a badge picture: a JPEG or PNG, about square, at least 128 px a side, at most 2 MB.
 * The panel's file dialog on the web; null when nothing is chosen. A file that does not fit is
 * refused here with the reason, before it is sent.
 */
export function pickBadgeImage(): Promise<PickedImage | null> {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return Promise.reject(new Error("Rozet görselini panelin web sürümünden yükle."));
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (file.type !== "image/png" && file.type !== "image/jpeg") return reject(new Error("Görsel JPEG ya da PNG olmalı."));
      if (file.size > ACHIEVEMENT_IMAGE_MAX_BYTES) return reject(new Error("Görsel çok büyük: en çok 2 MB olabilir."));
      const uri = URL.createObjectURL(file);
      const image = new window.Image();
      image.onload = () => {
        const short = Math.min(image.naturalWidth, image.naturalHeight);
        const long = Math.max(image.naturalWidth, image.naturalHeight);
        if (short < ACHIEVEMENT_IMAGE_MIN_SIDE) return reject(new Error(`Görsel çok küçük: kenarları en az ${ACHIEVEMENT_IMAGE_MIN_SIDE} piksel olmalı.`));
        if (long / short > MAX_ASPECT) return reject(new Error("Görsel kareye yakın olmalı; rozet dairenin içinde çizilir."));
        resolve({ uri, type: file.type as PickedImage["type"] });
      };
      image.onerror = () => reject(new Error("Görsel açılamadı; başka bir dosya dene."));
      image.src = uri;
    };
    input.click();
  });
}

export interface PickedPhoto {
  /** An object URL of the file: shown as the thumbnail and read again to upload it. */
  uri: string;
  type: "image/jpeg" | "image/png" | "image/webp";
  name: string;
}

const PHOTO_TYPES = new Set<string>(INTAKE_UPLOAD_TYPES);

/**
 * Asks for a chat message's photos: JPEGs, PNGs or WebPs of at most 15 MB each, several at once.
 * The panel's file dialog on the web. Files that do not fit are left out and named in `refused`.
 */
export function pickChatPhotos(): Promise<{ photos: PickedPhoto[]; refused: string[] }> {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return Promise.reject(new Error("Fotoğrafları panelin web sürümünden ekle."));
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/jpeg,image/png,image/webp";
    input.onchange = () => {
      const photos: PickedPhoto[] = [];
      const refused: string[] = [];
      for (const file of Array.from(input.files ?? [])) {
        if (!PHOTO_TYPES.has(file.type)) refused.push(`${file.name}: JPEG, PNG ya da WebP olmalı`);
        else if (file.size > INTAKE_UPLOAD_MAX_BYTES) refused.push(`${file.name}: en çok ${Math.round(INTAKE_UPLOAD_MAX_BYTES / 1024 / 1024)} MB olabilir`);
        else photos.push({ uri: URL.createObjectURL(file), type: file.type as PickedPhoto["type"], name: file.name });
      }
      resolve({ photos, refused });
    };
    input.click();
  });
}
