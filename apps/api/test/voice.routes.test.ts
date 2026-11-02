/**
 * Sesli Rehber: `POST /voice/transcribe` and `POST /voice/speech` against real PostgreSQL
 * (accounts) and a stand-in for the provider, so nothing reaches the network.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { ChatRequestSchema, VOICE_MAX_BYTES, VoiceTranscriptionResponseSchema } from "@vagabonds/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";
import type { ChatMessage, ChatModel } from "../src/modules/assistant/assistant.model.ts";
import { SPOKEN_RULE } from "../src/modules/assistant/assistant.ts";
import { hashToken, newToken } from "../src/modules/community/auth.ts";
import { createVoiceClient, VoiceError, type VoiceClient } from "../src/modules/voice/voice.client.ts";
import { numberWords, ordinalWords } from "../src/modules/voice/spoken-numbers.ts";
import { hedged, speechText } from "../src/modules/voice/voice.routes.ts";

const DATABASE_URL = process.env["DATABASE_URL"];
const AUDIO = Buffer.from("fake-m4a-bytes");

describe("speechText", () => {
  it("drops markers and list dashes, ends items as sentences and says the record's H. and M. dates", () => {
    expect(speechText("Yıldırım Bayezid yaptırdı [1].\n- Ali Neccâr [1]\n- Hacı İvaz Paşa\n**H. 802 / M. 1399** [1][2]")).toBe(
      "Yıldırım Bayezid yaptırdı. Ali Neccâr. Hacı İvaz Paşa. Hicri sekiz yüz iki, Miladi bin üç yüz doksan dokuz",
    );
    expect(speechText("1. Ulucami\n2. Yeşil Camii.")).toBe("Ulucami. Yeşil Camii.");
    expect(speechText("[1]")).toBe("");
  });

  it("says numbers in words, which the speech model reads right and digits it does not", () => {
    expect(speechText("Cami 1430'da yapıldı. 15. yüzyıl eseridir [1].")).toBe("Cami bin dört yüz otuzda yapıldı. on beşinci yüzyıl eseridir.");
    expect(speechText("Hz. Ali, M.S. 1200, 1.250 kişi, %20, 3,5 km.")).toBe(
      "Hazreti Ali, milattan sonra bin iki yüz, bin iki yüz elli kişi, yüzde yirmi, üç virgül beş kilometre",
    );
    expect(speechText("I. Mehmed ve II. Murad'ın veziri, XV. yüzyılda; XIX yüzyıl. IV. Murad (1623-1640).")).toBe(
      "birinci Mehmed ve ikinci Murad'ın veziri, on beşinci yüzyılda; on dokuzuncu yüzyıl. dördüncü Murad (bin altı yüz yirmi üç ile bin altı yüz kırk).",
    );
    expect(speechText("Cami Hamza Bey'indir.\n15. yüzyılda yapıldı.")).toBe("Cami Hamza Bey'indir. on beşinci yüzyılda yapıldı.");
    expect(speechText("15. yüzyılda yapıldı.")).toBe("on beşinci yüzyılda yapıldı.");
    expect(speechText("Numara 1234567890123456789012 ve 99999999999999.")).toBe(
      "Numara bir iki üç dört beş altı yedi sekiz dokuz sıfır bir iki üç dört beş altı yedi sekiz dokuz sıfır bir iki ve dokuz dokuz dokuz dokuz dokuz dokuz dokuz dokuz dokuz dokuz dokuz dokuz dokuz dokuz.",
    );
    expect(speechText("Built in 1430, 15. century.", "en")).toBe("Built in 1430, 15. century.");
    expect(speechText("Kubbe ve Minare. Dolayısıyla LCD. İzmir Fâtihi.")).toBe("Kubbe ve Minare. Dolayısıyla LCD. İzmir Fâtihi.");
    expect(speechText("09:30 ile 17.00 arası, 1430-1435 yılları.")).toBe("dokuz otuz ile on yedi arası, bin dört yüz otuz ile bin dört yüz otuz beş yılları.");
  });
});

describe("numberWords and ordinalWords", () => {
  it("reads Turkish numbers, with the vowel harmony of ordinals", () => {
    expect([Number.NaN, 1e21, -3].map(numberWords)).toEqual(["NaN", "1e+21", "-3"]);
    expect([0, 7, 100, 101, 1000, 1999, 2026, 1_000_000, 2_500_000].map(numberWords)).toEqual([
      "sıfır", "yedi", "yüz", "yüz bir", "bin", "bin dokuz yüz doksan dokuz", "iki bin yirmi altı", "bir milyon", "iki milyon beş yüz bin",
    ]);
    expect([1, 2, 3, 4, 6, 9, 10, 20, 40, 60, 100, 1000, 14].map(ordinalWords)).toEqual([
      "birinci", "ikinci", "üçüncü", "dördüncü", "altıncı", "dokuzuncu", "onuncu", "yirminci", "kırkıncı", "altmışıncı", "yüzüncü", "bininci", "on dördüncü",
    ]);
  });
});

/** A provider that records its calls; `fail` makes every call throw as an outage would. */
function fakeVoice({ fail = false } = {}) {
  const calls = { transcribe: [] as Array<{ contentType: string; lang: string; bytes: number }>, speak: [] as string[] };
  const client: VoiceClient = {
    async transcribe(audio, contentType, lang) {
      if (fail) throw new VoiceError("Voice provider returned HTTP 503");
      calls.transcribe.push({ contentType, lang, bytes: audio.length });
      return "Bu camiyi kim yaptırdı?";
    },
    async speak(text) {
      if (fail) throw new VoiceError("Voice provider returned HTTP 503");
      calls.speak.push(text);
      return Buffer.from(`mp3:${text}`);
    },
  };
  return { client, calls };
}

