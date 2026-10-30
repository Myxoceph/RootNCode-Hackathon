import { palette } from "@vagabonds/ui";
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * HTML shell for the static web build. Runs only in Node during rendering,
 * never in the browser or on native.
 *
 * - `lang="tr"` makes screen readers pronounce the content as Turkish.
 * - The viewport must allow zooming (WCAG 1.4.4), so no `user-scalable=no`.
 * - The background is set before React loads, in the light theme the app opens with.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="tr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: background }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const background = `body { background-color: ${palette.gece50}; }`;
