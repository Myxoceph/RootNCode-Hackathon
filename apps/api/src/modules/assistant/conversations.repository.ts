import { CHAT_CONVERSATIONS_KEPT, type ChatResponse } from "@vagabonds/contracts";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";

const conversationSelect = {
  id: true,
  asset_id: true,
  title: true,
  created_at: true,
  updated_at: true,
  archived_at: true,
  asset: { select: { name_tr: true, name_en: true } },
  _count: { select: { messages: true } },
} satisfies Prisma.chat_conversationSelect;

export type ConversationRecord = Prisma.chat_conversationGetPayload<{ select: typeof conversationSelect }>;

export interface MessageRecord {
  role: string;
  content: string;
  response: Prisma.JsonValue;
  created_at: Date;
}

export interface SavedTurn {
  userId: string;
  /** The open conversation the question continues; null starts a new one on the page. */
  conversationId: string | null;
  /** The page: an asset id, or null for Rehber. */
  assetId: string | null;
  question: string;
  response: ChatResponse;
}

export interface ConversationsRepository {
  /** The user's conversation, or null when it does not exist or is someone else's. */
  find(userId: string, id: string): Promise<ConversationRecord | null>;
  /**
   * Saves a question and its answer and returns the conversation's id. A new conversation
   * archives the page's open one and deletes the user's oldest beyond `CHAT_CONVERSATIONS_KEPT`.
   */
  saveTurn(turn: SavedTurn): Promise<string>;
  /** Last asked first. */
  list(userId: string): Promise<ConversationRecord[]>;
  messages(conversationId: string): Promise<MessageRecord[]>;
  /** False when the conversation is not the user's. Archiving twice is no error. */
  archive(userId: string, id: string): Promise<boolean>;
  /** False when the conversation is not the user's. */
  remove(userId: string, id: string): Promise<boolean>;
  /** How many were deleted. */
  removeAll(userId: string): Promise<number>;
}

const TITLE_CHARS = 80;

/** The first question as the conversation's name: one line, cut at a word to 80 characters. */
export function conversationTitle(question: string): string {
  const line = question.replace(/\s+/g, " ").trim();
  if (line.length <= TITLE_CHARS) return line;
  const cut = line.slice(0, TITLE_CHARS - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > TITLE_CHARS / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function createConversationsRepository(prisma: PrismaClient): ConversationsRepository {
  return {
    find: (userId, id) => prisma.chat_conversation.findFirst({ where: { id, user_id: userId }, select: conversationSelect }),

    async saveTurn({ userId, conversationId, assetId, question, response }) {
      return prisma.$transaction(async (tx) => {
        const now = new Date();
        let id = conversationId;
        if (id === null) {
          await tx.chat_conversation.updateMany({
            where: { user_id: userId, asset_id: assetId, archived_at: null },
            data: { archived_at: now },
          });
          id = (await tx.chat_conversation.create({
            data: { user_id: userId, asset_id: assetId, title: conversationTitle(question), created_at: now, updated_at: now },
            select: { id: true },
          })).id;
          const old = await tx.chat_conversation.findMany({
            where: { user_id: userId },
            orderBy: [{ updated_at: "desc" }, { id: "desc" }],
            skip: CHAT_CONVERSATIONS_KEPT,
            select: { id: true },
          });
          if (old.length > 0) await tx.chat_conversation.deleteMany({ where: { id: { in: old.map((row) => row.id) } } });
        } else {
          await tx.chat_conversation.update({ where: { id }, data: { updated_at: now } });
        }
        await tx.chat_message.createMany({
          data: [
            { conversation_id: id, role: "user", content: question, created_at: now },
            {
              conversation_id: id,
              role: "assistant",
              content: response.answer,
              response: response as unknown as Prisma.InputJsonValue,
              created_at: now,
            },
          ],
        });
        return id;
      });
    },

    list: (userId) =>
      prisma.chat_conversation.findMany({
        where: { user_id: userId },
        orderBy: [{ updated_at: "desc" }, { id: "desc" }],
        select: conversationSelect,
      }),

    messages: (conversationId) =>
      prisma.chat_message.findMany({
        where: { conversation_id: conversationId },
        orderBy: { id: "asc" },
        select: { role: true, content: true, response: true, created_at: true },
      }),

    async archive(userId, id) {
      const owned = await prisma.chat_conversation.findFirst({ where: { id, user_id: userId }, select: { archived_at: true } });
      if (owned === null) return false;
      if (owned.archived_at === null) await prisma.chat_conversation.update({ where: { id }, data: { archived_at: new Date() } });
      return true;
    },

    async remove(userId, id) {
      return (await prisma.chat_conversation.deleteMany({ where: { id, user_id: userId } })).count > 0;
    },

    async removeAll(userId) {
      return (await prisma.chat_conversation.deleteMany({ where: { user_id: userId } })).count;
    },
  };
}
