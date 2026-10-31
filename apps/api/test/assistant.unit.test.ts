import { describe, expect, it } from "vitest";
import { createChatModel, oneSystemMessage } from "../src/modules/assistant/assistant.model.ts";
import { searchTerms } from "../src/modules/assistant/assistant.repository.ts";
import { plainText, resolveCitations, systemPrompt } from "../src/modules/assistant/assistant.ts";
import { runTool, SourceRegistry, type ToolContext } from "../src/modules/assistant/assistant.tools.ts";

describe("resolveCitations", () => {
  const sources = new SourceRegistry();
  sources.add("asset", "bursa-a", "A");
  sources.add("dish", "bursa-b", "B");

  it("keeps known markers, writes lists as [1][2] and drops unknown ones", () => {
    const { answer, citations } = resolveCitations("A eski [1, 2]. B tatlı [2]. C yeni [7].", sources);
    expect(answer).toBe("A eski [1][2]. B tatlı [2]. C yeni.");
    expect(citations.map((c) => c.ref)).toEqual([1, 2]);
  });

  it("returns no citations for an answer without markers", () => {
    expect(resolveCitations("Merhaba!", sources)).toEqual({ answer: "Merhaba!", citations: [] });
  });

  it("numbers a source once however often it is added", () => {
    expect(sources.add("asset", "bursa-a", "A")).toBe(1);
  });
});

describe("searchTerms", () => {
  it("lowercases the Turkish way and drops stopwords and short words", () => {
    expect(searchTerms("İnegöl'deki ve Bursa'nın Ulu Camii nedir?")).toEqual(["inegöl", "deki", "bursa", "nın", "ulu", "camii"]);
  });
});

describe("createChatModel", () => {
  it("posts OpenAI-style tools and reads tool calls, with the key only in the header", async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(
        JSON.stringify({
          choices: [
            { message: { content: null, tool_calls: [{ id: "c1", function: { name: "weather", arguments: { city: "bursa" } } }] } },
          ],
        }),
      );
    }) as unknown as typeof fetch;
    const model = createChatModel({ baseUrl: "http://model.test/v1/", model: "m", apiKey: "secret", fetchImpl });

    const reply = await model.complete(
      [{ role: "user", content: "hi" }],
      [{ name: "weather", description: "d", parameters: {} }],
      AbortSignal.timeout(1_000),
    );

    expect(reply.toolCalls).toEqual([{ id: "c1", name: "weather", arguments: '{"city":"bursa"}' }]);
    expect(sent!.url).toBe("http://model.test/v1/chat/completions");
    expect((sent!.init.headers as Record<string, string>).authorization).toBe("Bearer secret");
    const body = JSON.parse(sent!.init.body as string);
    expect(body.tools[0]).toEqual({ type: "function", function: { name: "weather", description: "d", parameters: {} } });
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("keeps a tool call's provider data (Gemini's thought signature) to send it back", async () => {
    const extra = { google: { thought_signature: "sig" } };
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { tool_calls: [{ id: "c1", extra_content: extra, function: { name: "weather", arguments: "{}" } }] } }],
        }),
      )) as unknown as typeof fetch;
    const model = createChatModel({ baseUrl: "http://model.test/v1", model: "m", fetchImpl });
    const reply = await model.complete([], [], AbortSignal.timeout(1_000));
    expect(reply.toolCalls[0]?.extraContent).toEqual(extra);
  });

  it("turns a provider error into a ModelError that names only the status", async () => {
    const fetchImpl = (async () => new Response("prompt was: secret question", { status: 500 })) as unknown as typeof fetch;
    const model = createChatModel({ baseUrl: "http://model.test/v1", model: "m", fetchImpl });
    await expect(model.complete([], [], AbortSignal.timeout(1_000))).rejects.toThrow(/^Model returned HTTP 500$/);
  });

  describe("ping", () => {
    const ANSWER = JSON.stringify({ choices: [{ message: { content: "ok" } }] });
    /** `/models` always answers; completions answer with `completion` (a status, or 200 with ANSWER). */
    function provider() {
      const state = { completion: 200, clock: 0 };
      const fetchImpl = (async (url: string) =>
        url.endsWith("/models")
          ? new Response("{}")
          : new Response(state.completion === 200 ? ANSWER : "busy", { status: state.completion })) as unknown as typeof fetch;
      const model = createChatModel({ baseUrl: "http://model.test/v1", model: "m", fetchImpl, now: () => state.clock });
      const ask = () => model.complete([], [], AbortSignal.timeout(1_000)).catch(() => null);
      return { state, model, ask };
    }

    it("reports unavailable after the model fails on its side, though /models answers", async () => {
      const { state, model, ask } = provider();
      expect(await model.ping()).toBe(true);
      state.completion = 503;
      await ask();
      expect(await model.ping()).toBe(false);
    });

    it("asks the provider again a minute after the failure", async () => {
      const { state, model, ask } = provider();
      state.completion = 429;
      await ask();
      state.clock = 59_000;
      expect(await model.ping()).toBe(false);
      state.clock = 61_000;
      expect(await model.ping()).toBe(true);
    });

    it("is available again as soon as an answer comes back", async () => {
      const { state, model, ask } = provider();
      state.completion = 503;
      await ask();
      state.completion = 200;
      await ask();
      expect(await model.ping()).toBe(true);
    });

    it("stays available after a fault in our own request (400)", async () => {
      const { state, model, ask } = provider();
      state.completion = 400;
      await ask();
      expect(await model.ping()).toBe(true);
    });
  });
});

