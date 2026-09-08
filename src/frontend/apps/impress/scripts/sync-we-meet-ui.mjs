import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { format } from 'prettier';

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = process.env.WE_MEET_DESIGN_TOKENS_DIR
  ? path.resolve(process.env.WE_MEET_DESIGN_TOKENS_DIR)
  : path.resolve(directory, '../../../../../../we-meet/src/design-tokens');
const snapshotPath = path.resolve(
  directory,
  '../src/cunningham/we-meet-contract.json',
);
const cssPath = path.resolve(
  directory,
  '../src/cunningham/we-meet-ui-tokens.css',
);
const write = process.argv.includes('--write');
let sourceAvailable = true;
try {
  await access(source);
} catch {
  if (write || process.env.WE_MEET_DESIGN_TOKENS_DIR) {
    throw new Error(`WeMeet design tokens not found: ${source}`);
  }
  sourceAvailable = false;
}

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const upstream = sourceAvailable
  ? Object.assign(
      {},
      ...(await Promise.all(
        ['color', 'typography', 'spacing', 'component'].map(async (name) => {
          const document = await readJson(
            path.join(source, `${name}.tokens.json`),
          );
          return Object.fromEntries(
            Object.entries(document).filter(([key]) => !key.startsWith('$')),
          );
        }),
      )),
    )
  : undefined;
const contract = write ? upstream : await readJson(snapshotPath);
if (upstream && JSON.stringify(upstream) !== JSON.stringify(contract)) {
  throw new Error(
    'WeMeet UI contract changed. Run yarn sync-we-meet-ui and review the generated changes.',
  );
}

const resolve = (token) => {
  const value = token.$value ?? token;
  const alias = typeof value === 'string' && /^\{(.+)\}$/.exec(value);
  return alias
    ? resolve(alias[1].split('.').reduce((node, key) => node[key], contract))
    : value;
};
const kebab = (value) =>
  value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const dimension = (value) => `${value.value / 16}rem`;
const declarations = [];
declarations.push(
  `--wm-font-family: ${contract.font.family.ui.$value.map((name) => (name.includes(' ') ? `"${name}"` : name)).join(', ')};`,
);
for (const [name, token] of Object.entries(contract.typography)) {
  if (name.startsWith('$')) continue;
  const value = resolve(token);
  declarations.push(
    `--wm-font-${kebab(name)}: ${value.fontWeight} ${dimension(value.fontSize)}/${value.lineHeight} var(--wm-font-family);`,
  );
  declarations.push(
    `--wm-font-size-${kebab(name)}: ${dimension(value.fontSize)};`,
  );
  declarations.push(`--wm-font-weight-${kebab(name)}: ${value.fontWeight};`);
  declarations.push(
    `--wm-tracking-${kebab(name)}: ${dimension(value.letterSpacing)};`,
  );
}
for (const [name, token] of Object.entries(contract.space)) {
  if (!name.startsWith('$'))
    declarations.push(`--wm-space-${name}: ${dimension(resolve(token))};`);
}
for (const group of ['icon', 'iconButton', 'selectionControl']) {
  for (const [name, token] of Object.entries(contract.component[group])) {
    if (!name.startsWith('$'))
      declarations.push(
        `--wm-${kebab(group)}-${name}: ${dimension(resolve(token))};`,
      );
  }
}
const colors = (node, prefix = 'wm') =>
  Object.entries(node).flatMap(([name, token]) => {
    if (name.startsWith('$')) return [];
    const property = `${prefix}-${name}`;
    return token.$value
      ? [`--${property}: ${resolve(token).hex};`]
      : colors(token, property);
  });
const css = await format(
  `/* Generated from we-meet/src/design-tokens by yarn sync-we-meet-ui. Do not edit.
 * Preserve source font names, color values and typography precision. */
/* stylelint-disable value-keyword-case, number-max-precision, color-hex-length */
:root { ${[...declarations, ...colors(contract.color.semantic.light)].join('\n')} }

.cunningham-theme--dark { ${colors(contract.color.semantic.dark).join('\n')} }
`,
  { parser: 'css', singleQuote: true },
);
if (write) {
  await writeFile(
    snapshotPath,
    await format(JSON.stringify(contract), { parser: 'json' }),
  );
  await writeFile(cssPath, css);
  console.log('✔ Synced WeMeet UI contract and CSS');
} else {
  if ((await readFile(cssPath, 'utf8')).replace(/\r\n/g, '\n') !== css) {
    throw new Error(
      'WeMeet UI CSS does not match the bundled contract. Run yarn sync-we-meet-ui.',
    );
  }
  console.log(
    `✔ WeMeet UI tokens verified (${sourceAvailable ? 'upstream and bundled contract' : 'bundled contract'})`,
  );
}
