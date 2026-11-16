#!/usr/bin/env node
/**
 * Regenerate `src/web/demoHtml.ts` from the canonical `src/web/demo.html`.
 *
 * Metro 0.72 cannot import an `.html` file as a module, so the page source is
 * mirrored into a TypeScript string that the WebView receives through
 * `source={{html}}`. This script keeps the mirror in sync; the Jest test
 * `__tests__/demoHtml.test.ts` is the guard that fails when they drift.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const prettier = require('prettier');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'src', 'web', 'demo.html');
const outPath = path.join(root, 'src', 'web', 'demoHtml.ts');

const html = fs.readFileSync(htmlPath, 'utf8');
const out = `/**
 * The local H5 page as a string, for the WebView's \`source={{html}}\` prop.
 *
 * Metro 0.72 has no HTML module loader, so the canonical file stays at
 * \`src/web/demo.html\` and this module carries the same text into the JS
 * bundle. \`__tests__/demoHtml.test.ts\` fails if the two drift apart; edit
 * the HTML file, then regenerate this file with:
 *
 *   npm run build:demo-html
 *
 * \`source={{html}}\` keeps the page offline and works on all three platforms
 * (a \`file://\` path would be platform-specific).
 */
export const DEMO_HTML = ${JSON.stringify(html)};

/**
 * The same document with the H5 counter seeded from RN. Used when the page is
 * restored after a blocked navigation, so the visible count keeps increasing
 * instead of restarting at zero.
 */
export function demoHtmlWithInitialCount(count: number): string {
  const marker = 'window.__H5_INITIAL_COUNT__ = 0;';
  if (!DEMO_HTML.includes(marker)) {
    throw new Error('demo.html is missing the __H5_INITIAL_COUNT__ marker');
  }
  return DEMO_HTML.replace(marker, \`window.__H5_INITIAL_COUNT__ = \${count};\`);
}
`;

const options = {
  ...require(path.join(root, '.prettierrc.js')),
  parser: 'typescript',
};
fs.writeFileSync(outPath, prettier.format(out, options));
process.stdout.write(
  `wrote ${path.relative(root, outPath)} (${html.length} chars)\n`,
);