describe("oneSystemMessage", () => {
  it("joins every system message into one, first, and keeps the other turns in order", () => {
    expect(
      oneSystemMessage([
        { role: "system", content: "rules" },
        { role: "user", content: "q1" },
        { role: "system", content: "note" },
        { role: "assistant", content: "a1" },
        { role: "user", content: "q2" },
      ]),
    ).toEqual([
      { role: "system", content: "rules\n\nnote" },
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
    ]);
  });

  it("leaves a conversation with one leading system message as it is", () => {
    const messages = [
      { role: "system" as const, content: "rules" },
      { role: "user" as const, content: "q" },
    ];
    expect(oneSystemMessage(messages)).toBe(messages);
  });
});

describe("plainText", () => {
  it("removes bold and headings and turns * bullets into -", () => {
    expect(plainText("## Başlık\n* **Kubbe:** kiremit kaplı [1]\n  * iç madde")).toBe("Başlık\n- Kubbe: kiremit kaplı [1]\n  - iç madde");
  });
});

describe("systemPrompt", () => {
  it("names the cities it is given, so a newly published city is not turned away", () => {
    expect(systemPrompt("tr", "2026-11-01", ["Bursa", "Hatay", "Konya"])).toContain("Bursa, Hatay ve Konya illerindeki");
    expect(systemPrompt("tr", "2026-11-01", [])).toContain("Türkiye'deki vakıf eserleri");
  });
});

describe("plan_trip tool", () => {
  async function plannedDate(hour: number, date?: string) {
    let query: Record<string, string> = {};
    const context: ToolContext = {
      api: async (_path, q) => {
        query = q as Record<string, string>;
        return { statusCode: 404, body: {} };
      },
      repository: { searchAssets: async () => [] },
      sources: new SourceRegistry(),
      lang: "tr",
      today: "2026-10-31",
      hour,
    };
    await runTool("plan_trip", JSON.stringify({ city: "bursa", duration: "1", ...(date && { date }) }), context);
    return query.date;
  }

  it("starts a trip asked for in the evening tomorrow", async () => {
    expect(await plannedDate(20)).toBe("2026-11-01");
  });

  it("leaves the planner's own default (today) during the day, and keeps a date the model gave", async () => {
    expect(await plannedDate(10)).toBeUndefined();
    expect(await plannedDate(20, "2026-11-02")).toBe("2026-11-02");
  });
});
