/**
 * Compiles images into one MindAR `.mind` file. MindAR's compiler runs in a browser,
 * so this starts headless Chrome (CHROME_PATH, default: the macOS install) and runs
 * the MindAR bundled into the app (src/vendor) there; no network needed.
 *
 * Used by scripts/compile-ar-targets.mts (the app's test targets) and
 * data/tools/compile_ar_targets.mts (the dataset's targets).
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { mindarScript } from "../src/vendor/mindar.generated";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9339;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function pageSocketUrl(): Promise<string> {
  for (let i = 0; i < 40; i++) {
    try {
      const tabs = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
      const page = tabs.find((tab) => tab.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome is still starting.
    }
    await sleep(250);
  }
  throw new Error(`Chrome did not open a debugging port (${CHROME})`);
}

/** Runs `expression` in the page and returns its (awaited) string result. */
async function evaluate(socketUrl: string, expression: string): Promise<string> {
  const socket = new WebSocket(socketUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  const reply = await new Promise<{ result: { result?: { value: string }; exceptionDetails?: unknown } }>((resolve) => {
    socket.onmessage = (message) => resolve(JSON.parse(String(message.data)));
    socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, timeout: 600_000 } }));
  });
  socket.close();
  if (reply.result.exceptionDetails) throw new Error(JSON.stringify(reply.result.exceptionDetails).slice(0, 1000));
  return reply.result.result!.value;
}

/** `images` as data URLs; the order is the target index in the `.mind` file. */
export async function compileMindTargets(images: string[]): Promise<Buffer> {
  const profile = mkdtempSync(join(tmpdir(), "ar-targets-"));
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], {
    stdio: "ignore",
  });
  try {
    const socket = await pageSocketUrl();
    await evaluate(socket, `${mindarScript}; "loaded"`);
    const mind = await evaluate(
      socket,
      `(async () => {
        const load = (src) => new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = src;
        });
        const compiler = new window.MINDAR.IMAGE.Compiler();
        await compiler.compileImageTargets(await Promise.all(${JSON.stringify(images)}.map(load)), () => {});
        const bytes = new Uint8Array(await compiler.exportData());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(binary);
      })()`,
    );
    return Buffer.from(mind, "base64");
  } finally {
    // Chrome writes to its profile until it has exited.
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill();
    await exited;
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
