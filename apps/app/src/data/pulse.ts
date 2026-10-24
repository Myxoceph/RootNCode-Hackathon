import type { PulseItem, VisitorTipV2 } from "@vagabonds/contracts";

/**
 * The asset's dataset tips in the pulse's shape: what the mock source serves, and what the
 * Ziyaretçi Notları tab shows until the pulse has arrived or when it cannot be fetched.
 */
export function pulseItemsFromTips(tips: VisitorTipV2[]): PulseItem[] {
  return tips.map((tip, i) => ({
    id: `tip-${i}`,
    kind: "tip",
    text: tip.text,
    origin: tip.origin,
    author: null,
    date: tip.collectedAt,
  }));
}
