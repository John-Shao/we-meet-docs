import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import resources from '../../../apps/impress/src/i18n/resources';

describe('checks all the frontend translation are made', () => {
  it('registers every locale dictionary in the application resources', () => {
    const localeDirectory = '../../apps/impress/src/i18n/locales';
    const languages = fs
      .readdirSync(localeDirectory)
      .filter((file) => file.endsWith('.json'))
      .map((file) => path.basename(file, '.json'))
      .sort();

    expect(Object.keys(resources).sort()).toEqual(languages);
    Object.entries(resources).forEach(([language, { translation }]) => {
      expect(translation).toEqual(
        JSON.parse(
          fs.readFileSync(
            path.join(localeDirectory, `${language}.json`),
            'utf8',
          ),
        ),
      );
    });
  });

  it('checks missing translation. If this test fails, go to https://crowdin.com/', () => {
    // Extract the translations
    execSync(
      'yarn extract-translation:impress -c ./i18next-parser.config.jest.mjs',
    );
    const outputCrowdin = './locales/impress/translations-crowdin.json';
    const jsonCrowdin = JSON.parse(fs.readFileSync(outputCrowdin, 'utf8'));
    const listKeysCrowdin = Object.keys(jsonCrowdin).sort();

    // Check the translations in the app impress
    const jsonimpress = resources;

    // Our keys are in english, so we don't need to check the english translation
    Object.entries(jsonimpress)
      .filter(([key]) => key !== 'en')
      .forEach(([, { translation }]) => {
        const listKeysimpress = Object.keys(translation).sort();
        const missingKeys = listKeysCrowdin.filter(
          (element) => !listKeysimpress.includes(element),
        );
        const additionalKeys = listKeysimpress.filter(
          (element) => !listKeysCrowdin.includes(element),
        );

        if (missingKeys.length > 0) {
          console.log(
            `Missing keys in impress translations that should be translated in Crowdin, got to https://crowdin.com/ :`,
            missingKeys,
          );
        }

        if (additionalKeys.length > 0) {
          console.log(
            `Additional keys in impress translations that seems not present in this branch:`,
            additionalKeys,
          );
        }

        expect(missingKeys.length).toBe(0);
      });
  });
});
