import { AwsClient } from "aws4fetch";

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
