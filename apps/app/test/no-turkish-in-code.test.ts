import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const APP = join(__dirname, "../src");
const UI = join(__dirname, "../../../packages/ui/src");

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
  // The design system's own Turkish default, for an app that gives it no words (`UiWords`).
  /confidence: "Güven|infoKind: "Bilgi|noSource: "Kaynak|folk_belief: "|refuted_by_source: "|unverified: "/,
];

/** Words on screen that are the same in both languages: the brand, keys, other products' names. */
const SAME_IN_BOTH = new Set(["Vagabonds", "V", "CC", "Tab", "Enter", "←", "→", "Expo Go", "App Store", "Google Play", "+", "•", "“", "”"]);

/** The props that put their words on screen or in a screen reader. */
const SHOWN_PROPS = new Set(["label", "title", "accessibilityLabel", "accessibilityHint", "placeholder", "tag", "spoken", "hint", "subtitle"]);

/** The panel's phone preview names the parts of a page in Turkish, in its own component. */
const PANEL_ONLY = new Set(["Editable"]);

/** What the panel's preview says of an empty part; the app itself never shows them. */
const PANEL_SAMPLES = new Set(["Bölümün metni burada görünür.", "Henüz eklenmedi. Uygulamada bu kısım görünmez."]);

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

const uiFiles = sourceFiles(UI).map((path) => ({ path, file: `ui/${relative(UI, path).replaceAll("\\", "/")}` }));
const appFiles = sourceFiles(APP)
  .map((path) => ({ path, file: relative(APP, path).replaceAll("\\", "/") }))
  .filter(({ file }) => !LEFT_OUT.some((pattern) => pattern.test(file)));
const files = [...appFiles, ...uiFiles];

/** Words written into a screen: JSX text, a shown prop, or the fallback of `??`. */
function wordsOnScreen(source: ts.SourceFile): Array<{ line: number; text: string }> {
  const found: Array<{ line: number; text: string }> = [];
  const add = (node: ts.Node, text: string) => found.push({ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, text });
  // The words a value starts with, also when it is a template: `Sor: ${question}`.
  const literalOf = (node: ts.Node): string | null => {
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isTemplateExpression(node)) return node.head.text;
    return null;
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && node.text.trim() && !SAME_IN_BOTH.has(node.text.trim()) && !PANEL_SAMPLES.has(node.text.trim())) add(node, node.text.trim());
    if (ts.isJsxAttribute(node) && SHOWN_PROPS.has(node.name.getText())) {
      const owner = node.parent.parent.tagName.getText();
      const init = node.initializer;
      const value = init && ts.isJsxExpression(init) ? init.expression : init;
      const text = value && literalOf(value);
      if (!PANEL_ONLY.has(owner) && text && /[\p{L}]{2}/u.test(text) && !SAME_IN_BOTH.has(text)) add(node, text);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      const text = literalOf(node.right);
      if (text && /^\p{Lu}/u.test(text)) add(node, text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("the app's code", () => {
  // Turkish letters anywhere; words without them ("Tamam") are for the next check, where they can be seen.
  it("keeps words with Turkish letters in the dictionary", () => {
    const found: string[] = [];
    for (const { path, file } of files) {
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

  // By the code's shape, in any language. Words passed in other ways (an object's field, an argument) are not seen.
  it("writes no words into JSX, a shown prop or a fallback", () => {
    const found: string[] = [];
    for (const { path, file } of files) {
      if (!path.endsWith(".tsx") && !/inscription-targets/.test(file)) continue;
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
      for (const { line, text } of wordsOnScreen(source)) found.push(`${file}:${line}: ${text.slice(0, 70)}`);
    }
    expect(found).toEqual([]);
  });

  // A compiled screen caches what a helper returns by the helper's arguments, so one that reads the
  // language itself goes stale when it changes. These are called while rendering: the language comes in.
  it("passes the language to the helpers screens call while rendering", () => {
    const helpers = readdirSync(join(APP, "content"))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => `content/${name}`)
      .concat(["lib/reading.ts", "lib/home.ts", "lib/visit-seal.ts"]);
    const reading = helpers.filter((file) => /\b(getLang|getMessages)\(/.test(readFileSync(join(APP, file), "utf8")));
    expect(reading).toEqual([]);
  });
});
