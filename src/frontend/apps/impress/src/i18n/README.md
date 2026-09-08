# Translation resources

Each file in `locales/` contains a flat dictionary for one language. Edit that
language's JSON file to update a translation. Keep interpolation placeholders,
rich-text tags and plural suffixes intact.

`resources.ts` registers the dictionaries under i18next's `translation` namespace.
All languages are imported statically; language detection, fallback and switching
remain configured in `initI18n.ts`. English source strings remain the default for
keys without an explicit English translation.

When adding a language, add its JSON file and register it in `resources.ts`.

From `src/frontend`, `yarn i18n:deploy` converts Crowdin files from
`packages/i18n/locales/impress/<language>/translations.json` into the individual
application dictionaries. It overwrites each supplied language's dictionary, so
include locally maintained translations in the Crowdin input before deploying.
It does not generate the resource registry; register any new language explicitly.

`yarn I18N format-rebuild-fr:impress` rebuilds the French Crowdin skeleton using
`locales/fr.json`. The rebuild script's `--output` argument and the deploy script's
`--output` argument both refer to the application locale directory.
