import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const configuredTokensDirectory = process.env.WE_MEET_DESIGN_TOKENS_DIR;
const tokensDirectory = configuredTokensDirectory
  ? path.resolve(configuredTokensDirectory)
  : path.resolve(
      scriptDirectory,
      '../../../../../../we-meet/src/design-tokens',
    );

const cssPath = path.resolve(
  scriptDirectory,
  '../src/cunningham/cunningham-style.css',
);

let tokensAvailable = true;

try {
  await access(tokensDirectory);
} catch {
  if (configuredTokensDirectory) {
    throw new Error(
      `WE_MEET_DESIGN_TOKENS_DIR does not exist: ${tokensDirectory}`,
    );
  }

  console.warn(
    'Skipping WeMeet token alignment check: sibling we-meet repository not found.',
  );
  tokensAvailable = false;
}

if (tokensAvailable) {
  const readJson = async (filename) =>
    JSON.parse(await readFile(path.join(tokensDirectory, filename), 'utf8'));

  const [shapeTokens, componentTokens, elevationTokens, css] =
    await Promise.all([
      readJson('shape.tokens.json'),
      readJson('component.tokens.json'),
      readJson('elevation.tokens.json'),
      readFile(cssPath, 'utf8'),
    ]);

  const getByPath = (object, tokenPath) =>
    tokenPath.split('.').reduce((value, key) => value?.[key], object);

  const resolveValue = (document, token) => {
    const value = token?.$value ?? token;
    const alias = typeof value === 'string' && /^\{(.+)\}$/.exec(value);
    return alias
      ? resolveValue(document, getByPath(document, alias[1]))
      : value;
  };

  const dimensionToCss = (dimension) =>
    dimension.value === 0 ? '0' : `${dimension.value}${dimension.unit}`;

  const colorToCss = (color) => {
    const [red, green, blue] = color.components.map((component) =>
      Math.round(component * 255),
    );
    const alphaPercent = Number((color.alpha * 100).toFixed(4));
    return `rgb(${red} ${green} ${blue} / ${alphaPercent}%)`;
  };

  const shadowParts = (document, shadow) => {
    const value = resolveValue(document, shadow);
    const entries = Array.isArray(value) ? value : [value];

    return entries.flatMap((entry) => {
      if (typeof entry === 'string') {
        return shadowParts(document, entry);
      }

      const resolvedEntry = resolveValue(document, entry);
      if (Array.isArray(resolvedEntry)) {
        return resolvedEntry.flatMap((item) => shadowParts(document, item));
      }

      return [resolvedEntry];
    });
  };

  const shadowToCss = (document, shadow) =>
    shadowParts(document, shadow)
      .map((part) => {
        const values = [
          part.inset ? 'inset' : null,
          dimensionToCss(part.offsetX),
          dimensionToCss(part.offsetY),
          dimensionToCss(part.blur),
          part.spread.value === 0 ? null : dimensionToCss(part.spread),
          colorToCss(part.color),
        ];
        return values.filter(Boolean).join(' ');
      })
      .join(', ');

  const cssValues = (property) =>
    [...css.matchAll(new RegExp(`--${property}:\\s*([^;]+);`, 'g'))].map(
      (match) => match[1].replace(/\s+/g, ' ').trim(),
    );

  const expected = [
    [
      'wm-radius-field',
      dimensionToCss(resolveValue(shapeTokens, shapeTokens.shape.field)),
    ],
    [
      'wm-radius-control',
      dimensionToCss(resolveValue(shapeTokens, shapeTokens.shape.control)),
    ],
    [
      'wm-radius-card',
      dimensionToCss(resolveValue(shapeTokens, shapeTokens.shape.card)),
    ],
    [
      'wm-radius-panel',
      dimensionToCss(resolveValue(shapeTokens, shapeTokens.shape.panel)),
    ],
    [
      'wm-radius-modal',
      dimensionToCss(resolveValue(shapeTokens, shapeTokens.shape.modal)),
    ],
    [
      'wm-control-height-compact',
      dimensionToCss(
        resolveValue(
          componentTokens,
          componentTokens.component.controlHeight.compact,
        ),
      ),
    ],
    [
      'wm-control-height-default',
      dimensionToCss(
        resolveValue(
          componentTokens,
          componentTokens.component.controlHeight.default,
        ),
      ),
    ],
    [
      'wm-control-height-large',
      dimensionToCss(
        resolveValue(
          componentTokens,
          componentTokens.component.controlHeight.large,
        ),
      ),
    ],
    [
      'wm-interaction-target-min',
      dimensionToCss(
        resolveValue(
          componentTokens,
          componentTokens.component.interactionTarget.minimum,
        ),
      ),
    ],
    [
      'wm-shadow-raised',
      shadowToCss(elevationTokens, elevationTokens.shadow.light.raised),
      shadowToCss(elevationTokens, elevationTokens.shadow.dark.raised),
    ],
    [
      'wm-shadow-overlay',
      shadowToCss(elevationTokens, elevationTokens.shadow.light.overlay),
      shadowToCss(elevationTokens, elevationTokens.shadow.dark.overlay),
    ],
    [
      'wm-shadow-modal',
      shadowToCss(elevationTokens, elevationTokens.shadow.light.modal),
      shadowToCss(elevationTokens, elevationTokens.shadow.dark.modal),
    ],
  ];

  const mismatches = expected.flatMap(([property, ...expectedValues]) => {
    const actualValues = cssValues(property);
    return expectedValues.flatMap((expectedValue, index) =>
      actualValues[index] === expectedValue
        ? []
        : [
            `--${property} (${index === 0 ? 'light/default' : 'dark'}): expected "${expectedValue}", received "${actualValues[index] ?? 'missing'}"`,
          ],
    );
  });

  if (mismatches.length > 0) {
    throw new Error(
      `Docs WeMeet tokens are out of sync:\n- ${mismatches.join('\n- ')}`,
    );
  }

  console.log('✔ Docs geometry and elevation tokens match WeMeet');
}