describe.skipIf(!DATABASE_URL)("voice routes (PostgreSQL, stand-in provider)", () => {
  let prisma: PrismaClient;
  const apps: Array<ReturnType<typeof buildApp>> = [];
  const userIds: string[] = [];
  const tag = randomUUID().slice(0, 8);
  let account: string;
  let anonymous: string;

  async function createUser(kind: "account" | "anonymous") {
    const token = newToken();
    const user = await prisma.app_user.create({
      data: {
        nickname: `ses-${kind}`,
        ...(kind === "account" && { username: `v${tag}${userIds.length}`, password_hash: "scrypt$test" }),
        sessions: { create: { token_hash: hashToken(token) } },
      },
    });
    userIds.push(user.id);
    return token;
  }

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL as string);
    account = await createUser("account");
    anonymous = await createUser("anonymous");
  });

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
    await prisma.app_user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  function appWith(voice: VoiceClient | null, assistantModel: ChatModel | null = null) {
    const app = buildApp({ prisma, voice, assistantModel, rateLimit: false });
    apps.push(app);
    return app;
  }

  const transcribe = (app: ReturnType<typeof buildApp>, token: string | null, contentType = "audio/mp4", body: Buffer = AUDIO) =>
    app.inject({
      method: "POST",
      url: "/voice/transcribe?lang=tr",
      headers: { "content-type": contentType, ...(token && { authorization: `Bearer ${token}` }) },
      payload: body,
    });

  it("turns a recording into the question's words, with the type's parameters dropped", async () => {
    const { client, calls } = fakeVoice();
    const app = appWith(client);
    const response = await transcribe(app, account);
    expect(response.statusCode).toBe(200);
    expect(VoiceTranscriptionResponseSchema.parse(response.json()).text).toBe("Bu camiyi kim yaptırdı?");
    expect(calls.transcribe).toEqual([{ contentType: "audio/mp4", lang: "tr", bytes: AUDIO.length }]);

    // A browser's recorder names its codec.
    expect((await transcribe(app, account, "audio/webm;codecs=opus")).statusCode).toBe(200);
    expect(calls.transcribe[1]!.contentType).toBe("audio/webm");
  });

  it("refuses other types, an empty or too large recording, and visitors without an account", async () => {
    const app = appWith(fakeVoice().client);
    expect((await transcribe(app, account, "image/png")).statusCode).toBe(415);
    expect((await transcribe(app, account, "audio/mp4", Buffer.alloc(0))).json().error.code).toBe("INVALID_AUDIO");
    expect((await transcribe(app, account, "audio/mp4", Buffer.alloc(VOICE_MAX_BYTES + 1))).statusCode).toBe(413);
    expect((await transcribe(app, null)).statusCode).toBe(401);
    expect((await transcribe(app, anonymous)).json().error.code).toBe("ACCOUNT_REQUIRED");
  });

  it("answers 503 when voice is not configured or the provider fails", async () => {
    expect((await transcribe(appWith(null), account)).json().error.code).toBe("VOICE_UNAVAILABLE");
    const failing = appWith(fakeVoice({ fail: true }).client);
    expect((await transcribe(failing, account)).json().error.code).toBe("VOICE_UNAVAILABLE");
    const speech = await failing.inject({ method: "GET", url: "/voice/speech", query: { text: "Merhaba" }, headers: { authorization: `Bearer ${account}` } });
    expect(speech.statusCode).toBe(503);
  });

  it("reads an answer aloud as MP3, as it should sound, and plays a repeated one from memory", async () => {
    const { client, calls } = fakeVoice();
    const app = appWith(client);
    const speak = () =>
      app.inject({
        method: "GET",
        url: "/voice/speech",
        query: { text: "Yıldırım Bayezid yaptırdı [1], H. 802." },
        headers: { authorization: `Bearer ${account}` },
      });
    const first = await speak();
    expect(first.statusCode).toBe(200);
    expect(first.headers["content-type"]).toBe("audio/mpeg");
    expect(first.rawPayload.toString()).toBe("mp3:Yıldırım Bayezid yaptırdı, Hicri sekiz yüz iki.");
    expect((await speak()).rawPayload.toString()).toBe(first.rawPayload.toString());
    expect(calls.speak).toHaveLength(1);

    const nothing = await app.inject({ method: "GET", url: "/voice/speech", query: { text: "[1]" }, headers: { authorization: `Bearer ${account}` } });
    expect(nothing.statusCode).toBe(400);
    const signedOut = await app.inject({ method: "GET", url: "/voice/speech", query: { text: "Merhaba" } });
    expect(signedOut.statusCode).toBe(401);
  });

  it("asks the model for a short spoken answer when the question was spoken, and keeps it apart from the written one", async () => {
    const systems: string[] = [];
    const model: ChatModel = {
      name: "stub-model",
      async complete(messages: ChatMessage[]) {
        systems.push(messages[0]!.content as string);
        return { content: `Cevap ${systems.length}`, toolCalls: [] };
      },
      ping: async () => true,
    };
    const app = appWith(null, model);
    const ask = (spoken: boolean) =>
      app.inject({
        method: "POST",
        url: "/chat",
        headers: { authorization: `Bearer ${account}` },
        payload: ChatRequestSchema.parse({ message: `Merhaba ${tag}`, spoken }),
      });
    expect((await ask(true)).json().answer).toBe("Cevap 1");
    expect(systems[0]).toContain(SPOKEN_RULE);
    // The written question is not answered from the spoken one's cache.
    expect((await ask(false)).json().answer).toBe("Cevap 2");
    expect(systems[1]).not.toContain(SPOKEN_RULE);
  });
});

