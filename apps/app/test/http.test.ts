import { afterEach, describe, expect, it, vi } from "vitest";

import { DataError, type SchemaParser } from "../src/data/errors";
import { request, statusError } from "../src/data/http";

/** Accepts `{ ok: boolean }`, like a contract schema would. */
const schema: SchemaParser<{ ok: boolean }> = {
  safeParse: (data) =>
    typeof (data as { ok?: unknown })?.ok === "boolean"
      ? { success: true, data: data as { ok: boolean } }
      : { success: false, error: { issues: [{ path: ["ok"], message: "Required" }] } },
};

const URL = "http://api.test/assets/x";

function respond(body: unknown, status = 200) {
  const fetch = vi.fn(async () =>
    typeof body === "string" ? new Response(body, { status }) : Response.json(body, { status }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function failure(promise: Promise<unknown>): Promise<DataError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DataError);
  return error as DataError;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("request", () => {
  it("returns the validated body", async () => {
    respond({ ok: true });
    await expect(request(URL, schema)).resolves.toEqual({ ok: true });
  });

  it("sends a GET without a body, a JSON POST with one, and the token as a bearer", async () => {
    const fetch = respond({ ok: true });
    await request(URL, schema);
    await request(URL, schema, { body: { a: 1 }, token: "vgb_secret" });

    const [, get] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const [, post] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(get.method).toBe("GET");
    expect(get.body).toBeUndefined();
    expect(post.method).toBe("POST");
    expect(post.body).toBe('{"a":1}');
    expect(post.headers).toMatchObject({ "Content-Type": "application/json", Authorization: "Bearer vgb_secret" });
  });

  it("calls a failed fetch unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Network request failed"))));
    const error = await failure(request(URL, schema));
    expect(error.kind).toBe("unavailable");
    expect(error.message).toMatch(/İnternet bağlantını/);
  });

  it("gives up after 10 seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
      ),
    );
    const pending = failure(request(URL, schema));
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending).kind).toBe("unavailable");
  });

  it("takes a body that is not JSON for a Wi-Fi login page, not for broken data", async () => {
    respond("<html>Otel Wi-Fi'ına hoş geldiniz</html>");
    const error = await failure(request(URL, schema));
    expect(error.kind).toBe("unavailable");
    expect(error.message).toMatch(/Wi-Fi giriş sayfası/);
  });

  it("reports data that breaks the contract as invalid, with the field", async () => {
    respond({ ok: "yes" });
    const error = await failure(request(URL, schema));
    expect(error.kind).toBe("invalid");
    expect(error.details).toEqual(["ok: Required"]);
  });

  it("resolves to null for a missing asset only when asked to", async () => {
    respond({ error: { code: "ASSET_NOT_FOUND" } }, 404);
    await expect(request(URL, schema, { allowNotFound: true })).resolves.toBeNull();
    expect((await failure(request(URL, schema))).kind).toBe("unavailable");
  });

  it("does not take another 404 for a missing asset", async () => {
    respond({ error: { code: "ROUTE_NOT_FOUND" } }, 404);
    await failure(request(URL, schema, { allowNotFound: true }));
  });

  it("hands status and code to errorFor", async () => {
    respond({ error: { code: "CONTRIBUTION_LIMIT" } }, 429);
    const errorFor = vi.fn(() => new DataError("rejected", "Sınır"));
    const error = await failure(request(URL, schema, { errorFor }));
    expect(error.message).toBe("Sınır");
    expect(errorFor).toHaveBeenCalledWith(429, "CONTRIBUTION_LIMIT", ["429 CONTRIBUTION_LIMIT http://api.test/assets/x"]);
  });
});

describe("statusError", () => {
  it("names rate limits and server errors", () => {
    expect(statusError(429, null, []).message).toMatch(/Çok fazla istek/);
    expect(statusError(503, null, []).message).toMatch(/Sunucuda bir sorun/);
    expect(statusError(400, null, []).message).toBe("İstek tamamlanamadı.");
  });
});
