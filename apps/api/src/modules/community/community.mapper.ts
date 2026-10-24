import {
  ContributionKindSchema,
  ContributionStatusSchema,
  PulseItemSchema,
  PulseOriginSchema,
  UserRoleSchema,
  type AppUser,
  type Contribution,
  type Lang,
  type ModerationItem,
  type PulseItem,
} from "@vagabonds/contracts";
import { pick } from "../../lib/lang.ts";
import type { ContributionRecord, ModerationRecord, PulseRecords, UserRecord } from "./community.repository.ts";

/** A `@db.Date` column: a day without a time, read back as UTC midnight. */
function isoDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

// en-CA formats as YYYY-MM-DD.
const turkeyDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The day a moment falls on in Türkiye, where the assets and their visitors are: a note sent at 01:30 is of that day, not the day before in UTC. */
function turkeyDate(moment: Date): string {
  return turkeyDay.format(moment);
}

export function toAppUser(record: UserRecord): AppUser {
  return {
    id: record.id,
    nickname: record.nickname,
    role: UserRoleSchema.parse(record.role),
    createdAt: record.created_at.toISOString(),
  };
}

export function toContribution(record: ContributionRecord): Contribution {
  return {
    id: record.id,
    assetId: record.asset_id,
    // `photo` rows cannot be created through the API yet, so every row here has a text kind.
    kind: ContributionKindSchema.parse(record.kind),
    body: record.body ?? "",
    status: ContributionStatusSchema.parse(record.status),
    createdAt: record.created_at.toISOString(),
    reviewedAt: record.reviewed_at?.toISOString() ?? null,
    rejectReason: record.reject_reason,
  };
}

export function toModerationItem(record: ModerationRecord, lang: Lang): ModerationItem {
  return {
    ...toContribution(record),
    asset: { id: record.asset.id, name: pick(record.asset.name_tr, record.asset.name_en, lang) },
    author: { id: record.user.id, nickname: record.user.nickname, banned: record.user.banned_at !== null },
    reviewer: record.reviewer ? { id: record.reviewer.id, nickname: record.reviewer.nickname } : null,
  };
}

/** Dataset tips first (they are vetted and dated by the data team), then approved contributions. */
export function toPulseItems({ tips, community }: PulseRecords, lang: Lang): PulseItem[] {
  return [
    ...tips.map((tip) => ({
      id: `tip-${tip.id}`,
      kind: "tip" as const,
      text: pick(tip.text_tr, tip.text_en, lang),
      origin: PulseOriginSchema.parse(tip.origin),
      author: null,
      date: isoDate(tip.collected_at),
    })),
    ...community.map((item) => ({
      id: item.id,
      kind: PulseItemSchema.shape.kind.parse(item.kind),
      text: item.body ?? "",
      origin: "community" as const,
      author: item.user.nickname,
      date: turkeyDate(item.created_at),
    })),
  ];
}
