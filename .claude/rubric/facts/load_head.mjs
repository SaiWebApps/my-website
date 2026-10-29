// Loads his committed data modules (exported by export_head.py) and prints every export as JSON.
// Usage: node --import ./register.mjs load_head.mjs <dir> <out.json>
import { writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [dir, out] = process.argv.slice(2);
const all = {};
for (const f of readdirSync(dir)) {
  const p = join(dir, f);
  if (f.endsWith('.ts')) all[f] = { ...(await import(pathToFileURL(p).href)) };
  else if (f.endsWith('.json')) all[f] = (await import(pathToFileURL(p).href, { with: { type: 'json' } })).default;
}
writeFileSync(out, JSON.stringify(all, (k, v) => (typeof v === 'function' ? undefined : v), 1));
console.log(Object.entries(all).map(([k, v]) => `${k}: ${Object.keys(v).length} exports`).join('\n'));
