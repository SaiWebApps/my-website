import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const databasePath = resolve(root, 'brand/sairam-brand.db');
const output = resolve(root, 'src/data/brand.generated.json');
const db = existsSync(databasePath) ? new DatabaseSync(databasePath, { readOnly: true }) : null;
const snapshot = db ? null : JSON.parse(readFileSync(output, 'utf8'));
const rows = db ? db.prepare(`
  SELECT c.id, c.subject_id, c.predicate, c.object_text, c.tier,
         c.source_line, c.source_excerpt, s.path AS source_path, s.sha256 AS source_sha256
  FROM claim c JOIN source s ON s.id = c.source_id
  ORDER BY c.tier, c.predicate, c.object_text
`).all() : snapshot.claims;
const policies = db ? db.prepare('SELECT id, rule_text, enforcement FROM policy ORDER BY id').all() : snapshot.policies;
const integrity = db ? db.prepare('SELECT name, value FROM integrity_manifest ORDER BY name').all() : snapshot.integrity;
db?.close();

const required = [
  'Principal Software Engineer and AI/ML platform lead at Apple',
  'An eight-engineer team across three continents',
  'Platforms serving more than 100 million users',
  '$40M per year at Amazon Alexa',
  'Senior Engineering Manager roles at top-tier technology companies',
  'Eagles Care Summit 2026 before more than 300 leaders',
];
for (const value of required) {
  if (!rows.some((row) => row.object_text === value)) {
    throw new Error(`Brand graph is missing required claim: ${value}`);
  }
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify({ claims: rows, policies, integrity }, null, 2)}\n`);
console.log(`Exported ${rows.length} sourced claims to src/data/brand.generated.json`);
