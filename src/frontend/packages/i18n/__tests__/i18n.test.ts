import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

describe('integration testing on i18n package', () => {
  afterAll(() => {
    fs.rmSync('./locales/tests', { recursive: true, force: true });
  });

  test('cmd extract-translation:impress', () => {
    // To be sure the file is not here
    fs.rmSync('./locales/impress/translations-crowdin.json', {
      recursive: true,
      force: true,
    });
    expect(
      fs.existsSync('./locales/impress/translations-crowdin.json'),
    ).toBeFalsy();

    // Generate the file
    execSync('yarn extract-translation:impress');
    expect(
      fs.existsSync('./locales/impress/translations-crowdin.json'),
    ).toBeTruthy();
  });

  test('cmd format-deploy', () => {
    // To be sure the tests folder is not here
    fs.rmSync('./locales/tests', { recursive: true, force: true });
    expect(fs.existsSync('./locales/tests')).toBeFalsy();

    // Generate english json file
    fs.mkdirSync('./locales/tests/en/', { recursive: true });
    fs.writeFileSync(
      './locales/tests/en/translations.json',
      JSON.stringify({ test: { message: 'My test' } }),
      'utf8',
    );
    expect(fs.existsSync('./locales/tests/en/translations.json')).toBeTruthy();

    fs.mkdirSync('./locales/tests/fr/', { recursive: true });
    fs.writeFileSync(
      './locales/tests/fr/translations.json',
      JSON.stringify({ test: { message: 'Mon test' } }),
      'utf8',
    );
    expect(fs.existsSync('./locales/tests/fr/translations.json')).toBeTruthy();

    // Execute format-deploy command
    const output = './locales/tests/output';
    execSync(`node ./format-deploy.mjs --app=tests --output=${output}`);
    expect(fs.readdirSync(output).sort()).toEqual(['en.json', 'fr.json']);
    expect(
      JSON.parse(fs.readFileSync(path.join(output, 'en.json'), 'utf8')),
    ).toEqual({ test: 'My test' });
    expect(
      JSON.parse(fs.readFileSync(path.join(output, 'fr.json'), 'utf8')),
    ).toEqual({ test: 'Mon test' });
  });

  test('cmd format-deploy throws an error when translation file is not found', () => {
    // To be sure the tests folder is not here
    fs.rmSync('./locales/tests', { recursive: true, force: true });
    expect(fs.existsSync('./locales/tests')).toBeFalsy();

    // Generate english json file
    fs.mkdirSync('./locales/tests/en/', { recursive: true });

    // Execute format-deploy command
    const output = './locales/tests/output';

    const cmd = () => {
      execSync(`node ./format-deploy.mjs --app=tests --output=${output}`, {
        stdio: 'pipe',
      });
    };

    expect(cmd).toThrow(
      `Error: File locales${path.sep}tests${path.sep}en${path.sep}translations.json not found!`,
    );
    expect(fs.existsSync(output)).toBeFalsy();
  });

  test('cmd format-deploy throws an error when no translation to deploy', () => {
    // To be sure the tests folder is not here
    fs.rmSync('./locales/tests', { recursive: true, force: true });
    expect(fs.existsSync('./locales/tests')).toBeFalsy();

    // Generate english json file
    fs.mkdirSync('./locales/tests/', { recursive: true });

    // Execute format-deploy command
    const output = './locales/tests/output';

    const cmd = () => {
      execSync(`node ./format-deploy.mjs --app=tests --output=${output}`, {
        stdio: 'pipe',
      });
    };

    expect(cmd).toThrow('Error: No translation to deploy');
    expect(fs.existsSync(output)).toBeFalsy();
  });

  test('cmd rebuild-translations reads the selected flat dictionary', () => {
    fs.rmSync('./locales/tests', { recursive: true, force: true });
    const output = './locales/tests/output';
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(
      './locales/tests/translations-skeleton.json',
      JSON.stringify({
        greeting: { message: '', description: 'Greeting' },
        missing: { message: '', description: 'Missing translation' },
      }),
      'utf8',
    );
    fs.writeFileSync(
      path.join(output, 'fr.json'),
      JSON.stringify({ greeting: 'Bonjour {{name}}' }),
      'utf8',
    );
    fs.writeFileSync(
      path.join(output, 'en.json'),
      JSON.stringify({ greeting: 'Hello {{name}}' }),
      'utf8',
    );

    execSync(
      `node ./rebuild-translations.mjs --app=tests --language=fr --output=${output}`,
    );

    expect(
      JSON.parse(
        fs.readFileSync('./locales/tests/translations-rebuild.json', 'utf8'),
      ),
    ).toEqual({
      greeting: { message: 'Bonjour {{name}}', description: 'Greeting' },
      missing: { message: '', description: 'Missing translation' },
    });
  });

  test('cmd rebuild-translations reports a missing locale file', () => {
    fs.rmSync('./locales/tests', { recursive: true, force: true });
    fs.mkdirSync('./locales/tests', { recursive: true });
    fs.writeFileSync(
      './locales/tests/translations-skeleton.json',
      '{}',
      'utf8',
    );

    expect(() =>
      execSync(
        'node ./rebuild-translations.mjs --app=tests --language=fr --output=./locales/tests/output',
        { stdio: 'pipe' },
      ),
    ).toThrow(
      `Error: File locales${path.sep}tests${path.sep}output${path.sep}fr.json not found!`,
    );
  });
});
