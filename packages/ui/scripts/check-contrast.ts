/**
 * Checks every pair in `contrastPairs` against the WCAG 2.1 AA minimums and
 * keeps CONTRAST.md (the documented ratios) in sync with the tokens.
 *
 * Usage:
 *   npm run ui:contrast                                   # fails on a low ratio or a stale CONTRAST.md
 *   npm run contrast:docs --workspace @vagabonds/ui       # rewrites CONTRAST.md after changing colors
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// Not "../src/index": that also exports the React Native components, which do not load in Node.
import { contrastRatio } from "../src/contrast";
import { themeContrastPairs } from "../src/themes";
import { MIN_CONTRAST, palette } from "../src/tokens/colors";

const DOC_PATH = fileURLToPath(new URL("../CONTRAST.md", import.meta.url));

const rows = themeContrastPairs().map((pair) => {
  const ratio = contrastRatio(palette[pair.foreground], palette[pair.background]);
  const min = MIN_CONTRAST[pair.kind];
  return { ...pair, ratio, min, ok: ratio >= min };
});

function renderDoc(): string {
  const lines = [
    "# Kontrast tablosu",
    "",
    "> Bu dosya `npm run contrast:docs --workspace @vagabonds/ui` ile üretilir; elle düzenleme.",
    "> Kaynak: [`src/tokens/colors.ts`](src/tokens/colors.ts). CI, oranlar ve bu tablo uyuşmazsa hata verir.",
    "",
    `Eşikler (WCAG 2.1 AA): metin **${MIN_CONTRAST.text}:1** (1.4.3), ikon / odak halkası **${MIN_CONTRAST.nonText}:1** (1.4.11).`,
    "",
    "| Ön plan | Arka plan | Oran | Eşik | Kullanım |",
    "|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| \`${r.foreground}\` ${palette[r.foreground]} | \`${r.background}\` ${palette[r.background]} | ` +
        `**${r.ratio.toFixed(2)}:1** ${r.ok ? "✅" : "❌"} | ${r.min}:1 | ${r.usage} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

const failures = rows.filter((r) => !r.ok);
for (const r of failures) {
  console.error(`✗ ${r.foreground} on ${r.background}: ${r.ratio.toFixed(2)}:1 < ${r.min}:1 (${r.usage})`);
}

const doc = renderDoc();
if (process.argv.includes("--write")) {
  writeFileSync(DOC_PATH, doc);
  console.log(`wrote ${DOC_PATH}`);
} else {
  let current = "";
  try {
    current = readFileSync(DOC_PATH, "utf8");
  } catch {}
  if (current !== doc) {
    console.error("✗ CONTRAST.md is out of date: run npm run contrast:docs --workspace @vagabonds/ui");
    process.exitCode = 1;
  }
}

if (failures.length > 0) process.exitCode = 1;
else {
  const lowest = rows.reduce((a, b) => (a.ratio / a.min < b.ratio / b.min ? a : b));
  console.log(
    `✓ ${rows.length} pairs meet WCAG 2.1 AA (closest: ${lowest.foreground} on ${lowest.background}, ${lowest.ratio.toFixed(2)}:1)`,
  );
}
