/**
 * Integration tests: real PostgreSQL (DATABASE_URL) with the imported dataset and a
 * scripted stand-in for the model, so the tool loop runs against real data offline.
 * Every response is also parsed with the shared contract.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  CHAT_CONVERSATION_MAX_MESSAGES,
  CHAT_CONVERSATIONS_KEPT,
  ChatConversationResponseSchema,
  ChatConversationsResponseSchema,
  ChatResponseSchema,
  ChatStatusResponseSchema,
} from "@vagabonds/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";
import { createAssistantRepository } from "../src/modules/assistant/assistant.repository.ts";
import { conversationTitle } from "../src/modules/assistant/conversations.repository.ts";
import { hashToken, newToken } from "../src/modules/community/auth.ts";
import { ModelError, type ChatMessage, type ChatModel, type ModelReply, type ToolSpec } from "../src/modules/assistant/assistant.model.ts";
import { TOOL_SPECS } from "../src/modules/assistant/assistant.tools.ts";

const DATABASE_URL = process.env["DATABASE_URL"];
const HAMAM = "bursa-osmangazi-ordekli-hamam";

type Step = ModelReply | Error | ((messages: ChatMessage[]) => ModelReply | Promise<ModelReply>);

/** A model that replays `steps` (the last one repeats) and records what it was sent. */
function scriptedModel(steps: Step[], { reachable = true } = {}) {
  const calls: Array<{ messages: ChatMessage[]; tools: ToolSpec[] }> = [];
  const model: ChatModel = {
    name: "stub-model",
    async complete(messages, tools) {
      calls.push({ messages: structuredClone(messages), tools });
      const step = steps[Math.min(calls.length - 1, steps.length - 1)]!;
      if (step instanceof Error) throw step;
      return typeof step === "function" ? step(messages) : step;
    },
    ping: async () => reachable,
  };
  return { model, calls };
}

const answer = (content: string): ModelReply => ({ content, toolCalls: [] });
const call = (name: string, args: Record<string, unknown>, id = `call_${name}`): ModelReply => ({
  content: null,
  toolCalls: [{ id, name, arguments: JSON.stringify(args) }],
});
const toolMessages = (messages: ChatMessage[]) =>
  messages.filter((m): m is Extract<ChatMessage, { role: "tool" }> => m.role === "tool").map((m) => m.content);

