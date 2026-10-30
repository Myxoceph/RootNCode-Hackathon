import { describe, expect, it } from "vitest";
import { createChatModel, oneSystemMessage } from "../src/modules/assistant/assistant.model.ts";
import { searchTerms } from "../src/modules/assistant/assistant.repository.ts";
import { plainText, resolveCitations } from "../src/modules/assistant/assistant.ts";
import { SourceRegistry } from "../src/modules/assistant/assistant.tools.ts";

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
