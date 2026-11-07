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
const TOKEN = "vgb_account".padEnd(40, "x");
const CONVERSATION = "4f0c3a52-2c1e-4d8a-9b9f-3e2d1c0b9a87";
/** The account signed in on the device (`vagabonds-community-session`); Rehber answers accounts only. */
function account(username: string | null = "gezgin") {
  return {
    user: { id: "0b9f6c2e-6d0e-4a55-8c1a-0e7d2f4b5a11", nickname: "Gezgin", username, role: "visitor", createdAt: "2026-10-25T08:00:00.000Z" },
    token: TOKEN,
  };
}
const KEY = "0b9f6c2e-6d0e-4a55-8c1a-0e7d2f4b5a11:general";

/** A fetch whose answers the test hands out one request at a time. */
function scriptedFetch() {
  const calls: Array<{ url: string; init: RequestInit; reply: (body: unknown, status?: number) => void }> = [];
  const fetch = vi.fn(
    (url: string, init: RequestInit) =>
      new Promise<Response>((resolve) =>
        calls.push({ url, init, reply: (body, status = 200) => resolve(status === 204 ? new Response(null, { status }) : Response.json(body, { status })) }),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  return { fetch, calls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const sent = (init: RequestInit) => JSON.parse(init.body as string) as Record<string, unknown>;

let chat: Chat;
let assistant: Assistant;

async function load(source: "api" | "mock" = "api", session: ReturnType<typeof account> | null = account()) {
  vi.resetModules();
  vi.stubEnv("EXPO_PUBLIC_API_URL", API);
  vi.stubEnv("EXPO_PUBLIC_DATA_SOURCE", source);
  const keychain = (await import("./mocks/secure-store")).store;
  keychain.clear();
  if (session) keychain.set("vagabonds-community-session", JSON.stringify(session));
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

describe("answerLines", () => {
  const lines = (answer: string) => chat.answerLines(chat.answerParts(answer, [ULUCAMI]));
  const text = (value: string, bold = false) => ({ kind: "text", text: value, bold });

  it("turns list marks into list items and bolds an item's leading name", () => {
    expect(lines("Lezzetler:\n\n- Pideli Köfte: yoğurtlu [1]\n2. **Cantık** fırında\n\nAfiyet olsun.")).toEqual([
      { kind: "paragraph", parts: [text("Lezzetler:")] },
      { kind: "gap" },
      { kind: "bullet", parts: [text("Pideli Köfte:", true), text(" yoğurtlu "), { kind: "ref", citation: ULUCAMI }] },
      { kind: "number", number: "2", parts: [text("Cantık", true), text(" fırında")] },
      { kind: "gap" },
      { kind: "paragraph", parts: [text("Afiyet olsun.")] },
    ]);
  });

  it("bolds headings and drops blank lines at the ends", () => {
    expect(lines("\n## Tarihçe\n1399'da açıldı.\n\n")).toEqual([
      { kind: "paragraph", parts: [text("Tarihçe", true)] },
      { kind: "paragraph", parts: [text("1399'da açıldı.")] },
    ]);
  });
});

describe("followUps", () => {
  const topics = (r: ReturnType<typeof response>) => chat.followUps(r as never, "tr").map((offer) => offer.topic);

  it("offers food, transit and the weather after a trip plan", () => {
    const trip = {
      ...response("Plan hazır [1].", [{ ref: 1, kind: "trip", id: "t", title: "Gezi" }]),
      attachments: { trip: { city: { code: "bursa", label: "Bursa" } }, transit: null },
    };
    expect(topics(trip as never)).toEqual(["food", "transit", "weather"]);
  });

  it("offers the way there, food nearby and a route after a site, naming it", () => {
    const offers = chat.followUps(response("1399'da [1].", [ULUCAMI]) as never, "tr");
    expect(offers.map((offer) => offer.topic)).toEqual(["transit", "food", "trip"]);
    expect(offers[0]!.question).toContain("Ulucami");
  });

  it("leaves out what the answer already covers and offers nothing for small talk", () => {
    expect(topics(response("Ulucami [1], köfte [2].", [ULUCAMI, { ref: 2, kind: "dish", id: "d", title: "Köfte" }]))).toEqual(["transit", "trip"]);
    expect(topics(response("Merhaba!"))).toEqual([]);
  });
});

describe("historyFor", () => {
  it("sends only the last twelve turns, oldest first, each cut to 2000 characters", () => {
    const entries = Array.from({ length: 14 }, (_, i) =>
      i % 2 === 0
        ? { id: i, role: "user" as const, text: `soru ${i}` }
        : { id: i, role: "assistant" as const, response: response(i === 13 ? "x".repeat(2100) : `cevap ${i}`) as never },
    );
    const history = chat.historyFor(entries);
    expect(history.map((turn) => turn.content.slice(0, 8))).toEqual([
      "soru 2", "cevap 3", "soru 4", "cevap 5", "soru 6", "cevap 7", "soru 8", "cevap 9", "soru 10", "cevap 11", "soru 12", "xxxxxxxx",
    ]);
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
    expect(readConversation("general")).toEqual({ entries: [], pending: null, failed: null, conversationId: null, archived: null });
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

describe("saved conversations", () => {
  const conversation = (archived: boolean, assetId: string | null = null) => ({
    id: CONVERSATION,
    title: "Kim yaptırdı?",
    assetId,
    assetName: assetId ? "Ulucami" : null,
    messageCount: 2,
    createdAt: "2026-11-02T08:00:00.000Z",
    updatedAt: "2026-11-02T08:00:00.000Z",
    archived,
  });
  const stored = [
    { role: "user", text: "Kim yaptırdı?", createdAt: "2026-11-02T08:00:00.000Z" },
    { role: "assistant", response: { ...response("Yıldırım Bayezid [1].", [ULUCAMI]), conversationId: CONVERSATION }, createdAt: "2026-11-02T08:00:00.000Z" },
  ];

  it("asks as the account and continues the conversation the first answer was saved in", async () => {
    const { calls } = scriptedFetch();
    const first = chat.ask(KEY, "Kim yaptırdı?");
    await flush();
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(sent(calls[0]!.init)).not.toHaveProperty("conversationId");
    calls[0]!.reply({ ...response("Bayezid."), conversationId: CONVERSATION });
    await first;
    expect(readConversation(KEY).conversationId).toBe(CONVERSATION);

    const second = chat.ask(KEY, "Ne zaman?");
    await flush();
    expect(sent(calls[1]!.init).conversationId).toBe(CONVERSATION);
    // Archived on another phone: the question can go out again in a new conversation.
    calls[1]!.reply({ error: { code: "CONVERSATION_ARCHIVED", message: "archived" } }, 409);
    await second;
    expect(readConversation(KEY)).toMatchObject({ conversationId: null, failed: { message: expect.stringContaining("arşivde") } });
  });

  it("archives the conversation on the API when a new one starts", async () => {
    const { calls } = scriptedFetch();
    const first = chat.ask(KEY, "Merhaba");
    await flush();
    calls[0]!.reply({ ...response("Merhaba!"), conversationId: CONVERSATION });
    await first;
    chat.clearConversation(KEY);
    await flush();
    expect(calls[1]!.url).toBe(`${API}/me/conversations/${CONVERSATION}/archive`);
    expect(calls[1]!.init.method).toBe("POST");
    calls[1]!.reply(null, 204);
    expect(readConversation(KEY).entries).toEqual([]);
  });

  it("brings back the page's open conversation once, and opens an archived one read-only", async () => {
    const { calls } = scriptedFetch();
    const resumed = chat.resumeConversation(KEY, undefined);
    await flush();
    expect(calls[0]!.url).toBe(`${API}/me/conversations`);
    calls[0]!.reply({ version: "0.3.18", items: [conversation(false, "bursa-osmangazi-ulucami"), { ...conversation(false), id: CONVERSATION }] });
    await flush();
    expect(calls[1]!.url).toBe(`${API}/me/conversations/${CONVERSATION}`);
    calls[1]!.reply({ version: "0.3.18", conversation: conversation(false), messages: stored });
    await resumed;
    expect(readConversation(KEY)).toMatchObject({ conversationId: CONVERSATION, archived: null });
    expect(readConversation(KEY).entries.map((entry) => entry.role)).toEqual(["user", "assistant"]);
    await chat.resumeConversation(KEY, undefined);
    expect(calls).toHaveLength(2);

    const opened = chat.openArchived(CONVERSATION);
    await flush();
    calls[2]!.reply({ version: "0.3.18", conversation: conversation(true), messages: stored });
    await opened;
    const key = chat.archiveKey(CONVERSATION);
    expect(readConversation(key).archived).toMatchObject({ id: CONVERSATION, archived: true });
    await expect(chat.ask(key, "Bir soru daha")).resolves.toBeNull();
    expect(calls).toHaveLength(3);
  });

  it("asks nothing without an account", async () => {
    await load("api", account(null));
    const { calls } = scriptedFetch();
    await expect(assistant.askAssistant({ message: "Merhaba" })).rejects.toThrow("giriş yap");
    await load("api", null);
    await expect(assistant.fetchConversations()).rejects.toThrow("giriş yap");
    expect(calls).toHaveLength(0);
  });

  it("groups the history by day", () => {
    const now = new Date(2026, 10, 2, 15);
    expect(chat.dayGroup(new Date(2026, 10, 2, 9).toISOString(), "tr", now)).toBe("Bugün");
    expect(chat.dayGroup(new Date(2026, 10, 1, 23).toISOString(), "tr", now)).toBe("Dün");
    expect(chat.dayGroup(new Date(2026, 9, 29).toISOString(), "tr", now)).toBe("Bu hafta");
    expect(chat.dayGroup(new Date(2026, 9, 2).toISOString(), "tr", now)).toBe("Ekim 2026");
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