describe.skipIf(!DATABASE_URL)("assistant routes (PostgreSQL, scripted model)", () => {
  let prisma: PrismaClient;
  const apps: Array<ReturnType<typeof buildApp>> = [];
  const userIds: string[] = [];
  const tag = randomUUID().slice(0, 8);
  /** Most tests ask as this account. */
  let account: { id: string; token: string };

  /** An account (username and password) or an anonymous session, with a token. */
  async function createUser(kind: "account" | "anonymous" = "account") {
    const token = newToken();
    const user = await prisma.app_user.create({
      data: {
        nickname: `sohbet-${kind}`,
        ...(kind === "account" && { username: `t${tag}${userIds.length}`, password_hash: "scrypt$test" }),
        sessions: { create: { token_hash: hashToken(token) } },
      },
    });
    userIds.push(user.id);
    return { id: user.id, token };
  }

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL as string);
    account = await createUser();
  });

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
    await prisma.app_user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  function appWith(model: ChatModel | null) {
    const app = buildApp({ prisma, assistantModel: model, rateLimit: false });
    apps.push(app);
    return app;
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  async function chat(app: ReturnType<typeof buildApp>, payload: object, status = 200, token = account.token) {
    const response = await app.inject({ method: "POST", url: "/chat", payload, headers: auth(token) });
    expect(response.statusCode, response.body).toBe(status);
    return response;
  }

  it("finds assets by all the words of their name, without Turkish characters or suffixes", async () => {
    const repository = createAssistantRepository(prisma, "published");
    const first = async (query: string) => (await repository.searchAssets(query, { lang: "tr", limit: 3 }))[0]?.id;
    expect(await first("ulu camii bursa")).toBe("bursa-osmangazi-ulucami");
    // Who and when come with the hit, so those questions need no asset_details call.
    const [ulucami] = await repository.searchAssets("ulu camii bursa", { lang: "tr", limit: 1 });
    expect(ulucami).toMatchObject({ founder: expect.stringContaining("Bayezid"), dating: expect.any(String) });
    expect(await first("ordekli hamami")).toBe(HAMAM);
    // "Selçuklu camileri": era and type with no words, the best-documented first; Selçuklu is also a district.
    const seljuk = await repository.searchAssets("", { city: "konya", era: "selcuklu", type: "cami", lang: "tr", limit: 5 });
    expect(seljuk.map((hit) => hit.id)).toContain("konya-selcuklu-sultan-alaeddin-ulu-camii");
    expect(await repository.searchAssets("", { lang: "tr", limit: 5 })).toEqual([]);
    const inHatay = await repository.searchAssets("Habib-i Neccar", { city: "hatay", lang: "tr", limit: 3 });
    expect(inHatay.every((hit) => hit.id.startsWith("hatay-"))).toBe(true);
  });

  it("answers a repeated first question from memory, but not a follow-up", async () => {
    const { model, calls } = scriptedModel([answer("Merhaba!")]);
    const app = appWith(model);
    const { conversationId, ...first } = ChatResponseSchema.parse((await chat(app, { message: "Merhaba" })).json());
    const again = ChatResponseSchema.parse((await chat(app, { message: "  merhaba " })).json());
    // The same answer, saved in a conversation of its own.
    expect({ ...again, conversationId: undefined }).toEqual({ ...first, conversationId: undefined });
    expect(again.conversationId).not.toBe(conversationId);
    expect(calls).toHaveLength(1);

    await chat(app, { message: "Merhaba", history: [{ role: "user", content: "Selam" }, { role: "assistant", content: "Selam!" }] });
    await chat(app, { message: "Merhaba", lang: "en" });
    expect(calls).toHaveLength(3);
  });

  it("reports itself unavailable without a model, and answers 503", async () => {
    const app = appWith(null);
    const status = ChatStatusResponseSchema.parse((await app.inject({ method: "GET", url: "/chat/status" })).json());
    expect(status).toMatchObject({ available: false, model: null });
    expect((await chat(app, { message: "Merhaba" }, 503)).json().error.code).toBe("ASSISTANT_UNAVAILABLE");
  });

  it("reports an unreachable model as unavailable", async () => {
    const { model } = scriptedModel([answer("-")], { reachable: false });
    const status = ChatStatusResponseSchema.parse((await appWith(model).inject({ method: "GET", url: "/chat/status" })).json());
    expect(status).toMatchObject({ available: false, model: "stub-model" });
  });

  it("rejects an empty or too long message", async () => {
    const { model } = scriptedModel([answer("-")]);
    const app = appWith(model);
    expect((await chat(app, { message: "  " }, 400)).json().error.code).toBe("INVALID_BODY");
    expect((await chat(app, { message: "x".repeat(501) }, 400)).json().error.code).toBe("INVALID_BODY");
  });

  it("takes the last six questions and answers as history, and no more", async () => {
    const { model, calls } = scriptedModel([answer("-")]);
    const app = appWith(model);
    const turns = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? ("user" as const) : ("assistant" as const), content: `tur ${i}` }));
    await chat(app, { message: "Peki ya bu?", history: turns(12) });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.messages.filter((m) => m.role !== "system").map((m) => m.content)).toEqual([...turns(12).map((turn) => turn.content), "Peki ya bu?"]);
    expect((await chat(app, { message: "Peki ya bu?", history: turns(13) }, 400)).json().error.code).toBe("INVALID_BODY");
  });

  it("searches, reads an asset and cites it; unknown markers are dropped", async () => {
    const { model, calls } = scriptedModel([
      call("search_assets", { query: "Ördekli Hamam", city: "Bursa" }),
      (messages) => {
        const { results } = JSON.parse(toolMessages(messages).at(-1)!) as { results: Array<{ id: string }> };
        return call("asset_details", { id: results.find((r) => r.id === HAMAM)!.id });
      },
      (messages) => {
        const asset = JSON.parse(toolMessages(messages).at(-1)!) as { ref: number; name: string };
        return answer(`${asset.name} bir hamamdır [${asset.ref}]. Kubbesi altındır [9].`);
      },
    ]);
    const body = ChatResponseSchema.parse((await chat(appWith(model), { message: "Ördekli Hamam ne zaman yapıldı?" })).json());

    expect(body.grounded).toBe(true);
    expect(body.citations).toHaveLength(1);
    expect(body.citations[0]).toMatchObject({ kind: "asset", id: HAMAM });
    expect(body.answer).toMatch(new RegExp(`\\[${body.citations[0]!.ref}\\]\\.`));
    expect(body.answer).not.toContain("[9]");
    expect(body.attachments.trip).toBeNull();
    expect(body.model).toBe("stub-model");
    // The asset's sourced texts reached the model.
    expect(toolMessages(calls[2]!.messages).at(-1)).toContain('"sections"');
  });

  it("plans a trip and attaches the plan", async () => {
    const { model } = scriptedModel([
      call("plan_trip", { city: "bursa", duration: "half" }),
      (messages) => answer(`Sabah planı hazır [${JSON.parse(toolMessages(messages).at(-1)!).ref}].`),
    ]);
    const body = ChatResponseSchema.parse((await chat(appWith(model), { message: "Bursa'da yarım gün gezi" })).json());
    expect(body.attachments.trip).toMatchObject({ city: { code: "bursa" }, duration: "half" });
    expect(body.citations).toEqual([expect.objectContaining({ kind: "trip", id: "bursa" })]);
  });

  it("cites dishes", async () => {
    const { model } = scriptedModel([
      call("city_dishes", { city: "hatay", kind: "dessert" }),
      (messages) => {
        const { dishes } = JSON.parse(toolMessages(messages).at(-1)!) as { dishes: Array<{ ref: number; name: string }> };
        return answer(`${dishes[0]!.name} denenebilir [${dishes[0]!.ref}].`);
      },
    ]);
    const body = ChatResponseSchema.parse((await chat(appWith(model), { message: "Hatay'da ne tatlı yenir?" })).json());
    expect(body.citations).toEqual([expect.objectContaining({ kind: "dish" })]);
    expect(body.citations[0]!.id).toMatch(/^hatay-/);
  });

  it("returns a bad tool call to the model as an error and answers ungrounded", async () => {
    const { model, calls } = scriptedModel([
      call("asset_details", { id: "bursa-osmangazi-yok-boyle-bir-eser" }),
      call("no_such_tool", {}),
      answer("Veri setimizde bu eser yok."),
    ]);
    const body = ChatResponseSchema.parse((await chat(appWith(model), { message: "Yok böyle bir eser" })).json());
    expect(toolMessages(calls[2]!.messages)).toEqual([expect.stringContaining("error"), expect.stringContaining("Unknown tool")]);
    expect(body).toMatchObject({ grounded: false, citations: [], answer: "Veri setimizde bu eser yok." });
  });

  it("sends a tool call's provider data back with it", async () => {
    const extraContent = { google: { thought_signature: "sig" } };
    const { model, calls } = scriptedModel([
      { content: null, toolCalls: [{ id: "c1", name: "weather", arguments: '{"city":"bursa"}', extraContent }] },
      answer("Tamam."),
    ]);
    await chat(appWith(model), { message: "Hava?" });
    expect(calls[1]!.messages.find((m) => m.role === "assistant")).toMatchObject({ tool_calls: [{ id: "c1", extra_content: extraContent }] });
  });

  it("stops offering tools after three calls", async () => {
    const { model, calls } = scriptedModel([
      call("weather", { city: "bursa" }, "a"),
      call("weather", { city: "bursa" }, "b"),
      call("weather", { city: "bursa" }, "c"),
      answer("Hava bilgisine ulaşılamadı."),
    ]);
    await chat(appWith(model), { message: "Bursa nasıl bir yer?" });
    const all = TOOL_SPECS.length;
    expect(calls.map((c) => c.tools.length)).toEqual([all, all, all, 0]);
  });

  it("offers no trip plan to a question about lunch on a route", async () => {
    const { model, calls } = scriptedModel([answer("Öğle için bir öneri.")]);
    const response = await chat(appWith(model), { message: "Bu rotada öğle yemeği için ne önerirsin?" });
    expect(calls[0]?.tools.map((tool) => tool.name)).not.toContain("plan_trip");
    expect(response.statusCode, response.body).toBe(200);
  });

  it("gives the model the page's asset, and leaves old markers out of the history", async () => {
    const { model, calls } = scriptedModel([answer("Tamam.")]);
    await chat(appWith(model), {
      message: "Bu eser ne zaman yapılmış?",
      assetId: HAMAM,
      history: [
        { role: "user", content: "Merhaba" },
        { role: "assistant", content: "Merhaba, eski cevap [3]." },
      ],
    });
    const sent = calls[0]!.messages;
    // The page goes into the one system message, which comes first: Qwen refuses a second one.
    expect(sent.filter((m) => m.role === "system")).toHaveLength(1);
    expect(sent[0]).toMatchObject({ role: "system", content: expect.stringContaining(`"id":"${HAMAM}"`) });
    // The page's asset is source [1], and the model is told to cite it.
    expect(sent[0]!.content).toContain("kaynak [1]");
    // The page is fenced as data, and the system message ends where the fence closes.
    expect(sent[0]!.content).toMatch(/<eser_sayfasi>\n\{[\s\S]*\}\n<\/eser_sayfasi>$/);
    expect(sent.find((m) => m.role === "assistant")).toMatchObject({ content: "Merhaba, eski cevap." });
    expect(sent.at(-1)).toEqual({ role: "user", content: "Bu eser ne zaman yapılmış?" });
  });

  it("answers 503 when the model fails", async () => {
    const { model } = scriptedModel([new ModelError("Model returned HTTP 500")]);
    expect((await chat(appWith(model), { message: "Merhaba" }, 503)).json().error.code).toBe("ASSISTANT_UNAVAILABLE");
  });

  it("answers 503 busy beyond two questions at once", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { model } = scriptedModel([async () => (await gate, answer("Tamam."))]);
    const app = appWith(model);
    const running = [chat(app, { message: "Bir" }), chat(app, { message: "İki" })];
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await chat(app, { message: "Üç" }, 503)).json().error.code).toBe("ASSISTANT_BUSY");
    release();
    await Promise.all(running);
  });

  describe("conversations", () => {
    const get = (url: string, token: string) => app().inject({ method: "GET", url, headers: auth(token) });
    let shared: ReturnType<typeof buildApp> | null = null;
    function app() {
      shared ??= appWith(scriptedModel([answer("Banisi Sultan Orhan'dır.")]).model);
      return shared;
    }

    it("answers only accounts: 401 without a token, 403 to an anonymous session", async () => {
      const response = await app().inject({ method: "POST", url: "/chat", payload: { message: "Merhaba" } });
      expect([response.statusCode, response.json().error.code]).toEqual([401, "UNAUTHORIZED"]);
      const anonymous = await createUser("anonymous");
      expect((await chat(app(), { message: "Merhaba" }, 403, anonymous.token)).json().error.code).toBe("ACCOUNT_REQUIRED");
      expect((await get("/me/conversations", anonymous.token)).statusCode).toBe(403);
    });

    it("saves each question and answer, and lists the conversation with its page", async () => {
      const user = await createUser();
      const first = ChatResponseSchema.parse((await chat(app(), { message: "Bunu kim yaptırdı?", assetId: HAMAM }, 200, user.token)).json());
      expect(first.conversationId).toEqual(expect.any(String));
      const next = ChatResponseSchema.parse(
        (await chat(app(), { message: "Ne zaman?", assetId: HAMAM, conversationId: first.conversationId }, 200, user.token)).json(),
      );
      expect(next.conversationId).toBe(first.conversationId);

      const list = ChatConversationsResponseSchema.parse((await get("/me/conversations", user.token)).json());
      expect(list.items).toEqual([
        expect.objectContaining({ id: first.conversationId, title: "Bunu kim yaptırdı?", assetId: HAMAM, messageCount: 4, archived: false }),
      ]);
      expect(list.items[0]!.assetName).toMatch(/Ördekli/);

      const detail = ChatConversationResponseSchema.parse((await get(`/me/conversations/${first.conversationId}`, user.token)).json());
      expect(detail.messages.map((m) => (m.role === "user" ? m.text : m.response.answer))).toEqual([
        "Bunu kim yaptırdı?",
        first.answer,
        "Ne zaman?",
        next.answer,
      ]);
      expect(detail.messages[1]).toMatchObject({ role: "assistant", response: { ...first, conversationId: null } });
    });

    it("archives the page's open conversation when a new one starts, and refuses questions to it", async () => {
      const user = await createUser();
      const old = ChatResponseSchema.parse((await chat(app(), { message: "İlk konuşma" }, 200, user.token)).json());
      const onAsset = ChatResponseSchema.parse((await chat(app(), { message: "Eserde", assetId: HAMAM }, 200, user.token)).json());
      const fresh = ChatResponseSchema.parse((await chat(app(), { message: "Yeni konuşma" }, 200, user.token)).json());

      const items = ChatConversationsResponseSchema.parse((await get("/me/conversations", user.token)).json()).items;
      const archived = Object.fromEntries(items.map((item) => [item.id, item.archived]));
      // Another page's conversation stays open.
      expect(archived).toEqual({ [old.conversationId!]: true, [onAsset.conversationId!]: false, [fresh.conversationId!]: false });
      expect(items.map((item) => item.id)).toEqual([fresh.conversationId, onAsset.conversationId, old.conversationId]);

      const refused = await chat(app(), { message: "Devam", conversationId: old.conversationId }, 409, user.token);
      expect(refused.json().error.code).toBe("CONVERSATION_ARCHIVED");
      const elsewhere = await chat(app(), { message: "Devam", conversationId: fresh.conversationId, assetId: HAMAM }, 400, user.token);
      expect(elsewhere.json().error.code).toBe("CONVERSATION_PAGE_MISMATCH");
    });

    it("keeps conversations to their owner", async () => {
      const owner = await createUser();
      const other = await createUser();
      const { conversationId } = ChatResponseSchema.parse((await chat(app(), { message: "Benim" }, 200, owner.token)).json());
      expect((await chat(app(), { message: "Araya", conversationId }, 404, other.token)).json().error.code).toBe("CONVERSATION_NOT_FOUND");
      expect((await get(`/me/conversations/${conversationId}`, other.token)).statusCode).toBe(404);
      const remove = await app().inject({ method: "DELETE", url: `/me/conversations/${conversationId}`, headers: auth(other.token) });
      expect(remove.statusCode).toBe(404);
      expect(ChatConversationsResponseSchema.parse((await get("/me/conversations", other.token)).json()).items).toEqual([]);
      expect((await get(`/me/conversations/${conversationId}`, owner.token)).statusCode).toBe(200);
    });

    it("archives, deletes one and deletes all", async () => {
      const user = await createUser();
      const a = ChatResponseSchema.parse((await chat(app(), { message: "Bir" }, 200, user.token)).json()).conversationId!;
      const b = ChatResponseSchema.parse((await chat(app(), { message: "İki", assetId: HAMAM }, 200, user.token)).json()).conversationId!;
      const post = (url: string) => app().inject({ method: "POST", url, headers: auth(user.token) });
      const del = (url: string) => app().inject({ method: "DELETE", url, headers: auth(user.token) });

      expect((await post(`/me/conversations/${b}/archive`)).statusCode).toBe(204);
      expect((await post(`/me/conversations/${b}/archive`)).statusCode).toBe(204);
      expect((await chat(app(), { message: "Devam", assetId: HAMAM, conversationId: b }, 409, user.token)).json().error.code).toBe(
        "CONVERSATION_ARCHIVED",
      );
      expect((await del(`/me/conversations/${a}`)).statusCode).toBe(204);
      expect((await get(`/me/conversations/${a}`, user.token)).statusCode).toBe(404);
      expect((await del("/me/conversations")).statusCode).toBe(204);
      expect(ChatConversationsResponseSchema.parse((await get("/me/conversations", user.token)).json()).items).toEqual([]);
      expect((await post(`/me/conversations/${randomUUID()}/archive`)).statusCode).toBe(404);
    });

    it(`keeps the last ${CHAT_CONVERSATIONS_KEPT} conversations and refuses a full one`, async () => {
      const user = await createUser();
      const start = Date.now() - 60 * 60_000;
      await prisma.chat_conversation.createMany({
        data: Array.from({ length: CHAT_CONVERSATIONS_KEPT }, (_, i) => ({
          user_id: user.id,
          asset_id: HAMAM,
          title: `eski ${i}`,
          updated_at: new Date(start + i * 1000),
          archived_at: new Date(start + i * 1000),
        })),
      });
      await chat(app(), { message: "Elli birinci" }, 200, user.token);
      const items = ChatConversationsResponseSchema.parse((await get("/me/conversations", user.token)).json()).items;
      expect(items).toHaveLength(CHAT_CONVERSATIONS_KEPT);
      expect(items.map((item) => item.title)).not.toContain("eski 0");
      expect(items[0]!.title).toBe("Elli birinci");

      const full = await prisma.chat_conversation.create({ data: { user_id: user.id, asset_id: HAMAM, title: "dolu" } });
      await prisma.chat_message.createMany({
        data: Array.from({ length: CHAT_CONVERSATION_MAX_MESSAGES - 1 }, (_, i) => ({
          conversation_id: full.id,
          role: "user",
          content: `soru ${i}`,
        })),
      });
      const refused = await chat(app(), { message: "Bir daha", assetId: HAMAM, conversationId: full.id }, 409, user.token);
      expect(refused.json().error.code).toBe("CONVERSATION_FULL");
    });

    it("names a conversation after its first question, cut at a word", () => {
      expect(conversationTitle("  Bursa'da   ne yenir?\n")).toBe("Bursa'da ne yenir?");
      const long = conversationTitle(`${"Ulucami ".repeat(12)}nedir`);
      expect(long.length).toBeLessThanOrEqual(80);
      expect(long.endsWith("Ulucami…")).toBe(true);
    });
  });
});
