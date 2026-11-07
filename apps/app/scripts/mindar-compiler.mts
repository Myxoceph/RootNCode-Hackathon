/**
 * Compiles images into one MindAR `.mind` file. MindAR's compiler runs in a browser,
 * so this runs the MindAR bundled into the app (src/vendor) in headless Chrome
 * (./headless-chrome.mts); no network needed.
 *
 * Used by data/tools/compile_ar_targets.mts (the dataset's targets).
 */
import { mindarScript } from "../src/vendor/mindar.generated";
import { withHeadlessChrome } from "./headless-chrome.mts";

/** `images` as data URLs; the order is the target index in the `.mind` file. */
export async function compileMindTargets(images: string[]): Promise<Buffer> {
  return withMindCompiler((compile) => compile(images));
}

/**
 * One headless Chrome for many compiles: `run` gets `compile(images)`, each call a `.mind` file of
 * its own. Starting Chrome takes longer than compiling a photo, so a batch keeps it open.
 */
export async function withMindCompiler<T>(run: (compile: (images: string[]) => Promise<Buffer>) => Promise<T>): Promise<T> {
  return withHeadlessChrome(async (evaluate) => {
    await evaluate(`${mindarScript}; "loaded"`);
    return run(async (images) => Buffer.from(await evaluate(compileExpression(images)), "base64"));
  });
}

function compileExpression(images: string[]): string {
  return `(async () => {
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
      })()`;
}
