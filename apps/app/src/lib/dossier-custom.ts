import type { AssetDetail } from "@vagabonds/contracts";

/**
 * Blocks of the dossier the panel's admin adds, beside the dataset's own (Künye, Tarihçe…): a
 * title, a formatted text (see `rich-text.tsx`) and the block it follows.
 *
 * The API does not keep these yet: the panel's editor sets them on its preview, and the dossier
 * reads them from any asset that has them, so they show as soon as the API sends them.
 */

export interface CustomBlock {
  id: string;
  title: string;
  body: string;
  /** The block it follows: a dossier block key (`identity`, `history`…) or another custom block's `custom:<id>`. */
  after: string;
}

type WithCustom = AssetDetail & { customBlocks?: CustomBlock[] };

export const customBlocksOf = (asset: AssetDetail): CustomBlock[] => (asset as WithCustom).customBlocks ?? [];

export const withCustomBlocks = (asset: AssetDetail, blocks: CustomBlock[]): AssetDetail => Object.assign({}, asset, { customBlocks: blocks });
