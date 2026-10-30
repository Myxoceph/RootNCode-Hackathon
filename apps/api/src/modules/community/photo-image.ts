/**
 * Checks an uploaded photo and removes its metadata without re-encoding it.
 *
 * A phone photo's EXIF can hold the GPS position where it was taken, the device and
 * the owner's name; none of that may reach other visitors. JPEG application segments
 * (EXIF, XMP, IPTC) and comments are dropped, except APP0 (JFIF) and APP2 (the colour
 * profile); PNG text, EXIF and time chunks are dropped. The pixels are untouched.
 */

export type ImageType = "image/jpeg" | "image/png";

export interface CheckedImage {
  type: ImageType;
  width: number;
  height: number;
  /** The file without metadata. */
  bytes: Buffer;
}

export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImageError";
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Start-of-frame markers carry the image size (C4 DHT, C8 JPG and CC DAC are not frames).
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const KEEP_APP = new Set([0xe0, 0xe2]);
const DROP_PNG_CHUNKS = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

/** The type the bytes really are, whatever the request claimed. */
export function sniffImageType(bytes: Buffer): ImageType | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  return null;
}

function cleanJpeg(input: Buffer): CheckedImage {
  const parts: Buffer[] = [input.subarray(0, 2)];
  let offset = 2;
  let size: { width: number; height: number } | null = null;
  while (offset < input.length) {
    if (input[offset] !== 0xff) throw new InvalidImageError("Malformed JPEG segment");
    const marker = input[offset + 1];
    if (marker === undefined) throw new InvalidImageError("Truncated JPEG");
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (marker === 0xd9) {
      parts.push(input.subarray(offset, offset + 2));
      break;
    }
    if (offset + 4 > input.length) throw new InvalidImageError("Truncated JPEG");
    const length = input.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > input.length) throw new InvalidImageError("Truncated JPEG segment");
    // Frame header: length (2), precision (1), height (2), width (2).
    if (SOF_MARKERS.has(marker) && length >= 7) {
      size = { height: input.readUInt16BE(offset + 5), width: input.readUInt16BE(offset + 7) };
    }
    if (marker === 0xda) {
      // Start of scan: the compressed image data runs to the end of the file.
      parts.push(input.subarray(offset));
      break;
    }
    const isMetadata = (marker >= 0xe1 && marker <= 0xef && !KEEP_APP.has(marker)) || marker === 0xfe;
    if (!isMetadata) parts.push(input.subarray(offset, end));
    offset = end;
  }
  if (!size) throw new InvalidImageError("JPEG has no frame header");
  return { type: "image/jpeg", ...size, bytes: Buffer.concat(parts) };
}

function cleanPng(input: Buffer): CheckedImage {
  const parts: Buffer[] = [PNG_SIGNATURE];
  let offset = 8;
  let size: { width: number; height: number } | null = null;
  let ended = false;
  while (offset < input.length && !ended) {
    if (offset + 12 > input.length) throw new InvalidImageError("Truncated PNG chunk");
    const length = input.readUInt32BE(offset);
    const type = input.toString("latin1", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > input.length) throw new InvalidImageError("Truncated PNG chunk");
    if (type === "IHDR") size = { width: input.readUInt32BE(offset + 8), height: input.readUInt32BE(offset + 12) };
    if (!DROP_PNG_CHUNKS.has(type)) parts.push(input.subarray(offset, end));
    ended = type === "IEND";
    offset = end;
  }
  if (!size || !ended) throw new InvalidImageError("PNG has no header or end chunk");
  return { type: "image/png", ...size, bytes: Buffer.concat(parts) };
}

/** Throws `InvalidImageError` when the bytes are not a well-formed JPEG or PNG. */
export function checkImage(bytes: Buffer): CheckedImage {
  const type = sniffImageType(bytes);
  if (type === null) throw new InvalidImageError("Only JPEG and PNG photos are accepted");
  return type === "image/jpeg" ? cleanJpeg(bytes) : cleanPng(bytes);
}