describe("createVoiceClient", () => {
  it("counts a connection dropped mid-audio as the provider's failure, which is tried again", async () => {
    const dropped = new ReadableStream({ start: (controller) => controller.error(new TypeError("terminated")) });
    const fetchImpl = (async () => new Response(dropped, { status: 200 })) as unknown as typeof fetch;
    const client = createVoiceClient({ baseUrl: "http://voice.test/v1", asrModel: "a", ttsModel: "t", fetchImpl });
    await expect(client.speak("Merhaba", new AbortController().signal)).rejects.toBeInstanceOf(VoiceError);
  });
});

describe("hedged", () => {
  const wait = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new VoiceError("Voice call timed out"));
      });
    });

  it("sends a late call again and takes the first answer, cancelling the rest", async () => {
    const signals: AbortSignal[] = [];
    const text = await hedged(async (signal) => {
      signals.push(signal);
      // The first call hangs; the second answers.
      await wait(signals.length === 1 ? 10_000 : 10, signal);
      return `cevap ${signals.length}`;
    }, [0, 20, 40], 1_000);
    expect(text).toBe("cevap 2");
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("fails with the provider's error when every call failed or the deadline passed", async () => {
    let calls = 0;
    await expect(hedged(async () => { calls += 1; throw new VoiceError("HTTP 503"); }, [0, 10], 1_000)).rejects.toThrow("HTTP 503");
    expect(calls).toBe(2);
    await expect(hedged((signal) => wait(10_000, signal).then(() => "geç"), [0], 30)).rejects.toThrow("timed out");
  });

  it("never sends a bug of ours again", async () => {
    let calls = 0;
    await expect(hedged(async () => { calls += 1; throw new TypeError("oops"); }, [0, 20], 1_000)).rejects.toThrow("oops");
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(calls).toBe(1);
  });
});
