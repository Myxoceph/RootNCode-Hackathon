import type { AdminAssetRecord, AssetDetail } from "@vagabonds/contracts";

/**
 * Blocks of the dossier the panel's admin adds, beside the dataset's own (Künye, Tarihçe…): a
 * title, a formatted text (see `rich-text.tsx`) and the block it follows.
 *
 * The panel saves them with the record and `GET /assets/:id` sends them (contract 0.3.28).
 */

export interface CustomBlock {
  id: string;
  title: string;
  body: string;
  /** The block it follows: a dossier block key (`identity`, `history`…) or another custom block's `custom:<id>`. */
  after: string;
}

export const customBlocksOf = (asset: AssetDetail): CustomBlock[] => asset.customBlocks;

export const withCustomBlocks = (asset: AssetDetail, blocks: CustomBlock[]): AssetDetail => ({ ...asset, customBlocks: blocks });

/**
 * The record with its added blocks changed. A block taken out leaves no place behind: the photos
 * set after it, and the blocks that followed it, move to where it stood.
 */
export function withBlocks(record: AdminAssetRecord, blocks: AdminAssetRecord["customBlocks"]): AdminAssetRecord {
  const kept = new Set(blocks.map((b) => b.id));
  const moved = new Map(record.customBlocks.filter((b) => !kept.has(b.id)).map((b) => [`custom:${b.id}`, b.after]));
  if (moved.size === 0) return { ...record, customBlocks: blocks };
  // A block may follow another one taken out too: follow the chain to a place that stays.
  const settle = (place: string | null): string | null => {
    let at = place;
    for (let hops = 0; at && moved.has(at) && hops <= moved.size; hops++) at = moved.get(at)!;
    return at;
  };
  return {
    ...record,
    customBlocks: blocks.map((b) => ({ ...b, after: settle(b.after) ?? "identity" })),
    media: record.media.map((m) => ({ ...m, dossierAfter: settle(m.dossierAfter) })),
  };
}
