import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../src");

/** Turkish on purpose, or never shown in the app: the panel stays Turkish, the words live in the dictionary. */
const LEFT_OUT = [
  /^app\/admin\//,
  /^components\/admin\//,
  /^vendor\//,
  /^i18n\/messages\.ts$/,
  /^data\/admin\.ts$/,
  /^data\/fixtures\//,
  /^data\/mock-source\.ts$/,
  // Sample content with its English beside it.
  /^content\//,
  // A developer's test page.
  /^app\/map-prototype\.tsx$/,
];

/** Lines that hold Turkish without showing it to anyone. */
const NOT_SHOWN = [
  // What the panel's phone preview calls a part of the page, or says of an empty one.
  /<Editable\b/,
  /^\s*label="[^"]*"\s*$/,
  /`Sayı: |: düzenle`|\["[a-z]+", "[^"]+"\],$|Bölümün metni burada|Henüz eklenmedi/,
  // Reading Turkish letters and text, not writing them.
  /[çğıöşü]\]|\[ÇĞİ|A-ZÇĞİ|"aeıioöuü"|"aıou"|"çfhkpsşt"|ç: "c"|M\\\.Ö/,
  // The words a question is sorted by, in both languages.
  /\.test\(q\)/,
  // Each language's name in its own language.
  /Türkçe seçildi/,
  // The Turkish side of a choice by language.
  /`\$\{roman\}\. yüzyıl`|tr: \["Ocak"/,
  // A developer's details; sample data's own check.
  /beklenen biçimde|\(kök\)/,
  // Not read: the settings name these by the dictionary.
  /value: "light", label:|patron: "|style: "|revenue: "/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The code without its comments, which are free to name screens in Turkish. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ""))
    .split("\n")
    .map((line) => line.replace(/(^|\s)\/\/.*$/, "$1"))
    .join("\n");
}

describe("the app's code", () => {
  it("keeps its Turkish words in the dictionary", () => {
    const found: string[] = [];
    for (const path of sourceFiles(ROOT)) {
      const file = relative(ROOT, path).replaceAll("\\", "/");
      if (LEFT_OUT.some((pattern) => pattern.test(file))) continue;
      withoutComments(readFileSync(path, "utf8"))
        .split("\n")
        .forEach((line, index) => {
          if (/[çğıöşüÇĞİÖŞÜ]/.test(line) && !NOT_SHOWN.some((pattern) => pattern.test(line))) {
            found.push(`${file}:${index + 1}: ${line.trim().slice(0, 100)}`);
          }
        });
    }
    expect(found).toEqual([]);
  });
});
