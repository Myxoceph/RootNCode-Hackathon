import { createHash } from "node:crypto";
import { ADMIN_PHOTO_MIN_SIDE, ADMIN_PHOTO_TYPES } from "@vagabonds/contracts";
import sharp from "sharp";

/**
 * What `data/tools/media_pipeline.py` makes of a dataset photo, for one uploaded from the panel: the
 * EXIF orientation applied, no metadata (a photo's EXIF can hold where it was taken), WebP and JPEG
 * at the same widths and qualities, a 16 px placeholder and the dominant colour. Keep the two alike.
 */
const WEBP_QUALITY = 80;
const JPEG = { quality: 82, progressive: true, optimiseCoding: true };

export interface PhotoProfile {
  widths: number[];
  formats: ReadonlyArray<"webp" | "jpg">;
  webpEffort: number;
  minSide: number;
  maxPixels: number;
}

/** An asset's photo: what the dataset's photos have, for every screen and old device. */
const PANEL_PROFILE: PhotoProfile = {
  widths: [480, 1280, 2560],
  formats: ["webp", "jpg"],
  webpEffort: 6,
  minSide: ADMIN_PHOTO_MIN_SIDE,
  maxPixels: 100_000_000,
};

export class InvalidPhotoError extends Error {}

export interface PhotoVariant {
  format: "webp" | "jpg";
  width: number;
  height: number;
  bytes: Buffer;
}

export interface ProcessedPhoto {
  sha256: string;
  width: number;
  height: number;
  aspectRatio: number;
  lqip: string;
  dominantColor: string;
  variants: PhotoVariant[];
}

// One at a time, whoever sends it: 2560 px WebP takes seconds of a small server's CPU.
let turn: Promise<unknown> = Promise.resolve();

export function processPhoto(input: Buffer, profile: PhotoProfile = PANEL_PROFILE): Promise<ProcessedPhoto> {
  const run = turn.then(() => derive(input, profile));
  turn = run.catch(() => undefined);
  return run;
}

async function derive(input: Buffer, { widths: wanted, formats, webpEffort, minSide, maxPixels }: PhotoProfile): Promise<ProcessedPhoto> {
  const image = () => sharp(input, { limitInputPixels: maxPixels }).rotate().flatten({ background: "#ffffff" });
  const webpOptions = { quality: WEBP_QUALITY, effort: webpEffort };
  try {
    const meta = await sharp(input, { limitInputPixels: maxPixels }).metadata();
    if (!(ADMIN_PHOTO_TYPES as readonly string[]).includes(`image/${meta.format}`)) throw new InvalidPhotoError("Send a JPEG, PNG or WebP photo");
    const { width, height } = meta.autoOrient;
    if (Math.min(width, height) < minSide) throw new InvalidPhotoError(`Each side must be at least ${minSide} px`);

    const variants: PhotoVariant[] = [];
    // Never enlarged: the largest variant is the photo's own width, as in the pipeline.
    const widths = [...wanted.filter((w) => w < width), Math.min(width, wanted.at(-1)!)].filter((w, i, all) => all.indexOf(w) === i);
    for (const w of widths) {
      const sized = () => (w === width ? image() : image().resize({ width: w }));
      if (formats.includes("webp")) {
        const webp = await sized().webp(webpOptions).toBuffer({ resolveWithObject: true });
        variants.push({ format: "webp", width: webp.info.width, height: webp.info.height, bytes: webp.data });
      }
      if (formats.includes("jpg")) {
        const jpg = await sized().jpeg(JPEG).toBuffer({ resolveWithObject: true });
        variants.push({ format: "jpg", width: jpg.info.width, height: jpg.info.height, bytes: jpg.data });
      }
    }

    const tiny = await image().resize({ width: 16 }).webp(webpOptions).toBuffer();
    const { data } = await image().resize(1, 1).raw().toBuffer({ resolveWithObject: true });
    return {
      sha256: createHash("sha256").update(input).digest("hex"),
      width,
      height,
      aspectRatio: Math.round((width / height) * 10_000) / 10_000,
      lqip: `data:image/webp;base64,${tiny.toString("base64")}`,
      dominantColor: `#${[data[0]!, data[1]!, data[2]!].map((c) => c.toString(16).padStart(2, "0")).join("")}`,
      variants,
    };
  } catch (err) {
    if (err instanceof InvalidPhotoError) throw err;
    // sharp's own message for a file it cannot read, or one with too many pixels.
    throw new InvalidPhotoError("Not a readable photo");
  }
}
