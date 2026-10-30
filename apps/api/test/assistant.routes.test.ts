/**
 * Integration tests: real PostgreSQL (DATABASE_URL) with the imported dataset and a
 * scripted stand-in for the model, so the tool loop runs against real data offline.
 * Every response is also parsed with the shared contract.
 */
import "dotenv/config";
import { ChatResponseSchema, ChatStatusResponseSchema } from "@vagabonds/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";
import { createAssistantRepository } from "../src/modules/assistant/assistant.repository.ts";
import { ModelError, type ChatMessage, type ChatModel, type ModelReply, type ToolSpec } from "../src/modules/assistant/assistant.model.ts";

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

  beforeAll(() => {
    prisma = createPrismaClient(DATABASE_URL as string);
  });

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
    await prisma.$disconnect();
  });

  function appWith(model: ChatModel | null) {
    const app = buildApp({ prisma, assistantModel: model, rateLimit: false });
    apps.push(app);
    return app;
  }

  async function chat(app: ReturnType<typeof buildApp>, payload: object, status = 200) {
    const response = await app.inject({ method: "POST", url: "/chat", payload });
    expect(response.statusCode, response.body).toBe(status);
    return response;
  }

  it("finds assets by all the words of their name, without Turkish characters or suffixes", async () => {
    const repository = createAssistantRepository(prisma, "published");
    const first = async (query: string) => (await repository.searchAssets(query, { lang: "tr", limit: 3 }))[0]?.id;
    expect(await first("ulu camii bursa")).toBe("bursa-osmangazi-ulucami");
    expect(await first("ordekli hamami")).toBe(HAMAM);
    const inHatay = await repository.searchAssets("Habib-i Neccar", { city: "hatay", lang: "tr", limit: 3 });
    expect(inHatay.every((hit) => hit.id.startsWith("hatay-"))).toBe(true);
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
    await chat(appWith(model), { message: "Hava nasıl?" });
    expect(calls.map((c) => c.tools.length)).toEqual([5, 5, 5, 0]);
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
});
