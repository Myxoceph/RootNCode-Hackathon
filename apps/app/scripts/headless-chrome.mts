/**
 * Runs code in headless Chrome (CHROME_PATH, default: the macOS install) for the build
 * scripts that need a browser: MindAR's compiler (./mindar-compiler.mts) and the capsule
 * stand-in sounds (./render-capsule-sounds.mts). No network needed.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9339;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function pageSocketUrl(exited: () => boolean): Promise<string> {
  for (let i = 0; i < 40 && !exited(); i++) {
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

/** Starts Chrome on a blank page, hands `run` an evaluator for it, and closes Chrome after. */
export async function withHeadlessChrome<T>(run: (evaluate: (expression: string) => Promise<string>) => Promise<T>): Promise<T> {
  const profile = mkdtempSync(join(tmpdir(), "headless-chrome-"));
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], {
    stdio: "ignore",
  });
  // Set up before anything can fail: an early exit or a wrong CHROME_PATH must not hang the script.
  let failure: Error | null = null;
  const exited = new Promise<void>((resolve) => {
    chrome.once("exit", () => resolve());
    chrome.once("error", (error) => {
      failure = new Error(`Chrome could not start (${CHROME}, set CHROME_PATH): ${error.message}`);
      resolve();
    });
  });
  try {
    const socket = await pageSocketUrl(() => failure !== null || chrome.exitCode !== null);
    return await run((expression) => evaluate(socket, expression));
  } catch (error) {
    throw failure ?? error;
  } finally {
    // Chrome writes to its profile until it has exited.
    if (chrome.exitCode === null && failure === null) chrome.kill();
    await exited;
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
