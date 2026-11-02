/**
 * Checks the demo stack before it goes on stage (docs/deploy.md, "Final günü"). Read-only, except one
 * question to the assistant: `/chat/status` only says the model is configured, so a real answer is asked.
 * Only accounts ask, so the check signs in as its own account (PREFLIGHT_PASSWORD, from deploy/.env
 * through deploy/demo.sh), opens it on first use, and deletes its conversation afterwards: a demo
 * account's history never shows the check's question.
 *
 *   npm run demo:check                                         the stack on this machine (Caddy on 127.0.0.1:8080)
 *   npm run demo:check -- https://vagabonds.allbytech.com      through the tunnel, as a visitor sees it
 *
 * Prints one line per check and exits 1 if any check failed.
 */
import { statfsSync } from "node:fs";

const BASE = (process.argv[2] ?? "http://127.0.0.1:8080").replace(/\/+$/, "");
const TILES = process.env.TILES_URL ?? "https://tiles.allbytech.com";
/** Assets the dataset publishes today; far fewer means the seed did not import. */
const MIN_ASSETS = 500;
/** docs/deploy.md: Docker's disk file grows with every build and breaks when the disk fills. */
const MIN_FREE_GB = 10;
const TIMEOUT_MS = 30_000;
const PREFLIGHT_USERNAME = "onkontrol";

let failed = 0;
function report(ok, name, detail) {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `  ${detail}` : ""}`);
}

async function get(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body, type: res.headers.get("content-type") ?? "" };
}

async function check(name, fn) {
  try {
    const [ok, detail] = await fn();
    report(ok, name, detail);
  } catch (err) {
    report(false, name, err.name === "TimeoutError" ? "no answer in 30 s" : err.message);
  }
}

console.log(`Demo: ${BASE}\n`);

await check("API and database", async () => {
  const { status, body } = await get(`${BASE}/api/health`);
  return [status === 200 && body.db === "up", `${status} db ${body.db ?? "?"}`];
});

let cover;
await check("assets", async () => {
  const { status, body } = await get(`${BASE}/api/assets?limit=100&city=bursa`);
  cover = body.items?.find((a) => a.cover)?.cover;
  const all = await get(`${BASE}/api/assets?limit=1`);
  return [status === 200 && all.body.total >= MIN_ASSETS, `${all.status} ${all.body.total ?? 0} published`];
});

await check("photos (media Worker)", async () => {
  const url = cover?.sources?.jpg?.[0]?.url;
  if (!url) return [false, "no cover in the asset list"];
  const { status, type } = await get(url);
  return [status === 200 && type.startsWith("image/"), `${status} ${new URL(url).host}`];
});

await check("map tiles", async () => {
  const { status } = await get(`${TILES}/styles/liberty`);
  return [status === 200, `${status} ${new URL(TILES).host}`];
});

await check("web app", async () => {
  const { status, body } = await get(`${BASE}/`);
  return [status === 200 && String(body).includes("<html"), `${status}`];
});

/** The check's own account: signs in, or opens it the first time. Null without a password. */
async function preflightToken() {
  const password = process.env.PREFLIGHT_PASSWORD;
  if (!password) return null;
  const post = (path, payload) =>
    get(`${BASE}/api${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  let session = await post("/auth/login", { username: PREFLIGHT_USERNAME, password });
  if (session.status === 401) session = await post("/auth/register", { username: PREFLIGHT_USERNAME, password, nickname: "Ön kontrol" });
  if (session.status !== 200) throw new Error(`sign-in ${session.status} ${session.body.error?.code ?? ""}`);
  return session.body.token;
}

await check("assistant", async () => {
  const s = await get(`${BASE}/api/chat/status`);
  if (s.body.available !== true) return [false, "turned off (the app hides the chat)"];
  const token = await preflightToken();
  if (token === null) return [false, "no PREFLIGHT_PASSWORD in deploy/.env (docs/deploy.md)"];
  const authorization = `Bearer ${token}`;
  try {
    const started = Date.now();
    const { status, body } = await get(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization },
      body: JSON.stringify({ message: "Bursa Ulu Camii'ni kim yaptırdı?" }),
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const saved = status === 200 && body.conversationId !== null;
    const detail = status === 200 ? (saved ? "" : " not saved") : ` ${body.error?.code ?? ""}`;
    return [saved, `${status} ${s.body.model} ${seconds} s${detail}`];
  } finally {
    await get(`${BASE}/api/me/conversations`, { method: "DELETE", headers: { authorization } }).catch(() => {});
    await get(`${BASE}/api/auth/logout`, { method: "POST", headers: { authorization } }).catch(() => {});
  }
});

await check("transit (Konya pilot)", async () => {
  // Konya Garı to Karatay Medresesi; at night the API searches from the morning.
  const { status, body } = await get(`${BASE}/api/transit/plan?from=konya-gari&to=konya-selcuklu-karatay-medresesi`);
  const options = body.itineraries?.length ?? 0;
  return [status === 200 && options > 0, `${status} ${options} options${status === 200 ? "" : ` ${body.error?.code ?? ""}`}`];
});

await check("free disk", async () => {
  const fs = statfsSync("/");
  const gb = (fs.bavail * fs.bsize) / 1e9;
  return [gb >= MIN_FREE_GB, `${gb.toFixed(0)} GB`];
});

console.log(failed ? `\n${failed} check(s) failed` : "\nReady.");
process.exit(failed ? 1 : 0);
