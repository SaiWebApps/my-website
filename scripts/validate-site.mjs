import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const failures = [];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const pages = walk(dist).filter((path) => extname(path) === '.html');
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const h1Count = (html.match(/<h1\b/g) ?? []).length;
  const isRedirect = /<meta\s+http-equiv="refresh"\s+content="[^\"]*url=\//i.test(html);
  if (!isRedirect && h1Count !== 1) failures.push(`${page}: expected one h1, found ${h1Count}`);

  for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const pathname = href.split(/[?#]/)[0];
    if (!pathname) continue;
    const target = pathname.endsWith('/')
      ? join(dist, pathname, 'index.html')
      : extname(pathname)
        ? join(dist, pathname)
        : join(dist, pathname, 'index.html');
    if (!existsSync(target)) failures.push(`${page}: broken internal link ${href}`);
  }
}

const requiredEvents = ['contact_inquiry', 'resume_download', 'case_study_open', 'paper_open'];
const source = walk(join(root, 'src')).filter((path) => ['.astro', '.ts'].includes(extname(path))).map((path) => readFileSync(path, 'utf8')).join('\n');
for (const event of requiredEvents) {
  if (!source.includes(event)) failures.push(`missing analytics event: ${event}`);
}


// Meta-prose ban: no text whose subject is the interface instead of Sairam.
// See DESIGN.md "Non-negotiable Exclusions". Add patterns when a new offender class appears.
const bannedCopy = [
  /hover (a|the|over|to)/i,
  /click (a|the|to|here)/i,
  /\bselect (a|it)\b/i,
  /\blegend\b/i,
  /\bseniority\b/i,
  /\bmagnitude\b/i,
  /sources\s*·/i,
  /canonical record/i,
  /person:sairam/i,
];
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  for (const pattern of bannedCopy) {
    const hit = text.match(pattern);
    if (hit) failures.push(`${page}: banned meta-prose "${hit[0]}" — text must be a real name, date, number, title, or quotation`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Validated ${pages.length} static pages, internal links, heading structure, and analytics events.`);
