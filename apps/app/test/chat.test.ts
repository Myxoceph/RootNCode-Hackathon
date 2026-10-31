import { beforeEach, describe, expect, it, vi } from "vitest";

type Chat = typeof import("../src/lib/chat");
type Assistant = typeof import("../src/data/assistant");

const API = "http://api.test";

function response(answer: string, citations: Array<{ ref: number; kind: "asset" | "dish" | "trip" | "weather"; id: string; title: string }> = []) {
  return {
    version: "0.3.11",
    lang: "tr",
    answer,
    citations,
    grounded: citations.length > 0,
    attachments: { trip: null },
    model: "qwen3.8-flash-next",
  };
}

const ULUCAMI = { ref: 1, kind: "asset" as const, id: "bursa-osmangazi-ulucami", title: "Ulucami" };

/** A fetch whose answers the test hands out one request at a time. */
function scriptedFetch() {
  const calls: Array<{ url: string; init: RequestInit; reply: (body: unknown, status?: number) => void }> = [];
  const fetch = vi.fn(
    (url: string, init: RequestInit) =>
      new Promise<Response>((resolve) => calls.push({ url, init, reply: (body, status = 200) => resolve(Response.json(body, { status })) })),
  );
  vi.stubGlobal("fetch", fetch);
  return { fetch, calls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const sent = (init: RequestInit) => JSON.parse(init.body as string) as Record<string, unknown>;

let chat: Chat;
let assistant: Assistant;

async function load(source: "api" | "mock" = "api") {
  vi.resetModules();
  vi.stubEnv("EXPO_PUBLIC_API_URL", API);
  vi.stubEnv("EXPO_PUBLIC_DATA_SOURCE", source);
  chat = await import("../src/lib/chat");
  assistant = await import("../src/data/assistant");
}

beforeEach(async () => {
  await load();
});

describe("answerParts", () => {
  it("splits an answer at its markers and resolves each to its source", () => {
    expect(chat.answerParts("Bayezid yaptırdı [1]. 1399'da açıldı [1][2].", [ULUCAMI, { ...ULUCAMI, ref: 2, title: "Kitabe" }])).toEqual([
      { kind: "text", text: "Bayezid yaptırdı " },
      { kind: "ref", citation: ULUCAMI },
      { kind: "text", text: ". 1399'da açıldı " },
      { kind: "ref", citation: ULUCAMI },
      { kind: "ref", citation: { ...ULUCAMI, ref: 2, title: "Kitabe" } },
      { kind: "text", text: "." },
    ]);
  });

  it("drops a marker without a source and keeps an answer without markers whole", () => {
    expect(chat.answerParts("Bilgi [3] yok.", [ULUCAMI])).toEqual([
      { kind: "text", text: "Bilgi " },
      { kind: "text", text: " yok." },
    ]);
    expect(chat.answerParts("Merhaba!", [])).toEqual([{ kind: "text", text: "Merhaba!" }]);
  });
});

describe("historyFor", () => {
  it("sends only the last six turns, oldest first, each cut to 2000 characters", () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      i % 2 === 0
        ? { id: i, role: "user" as const, text: `soru ${i}` }
        : { id: i, role: "assistant" as const, response: response(i === 7 ? "x".repeat(2100) : `cevap ${i}`) as never },
    );
    const history = chat.historyFor(entries);
    expect(history.map((turn) => turn.content.slice(0, 7))).toEqual(["soru 2", "cevap 3", "soru 4", "cevap 5", "soru 6", "xxxxxxx"]);
    expect(history.at(-1)!.content).toHaveLength(2000);
    expect(history[1]!.role).toBe("assistant");
  });
});

