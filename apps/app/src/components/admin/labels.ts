import type { UserRole } from "@vagabonds/contracts";

import type { Tone } from "./kit";

export const ROLE: Record<UserRole, { label: string; tone: Tone }> = {
  visitor: { label: "Ziyaretçi", tone: "grey" },
  moderator: { label: "Moderatör", tone: "blue" },
  admin: { label: "Admin", tone: "gold" },
};
