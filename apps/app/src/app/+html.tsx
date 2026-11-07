import { palette } from "@vagabonds/ui";
import { ScrollViewStyleReset, useServerDocumentContext } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * HTML shell for the static web build. Runs only in Node during rendering,
 * never in the browser or on native.
 *
 * - `lang="tr"` makes screen readers pronounce the content as Turkish.
 * - The viewport must allow zooming (WCAG 1.4.4), so no `user-scalable=no`.
 * - The background is set before React loads, in the light theme the app opens with.
 * - Since SDK 58 the app's scripts, styles and favicon come through `useServerDocumentContext`;
 *   without `headNodes` and `bodyNodes` the page renders but never loads its JavaScript.
 */
export default function Root({ children }: PropsWithChildren) {
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } = useServerDocumentContext();
  return (
    <html {...htmlAttributes} lang="tr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: background }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}

const background = `body { background-color: ${palette.gece50}; }`;
