import { testTargetLabels, testTargetsMind } from "./test-targets.generated";

/** What a recognized AR target stands for: one inscription of one asset in the dataset. */
export interface InscriptionTarget {
  assetId: string;
  inscriptionId: string;
  /** What the target image shows. */
  label: string;
  /** A stand-in photo, not the inscription itself. */
  test: boolean;
}

/**
 * The targets Taşın Dili tracks, by their index in `inscriptionTargetsMind`.
 * Until the real target (H7, Ulucami's minbar door inscription) is in the
 * dataset, the two test photos stand in for it. Y13 moves both the `.mind`
 * file and this table to the API.
 */
export const inscriptionTargets: InscriptionTarget[] = testTargetLabels.map((label) => ({
  assetId: "bursa-osmangazi-ulucami",
  inscriptionId: "minber-kapi-kitabesi",
  label,
  test: true,
}));

export const inscriptionTargetsMind = testTargetsMind;
