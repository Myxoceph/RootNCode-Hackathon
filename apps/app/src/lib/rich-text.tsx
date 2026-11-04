import { fontFamily, spacing, Text, useTheme, useUi } from "@vagabonds/ui";
import { Fragment, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

/**
 * A small formatted text, written the way the panel's toolbar writes it:
 *
 *     ## Alt başlık
 *     Bir paragraf, içinde **kalın** ve _eğik_ yazı.
 *     - liste öğesi
 *     > alıntı
 *
 * Paragraphs are split by an empty line; lines of a list or a quote run together.
 */

export type RichBlock = { kind: "heading" | "paragraph" | "quote"; text: string } | { kind: "list"; items: string[] };

export function parseRich(source: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    const last = blocks[blocks.length - 1];
    if (line === "") flush();
    else if (line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "heading", text: line.slice(3).trim() });
    } else if (/^[-•] /.test(line)) {
      flush();
      if (last?.kind === "list") last.items.push(line.slice(2).trim());
      else blocks.push({ kind: "list", items: [line.slice(2).trim()] });
    } else if (line.startsWith("> ")) {
      flush();
      if (last?.kind === "quote") last.text += ` ${line.slice(2).trim()}`;
      else blocks.push({ kind: "quote", text: line.slice(2).trim() });
    } else paragraph.push(line);
  }
  flush();
  return blocks;
}

/** `**kalın**` and `_eğik_` within a line, as pieces of text. */
export function inlinePieces(text: string): Array<{ text: string; bold?: boolean; italic?: boolean }> {
  const pieces: Array<{ text: string; bold?: boolean; italic?: boolean }> = [];
  const pattern = /\*\*(.+?)\*\*|_(.+?)_/g;
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > at) pieces.push({ text: text.slice(at, match.index) });
    pieces.push(match[1] !== undefined ? { text: match[1], bold: true } : { text: match[2]!, italic: true });
    at = match.index + match[0].length;
  }
  if (at < text.length) pieces.push({ text: text.slice(at) });
  return pieces;
}

function Inline({ text, style }: { text: string; style: object }) {
  return (
    <>
      {inlinePieces(text).map((piece, index) => (
        <Text key={index} style={[style, piece.bold && styles.bold, piece.italic && styles.italic]}>
          {piece.text}
        </Text>
      ))}
    </>
  );
}

/** The formatted text, set like the dossier's other long texts. */
export function RichText({ source }: { source: string }) {
  const { colors: c } = useTheme();
  const { textScale } = useUi();
  const body = { fontSize: 17 * textScale, lineHeight: 28 * textScale };
  const blocks = parseRich(source);
  const render = (block: RichBlock, index: number): ReactNode => {
    switch (block.kind) {
      case "heading":
        return (
          <Text key={index} headingLevel={3} style={[styles.heading, { fontSize: 21 * textScale, lineHeight: 28 * textScale }]}>
            {block.text}
          </Text>
        );
      case "list":
        return (
          <View key={index} style={styles.list}>
            {block.items.map((item, i) => (
              <View key={i} style={styles.item}>
                <Text style={body} aria-hidden>
                  •
                </Text>
                <Text style={[body, { flex: 1 }]}>
                  <Inline text={item} style={body} />
                </Text>
              </View>
            ))}
          </View>
        );
      case "quote":
        return (
          <View key={index} style={[styles.quote, { borderLeftColor: c.highlightMark }]}>
            <Text style={[body, styles.italic]}>
              <Inline text={block.text} style={[body, styles.italic]} />
            </Text>
          </View>
        );
      default:
        return (
          <Text key={index} style={body}>
            <Inline text={block.text} style={body} />
          </Text>
        );
    }
  };
  return <View style={styles.rich}>{blocks.map((block, index) => <Fragment key={index}>{render(block, index)}</Fragment>)}</View>;
}

const styles = StyleSheet.create({
  rich: { gap: spacing.md },
  heading: { marginTop: spacing.sm },
  list: { gap: spacing.xs },
  item: { flexDirection: "row", gap: spacing.sm },
  quote: { borderLeftWidth: 3, paddingLeft: spacing.md },
  bold: { fontFamily: fontFamily.sansBold },
  italic: { fontStyle: "italic" },
});
