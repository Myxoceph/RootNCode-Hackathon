import { crc32 } from "node:zlib";

/**
 * Tiny, structurally valid JPEG and PNG files for upload tests. The pixels are not
 * decodable, which the API never needs: it reads the structure, never the image.
 */

const GPS_MARKER = "GPSLatitude 40.18N";

function segment(marker: number, payload: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt16BE(0xff00 | marker, 0);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

/** A JPEG with an EXIF segment holding a GPS position and a comment, plus the colour profile segment. */
export function jpegWithExif(width = 1200, height = 800): Buffer {
  const sof = Buffer.alloc(6);
  sof.writeUInt8(8, 0);
  sof.writeUInt16BE(height, 1);
  sof.writeUInt16BE(width, 3);
  sof.writeUInt8(0, 5);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1")),
    segment(0xe1, Buffer.from(`Exif\0\0${GPS_MARKER}`, "latin1")),
    segment(0xe2, Buffer.from("ICC_PROFILE\0colour", "latin1")),
    segment(0xfe, Buffer.from("Ahmet's phone", "latin1")),
    segment(0xc0, sof),
    segment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
    Buffer.from([0x12, 0x34, 0x56, 0xff, 0xd9]),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A PNG with a text chunk naming its author and an EXIF chunk with a GPS position. */
export function pngWithText(width = 640, height = 480): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("tEXt", Buffer.from("Author\0Ayse Yilmaz", "latin1")),
    chunk("eXIf", Buffer.from(GPS_MARKER, "latin1")),
    chunk("IDAT", Buffer.from([0x78, 0x9c, 0x01, 0x02, 0x03])),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export { GPS_MARKER };