describe("asking", () => {
  it("sends the question with the asset and the earlier turns, and keeps both turns", async () => {
    const { calls } = scriptedFetch();
    const first = chat.ask("bursa-osmangazi-ulucami", "  Kim yaptırdı? ", "bursa-osmangazi-ulucami");
    await flush();
    // A second question while the first is on its way is not sent.
    await expect(chat.ask("bursa-osmangazi-ulucami", "İkinci soru")).resolves.toBeNull();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${API}/chat`);
    expect(sent(calls[0]!.init)).toEqual({ message: "Kim yaptırdı?", assetId: "bursa-osmangazi-ulucami", history: [], lang: "tr" });
    calls[0]!.reply(response("Yıldırım Bayezid [1].", [ULUCAMI]));
    expect((await first)?.answer).toBe("Yıldırım Bayezid [1].");

    const second = chat.ask("bursa-osmangazi-ulucami", "Ne zaman?", "bursa-osmangazi-ulucami");
    await flush();
    expect(sent(calls[1]!.init).history).toEqual([
      { role: "user", content: "Kim yaptırdı?" },
      { role: "assistant", content: "Yıldırım Bayezid [1]." },
    ]);
    calls[1]!.reply(response("1399 [1].", [ULUCAMI]));
    await second;
  });

  it("keeps a failed question with the reason, to send again", async () => {
    const { calls } = scriptedFetch();
    const asked = chat.ask("general", "Merhaba");
    await flush();
    calls[0]!.reply({ error: { code: "ASSISTANT_BUSY", message: "busy" } }, 503);
    expect(await asked).toBeNull();

    const { failed, pending, entries } = readConversation("general");
    expect(failed).toEqual({ question: "Merhaba", message: expect.stringContaining("başka sorulara bakıyor") });
    expect(pending).toBeNull();
    expect(entries).toEqual([]);
  });

  it("cancels the question on its way when the conversation is cleared", async () => {
    const { calls } = scriptedFetch();
    const asked = chat.ask("general", "Merhaba");
    await flush();
    chat.clearConversation("general");
    expect(calls[0]!.init.signal?.aborted).toBe(true);
    calls[0]!.reply(response("Merhaba!"));
    expect(await asked).toBeNull();
    expect(readConversation("general")).toEqual({ entries: [], pending: null, failed: null });
  });

  it("does not give a cleared question's answer to the same question asked again", async () => {
    const { calls } = scriptedFetch();
    const first = chat.ask("general", "Bu eserin hikâyesi nedir?");
    await flush();
    calls[0]!.reply(response("Eski cevap [1].", [ULUCAMI]));
    await first;
    const cancelled = chat.ask("general", "Bu eserin hikâyesi nedir?");
    await flush();
    chat.clearConversation("general");
    const again = chat.ask("general", "Bu eserin hikâyesi nedir?");
    await flush();

    // The cancelled request answers late, with the old conversation behind it.
    calls[1]!.reply(response("Geç gelen cevap."));
    expect(await cancelled).toBeNull();
    expect(readConversation("general").pending).toBe("Bu eserin hikâyesi nedir?");
    expect(sent(calls[2]!.init).history).toEqual([]);
    calls[2]!.reply(response("Yeni cevap."));
    await again;
    expect(readConversation("general").entries.map((entry) => (entry.role === "user" ? entry.text : entry.response.answer))).toEqual([
      "Bu eserin hikâyesi nedir?",
      "Yeni cevap.",
    ]);
  });
});

describe("assistant status", () => {
  it("asks /chat/status once, and an unavailable model turns the entry points off", async () => {
    const { calls } = scriptedFetch();
    const first = assistant.checkAssistant();
    void assistant.checkAssistant();
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${API}/chat/status`);
    calls[0]!.reply({ version: "0.3.11", available: true, model: "qwen3.8-flash-next" });
    await first;
    expect(readAvailable()).toBe(true);

    // A cached answer: no second request.
    await assistant.checkAssistant();
    expect(calls).toHaveLength(1);

    // Building the message changes nothing; the failed question does.
    expect(assistant.chatError(503, "ASSISTANT_UNAVAILABLE", []).message).toContain("cevap veremiyor");
    expect(readAvailable()).toBe(true);
    const asked = assistant.askAssistant({ message: "Merhaba" });
    await flush();
    calls[1]!.reply({ error: { code: "ASSISTANT_UNAVAILABLE", message: "down" } }, 503);
    await expect(asked).rejects.toThrow("cevap veremiyor");
    expect(readAvailable()).toBe(false);

    // Not cached: the next screen asks again, and a model that is back shows up at once.
    const rechecked = assistant.checkAssistant();
    await flush();
    expect(calls[2]!.url).toBe(`${API}/chat/status`);
    calls[2]!.reply({ version: "0.3.11", available: true, model: "qwen3.8-flash-next" });
    await rechecked;
    expect(readAvailable()).toBe(true);
  });

  it("hides the assistant after a failed check but asks again next time, and never asks with the mock source", async () => {
    const { calls } = scriptedFetch();
    const checked = assistant.checkAssistant();
    await flush();
    calls[0]!.reply({ error: { code: "INTERNAL_ERROR" } }, 500);
    await checked;
    expect(readAvailable()).toBe(false);
    void assistant.checkAssistant();
    await flush();
    expect(calls).toHaveLength(2);

    await load("mock");
    const mockFetch = scriptedFetch();
    await assistant.checkAssistant();
    expect(mockFetch.calls).toHaveLength(0);
    expect(readAvailable()).toBe(false);
  });
});

const readConversation = (key: string) => chat.getConversation(key);
const readAvailable = () => assistant.assistantAvailable();
