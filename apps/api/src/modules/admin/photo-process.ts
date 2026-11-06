import { createHash } from "node:crypto";
import { ADMIN_PHOTO_MIN_SIDE, ADMIN_PHOTO_TYPES } from "@vagabonds/contracts";
import sharp from "sharp";

/**
 * What `data/tools/media_pipeline.py` makes of a dataset photo, for one uploaded from the panel: the
 * EXIF orientation applied, no metadata (a photo's EXIF can hold where it was taken), WebP and JPEG
 * at the same widths and qualities, a 16 px placeholder and the dominant colour. Keep the two alike.
 */
const WIDTHS = [480, 1280, 2560];
const WEBP = { quality: 80, effort: 6 };
const JPEG = { quality: 82, progressive: true, optimiseCoding: true };
const MAX_PIXELS = 100_000_000;

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

// One at a time: 2560 px WebP takes seconds of a small server's CPU, and uploads are rare.
let turn: Promise<unknown> = Promise.resolve();

export function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  const run = turn.then(() => derive(input));
  turn = run.catch(() => undefined);
  return run;
}

async function derive(input: Buffer): Promise<ProcessedPhoto> {
  const image = () => sharp(input, { limitInputPixels: MAX_PIXELS }).rotate().flatten({ background: "#ffffff" });
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
    if (!(ADMIN_PHOTO_TYPES as readonly string[]).includes(`image/${meta.format}`)) throw new InvalidPhotoError("Send a JPEG, PNG or WebP photo");
    const { width, height } = meta.autoOrient;
    if (Math.min(width, height) < ADMIN_PHOTO_MIN_SIDE) throw new InvalidPhotoError(`Each side must be at least ${ADMIN_PHOTO_MIN_SIDE} px`);

    const variants: PhotoVariant[] = [];
    // Never enlarged: the largest variant is the photo's own width, as in the pipeline.
    const widths = [...WIDTHS.filter((w) => w < width), Math.min(width, WIDTHS.at(-1)!)];
    for (const w of widths) {
      const sized = () => (w === width ? image() : image().resize({ width: w }));
      const webp = await sized().webp(WEBP).toBuffer({ resolveWithObject: true });
      const jpg = await sized().jpeg(JPEG).toBuffer({ resolveWithObject: true });
      variants.push({ format: "webp", width: webp.info.width, height: webp.info.height, bytes: webp.data });
      variants.push({ format: "jpg", width: jpg.info.width, height: jpg.info.height, bytes: jpg.data });
    }

    const tiny = await image().resize({ width: 16 }).webp(WEBP).toBuffer();
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
