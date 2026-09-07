/** Docker-only wrapper: persist compiler cache while regenerating build output. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { resolve } from 'node:path';

const cacheRoot = process.argv[2];
if (!cacheRoot) {
  throw new Error('A BuildKit cache mount path is required');
}

const hash = createHash('sha256');
const add = (name, value) => hash.update(JSON.stringify([name, value]));
add('runtime', [process.version, process.platform, process.arch]);
add('target', process.env.TARGETPLATFORM ?? '');
add('mode', process.env.NODE_ENV ?? 'production');
for (const name of Object.keys(process.env).sort()) {
  if (name.startsWith('NEXT_PUBLIC_')) {
    add(name, process.env[name]);
  }
}
// Do not hash application source: edits should reuse compatible compiler work.
for (const file of [
  '../../package.json',
  '../../yarn.lock',
  '../../packages/eslint-plugin-docs/package.json',
  'package.json',
  'next.config.js',
  'tsconfig.json',
  ...readdirSync('.')
    .filter((name) => name.startsWith('.env'))
    .sort(),
]) {
  add(file, readFileSync(file, 'utf8'));
}

const key = hash.digest('hex');
const cache = resolve(cacheRoot, key);
const link = resolve('.next/cache');
const populated = existsSync(cache) && readdirSync(cache).length > 0;
mkdirSync(cache, { recursive: true });
mkdirSync('.next', { recursive: true });
// .next is excluded from the Docker context. Refuse to overwrite another cache.
symlinkSync(cache, link, 'dir');
console.log(
  `[next-cache] ${populated ? 'existing' : 'new'} namespace ${key.slice(0, 16)}`,
);
let result;
try {
  // Cached files are only hints; a successful build is still required for export.
  result = spawnSync('yarn', ['build'], { stdio: 'inherit' });
} finally {
  // Only the cache mount retains these files, even in the builder image layer.
  unlinkSync(link);
}
if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
