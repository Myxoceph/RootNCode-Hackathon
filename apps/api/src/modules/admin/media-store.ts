import { AwsClient } from "aws4fetch";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Where the variants of a photo uploaded from the panel go. Keys are the ones `MEDIA_BASE_URL` serves. */
export interface MediaStore {
  put(key: string, bytes: Buffer, type: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface R2StoreOptions {
  /** The account's S3 endpoint: `https://<account>.r2.cloudflarestorage.com`. */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Cloudflare R2 through its S3 API. A key's path holds the photo's hash, so a file never changes. */
export function createR2MediaStore({ endpoint, bucket, accessKeyId, secretAccessKey }: R2StoreOptions): MediaStore {
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  const urlOf = (key: string) => `${endpoint.replace(/\/+$/, "")}/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

  return {
    async put(key, bytes, type) {
      const response = await client.fetch(urlOf(key), {
        method: "PUT",
        body: new Uint8Array(bytes),
        headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable" },
      });
      if (!response.ok) throw new Error(`R2 refused ${key}: ${response.status}`);
    },
    async remove(key) {
      const response = await client.fetch(urlOf(key), { method: "DELETE" });
      if (!response.ok && response.status !== 404) throw new Error(`R2 refused deleting ${key}: ${response.status}`);
    },
  };
}

/** A media key that is safe as a path under a folder: relative segments of plain characters, no `.` or `..`. */
export function isSafeMediaKey(key: string): boolean {
  return /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(key) && !key.split("/").some((part) => part === "." || part === "..");
}

/**
 * The media store of Veri Döngüsü's development (INTAKE_LOCAL_ONLY): the same keys as the bucket,
 * written under `root` (the repo's data/build/media, where media_pipeline.py and the data pipeline
 * write too) and served by the API at /local-media. Nothing leaves the machine.
 */
export function createLocalMediaStore(root: string): MediaStore {
  const pathOf = (key: string) => {
    if (!isSafeMediaKey(key)) throw new Error(`Unsafe media key: ${key}`);
    return join(root, key);
  };
  return {
    async put(key, bytes) {
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    },
    async remove(key) {
      await rm(pathOf(key), { force: true });
    },
  };
}
