// Checks that every language has the same keys and that every key used in the code exists.
// Run: node tools/check-strings.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { STRINGS } = await import(new URL('../strings.js', import.meta.url));

const problems = [];
const base = Object.keys(STRINGS.ru);
const placeholders = (text) => (text.match(/\{\w+\}/g) || []).sort().join(',');

for (const [lang, table] of Object.entries(STRINGS)) {
  for (const key of base) {
    if (!(key in table)) problems.push(`${lang}: missing ${key}`);
    else if (placeholders(table[key]) !== placeholders(STRINGS.ru[key])) problems.push(`${lang}: placeholders differ in ${key}`);
  }
  for (const key of Object.keys(table)) {
    if (!(key in STRINGS.ru)) problems.push(`${lang}: extra ${key}`);
  }
}

const used = new Set();
const sources = readdirSync(root).filter((name) => /\.(js|html)$/.test(name) && name !== 'strings.js');
const keyShape = /['"]((?:app|ui|theme|stage|project|model|balance|sign|text|font|svg|sym|how|stamps|export|roll|preset|status|hint|engine|busy|where|err|gen|scene)\.[A-Za-z0-9.]+)['"]/g;
for (const name of sources) {
  const text = readFileSync(join(root, name), 'utf8');
  for (const match of text.matchAll(keyShape)) used.add(match[1]);
}

for (const key of used) {
  if (!(key in STRINGS.ru)) problems.push(`used but not defined: ${key}`);
}
for (const key of base) {
  if (!used.has(key)) problems.push(`defined but not used: ${key}`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`ok: ${base.length} keys in ${Object.keys(STRINGS).length} languages, ${used.size} used`);
