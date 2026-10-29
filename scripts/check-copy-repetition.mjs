// Fails when the built site repeats a five-word phrase across content blocks. No regular expressions: markup is
// read with string scans and words are found with Intl.Segmenter.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const dist = join(root, 'dist');
const blocks = [];
// Standalone pages copied from public/ carry their own markup and copy.
const standalone = ['talks', 'projects/ondoway'].map(dir => join(dist, dir));
const segmenter = new Intl.Segmenter('en', { granularity: 'word' });
const wordsOf = s => [...segmenter.segment(s.toLowerCase())].filter(x => x.isWordLike).map(x => x.segment);

function pages(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) { if (!standalone.includes(path)) pages(path); }
    else if (item.name.endsWith('.html')) inspectPage(path);
  }
}

function stripTags(html) {
  let out = '', depth = 0;
  for (const ch of html) {
    if (ch === '<') { depth = 1; out += ' '; continue; }
    if (ch === '>' && depth) { depth = 0; continue; }
    if (!depth) out += ch;
  }
  return out;
}

const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
function plain(html) {
  let s = stripTags(html);
  for (const [k, v] of Object.entries(ENTITIES)) s = s.split(k).join(v);
  return s.split('\n').join(' ').split('\t').join(' ').split(' ').filter(Boolean).join(' ').trim();
}

function add(location, text) {
  const value = plain(text);
  if (value) blocks.push({ location, value });
}

// The inner HTML of every element named `tag` (first matching close tag; these elements do not nest in the build).
function elements(html, tags) {
  const out = [], low = html.toLowerCase();
  let i = 0;
  while ((i = low.indexOf('<', i)) >= 0) {
    let j = i + 1;
    while (j < low.length && ((low[j] >= 'a' && low[j] <= 'z') || (low[j] >= '0' && low[j] <= '9'))) j++;
    const name = low.slice(i + 1, j);
    if (tags.includes(name) && (low[j] === ' ' || low[j] === '>' || low[j] === '\n')) {
      const open = low.indexOf('>', j);
      const close = low.indexOf(`</${name}>`, open);
      if (open >= 0 && close >= 0) { out.push([name, html.slice(open + 1, close)]); i = close + name.length + 3; continue; }
    }
    i = j;
  }
  return out;
}

function inspectPage(path) {
  const html = readFileSync(path, 'utf8');
  const main = elements(html, ['main'])[0]?.[1];
  if (!main) throw new Error(`No main content in ${path}`);
  for (const [name, inner] of elements(main, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'button', 'a'])) {
    add(`${relative(root, path)} <${name}>`, inner);
  }
}

pages(dist);

// Interactive result details are serialized in Astro source, not visible in the initial HTML.
const homeSource = readFileSync(join(root, 'src/pages/index.astro'), 'utf8');
for (let i = homeSource.indexOf('story:'); i >= 0; i = homeSource.indexOf('story:', i + 6)) {
  let j = i + 6;
  while (homeSource[j] === ' ') j++;
  if (homeSource[j] !== "'") continue;
  let k = j + 1, s = '';
  while (k < homeSource.length && homeSource[k] !== "'") { if (homeSource[k] === '\\') { s += homeSource[k + 1]; k += 2; } else { s += homeSource[k]; k++; } }
  add('src/pages/index.astro interactive result', s);
}

const phrases = new Map();
for (const [index, block] of blocks.entries()) {
  const words = wordsOf(block.value);
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
  const key = wordsOf(block.value).join(' ');
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
