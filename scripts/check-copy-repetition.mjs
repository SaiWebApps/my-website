import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const dist = join(root, 'dist');
const blocks = [];

function pages(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) pages(path);
    else if (item.name.endsWith('.html')) inspectPage(path);
  }
}

function plain(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, match => ({
      '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
    })[match] ?? match)
    .replace(/\s+/g, ' ')
    .trim();
}

function add(location, text) {
  const value = plain(text);
  if (value) blocks.push({ location, value });
}

function inspectPage(path) {
  const html = readFileSync(path, 'utf8');
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  if (!main) throw new Error(`No main content in ${path}`);
  const prose = /<(h[1-6]|p|button|a)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const match of main.matchAll(prose)) {
    add(`${relative(root, path)} <${match[1].toLowerCase()}>`, match[2]);
  }
}

pages(dist);

// Interactive result details are serialized in Astro source, not visible in the initial HTML.
const homeSource = readFileSync(join(root, 'src/pages/index.astro'), 'utf8');
for (const match of homeSource.matchAll(/story:\s*'((?:\\'|[^'])*)'/g)) {
  add('src/pages/index.astro interactive result', match[1]);
}

const phrases = new Map();
for (const [index, block] of blocks.entries()) {
  const words = block.value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  for (let start = 0; start <= words.length - 5; start++) {
    const phrase = words.slice(start, start + 5).join(' ');
    const seen = phrases.get(phrase) ?? new Set();
    seen.add(index);
    phrases.set(phrase, seen);
  }
}

const conflicts = new Map();
const exact = new Map();
for (const [index, block] of blocks.entries()) {
  const key = block.value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (key.split(' ').length < 2) continue;
  const previous = exact.get(key);
  if (previous !== undefined) conflicts.set(`${previous}:${index}`, key);
  else exact.set(key, index);
}
for (const [phrase, indices] of phrases) {
  if (indices.size < 2) continue;
  const entries = [...indices];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const key = `${entries[i]}:${entries[j]}`;
      if (!conflicts.has(key)) conflicts.set(key, phrase);
    }
  }
}

if (conflicts.size) {
  console.error(`Repeated copy across ${blocks.length} content blocks:`);
  for (const [pair, phrase] of conflicts) {
    const [first, second] = pair.split(':').map(Number);
    console.error(`\n"${phrase}"\n  ${blocks[first].location}: ${blocks[first].value}\n  ${blocks[second].location}: ${blocks[second].value}`);
  }
  process.exitCode = 1;
} else {
  console.log(`No repeated five-word phrases across ${blocks.length} content blocks. Review meaning and purpose manually.`);
}

if (process.argv.includes('--inventory')) {
  for (const block of blocks) console.log(`${block.location}: ${block.value}`);
}
