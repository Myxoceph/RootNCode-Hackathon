/**
 * Checks the demo stack before it goes on stage (docs/deploy.md, "Final günü"). Read-only, except one
 * question to the assistant: `/chat/status` only says the model is configured, so a real answer is asked.
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

await check("assistant", async () => {
  const s = await get(`${BASE}/api/chat/status`);
  if (s.body.available !== true) return [false, "turned off (the app hides the chat)"];
  const started = Date.now();
  const { status, body } = await get(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Bursa Ulu Camii'ni kim yaptırdı?" }),
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  return [status === 200, `${status} ${s.body.model} ${seconds} s${status === 200 ? "" : ` ${body.error?.code ?? ""}`}`];
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
