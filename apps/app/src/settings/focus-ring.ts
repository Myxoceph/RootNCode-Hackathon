/**
 * The focus ring on the web, for every control at once (Pressables, links, the landing page's
 * buttons), not only the design system's Button. With "Belirgin odak halkası" it is thicker and
 * set off from the control; without it, thin but still there (WCAG 2.4.7). Fields keep their own
 * look: they show focus with their gold edge.
 */
export function focusRingCss(color: string, strong: boolean): string {
  const width = strong ? 3 : 2;
  const offset = strong ? 3 : 1;
  const important = strong ? " !important" : "";
  return [
    `:focus-visible:not(input):not(textarea) {`,
    `  outline-style: solid${important};`,
    `  outline-color: ${color}${important};`,
    `  outline-width: ${width}px${important};`,
    `  outline-offset: ${offset}px${important};`,
    `}`,
  ].join("\n");
}

const STYLE_ID = "vagabonds-focus-ring";

/** Puts the rule in the page, or replaces it; nothing off the web. */
export function applyFocusRing(color: string, strong: boolean): void {
  if (typeof document === "undefined") return;
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = focusRingCss(color, strong);
}
