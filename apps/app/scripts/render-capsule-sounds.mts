/**
 * Renders the sound capsules' stand-in recordings (Y17):
 *
 *   npm run audio:stand-ins --workspace @vagabonds/app
 *
 * Phones have no Web Audio, so until the CC0 recordings arrive (H9) they play these files:
 * the web's synthesized ambiences (src/audio/synth.web.ts), rendered offline in headless
 * Chrome (./headless-chrome.mts) and encoded to AAC with ffmpeg. Writes
 * src/audio/stand-ins/<capsule>.m4a. The noise is random, so each run differs slightly.
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { CAPSULE_SECONDS, capsuleTypes } from "../src/content/capsules";
import { withHeadlessChrome } from "./headless-chrome.mts";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const OUT = join(SRC, "audio/stand-ins");
const SAMPLE_RATE = 44_100;

// The synth as a script that defines `Synth` (esbuild comes with tsx).
const { outputFiles } = await build({
  entryPoints: [join(SRC, "audio/synth.web.ts")],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "Synth",
  alias: { "@": SRC.replace(/\/$/, "") },
});
const synthScript = outputFiles[0]!.text;

/**
 * The synth asks for `window.AudioContext`; hand it an offline one, render, and return the
 * result as 16-bit mono WAV, base64. Each capsule runs a fresh copy of the script, because
 * the synth keeps one engine per page.
 */
const renderExpression = (type: string) => `(async () => {
  const seconds = ${CAPSULE_SECONDS + 0.5};
  let context;
  window.AudioContext = function () {
    context = new OfflineAudioContext(1, Math.ceil(seconds * ${SAMPLE_RATE}), ${SAMPLE_RATE});
    context.resume = () => Promise.resolve();
    return context;
  };
  const Synth = (() => { ${synthScript}; return Synth; })();
  if (!Synth.startSynth(${JSON.stringify(type)})) throw new Error("synth did not start");
  const samples = (await context.startRendering()).getChannelData(0);

  const bytes = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at, s) => [...s].forEach((c, i) => bytes.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF"); bytes.setUint32(4, 36 + samples.length * 2, true); text(8, "WAVEfmt ");
  bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 1, true);
  bytes.setUint32(24, ${SAMPLE_RATE}, true); bytes.setUint32(28, ${SAMPLE_RATE * 2}, true);
  bytes.setUint16(32, 2, true); bytes.setUint16(34, 16, true); text(36, "data"); bytes.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => bytes.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));

  const u8 = new Uint8Array(bytes.buffer);
  let binary = "";
  for (let i = 0; i < u8.length; i += 0x8000) binary += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(binary);
})()`;

mkdirSync(OUT, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "capsule-sounds-"));
try {
  await withHeadlessChrome(async (evaluate) => {
    for (const type of capsuleTypes) {
      const wav = join(scratch, `${type}.wav`);
      writeFileSync(wav, Buffer.from(await evaluate(renderExpression(type)), "base64"));
      const m4a = join(OUT, `${type}.m4a`);
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-c:a", "aac", "-b:a", "64k", "-ac", "1", m4a]);
      console.log(`✔ ${type} → ${m4a} (${Math.round(statSync(m4a).size / 1024)} KB)`);
    }
  });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
