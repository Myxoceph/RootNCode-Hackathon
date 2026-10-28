/**
 * Compiles images into one MindAR `.mind` file. MindAR's compiler runs in a browser,
 * so this runs the MindAR bundled into the app (src/vendor) in headless Chrome
 * (./headless-chrome.mts); no network needed.
 *
 * Used by scripts/compile-ar-targets.mts (the app's test targets) and
 * data/tools/compile_ar_targets.mts (the dataset's targets).
 */
import { mindarScript } from "../src/vendor/mindar.generated";
import { withHeadlessChrome } from "./headless-chrome.mts";

/** `images` as data URLs; the order is the target index in the `.mind` file. */
export async function compileMindTargets(images: string[]): Promise<Buffer> {
  return withHeadlessChrome(async (evaluate) => {
    await evaluate(`${mindarScript}; "loaded"`);
    const mind = await evaluate(
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
  });
}
