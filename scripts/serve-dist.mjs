// Serves dist/ with the same routing as vercel.json: clean URLs, no trailing slashes,
// and folder index.html files for the standalone pages copied from public/.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, join, normalize, relative } from 'node:path';

const root = new URL('../dist/', import.meta.url).pathname;
const port = Number(process.env.PORT ?? 4399);
const repo = new URL('../', import.meta.url).pathname;
const lockPath = join(repo, '.claude', 'rubric', 'release-lock.json');
const provenancePath = join(root, '.site-provenance.json');
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

function resolve(pathname) {
  let rel = normalize(decodeURIComponent(pathname));
  while (rel.startsWith('../') || rel.startsWith('..\\')) rel = rel.slice(3);  // never serve outside dist/
  const base = join(root, rel);
  for (const candidate of [base, `${base}.html`, join(base, 'index.html')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function treeHash(directory) {
  const hash = createHash('sha256');
  const walk = current => {
    const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else {
        const rel = relative(directory, path);
        if (rel === '.site-provenance.json') continue;
        hash.update(rel); hash.update(readFileSync(path));
      }
    }
  };
  walk(directory);
  return hash.digest('hex');
}

function released() {
  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
    const artifactHash = treeHash(root);
    return lock.state === 'RELEASED' && lock.artifactHash === artifactHash && provenance.artifactHash === artifactHash &&
      lock.sourceHash === provenance.sourceHash && lock.baselineId === provenance.baselineId;
  } catch {
    return false;
  }
}

createServer((req, res) => {
  if (!released()) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Release locked: this artifact has not passed the rubric.');
  }
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (pathname !== '/' && pathname.endsWith('/')) {
    res.writeHead(308, { Location: pathname.slice(0, -1) });
    return res.end();
  }
  const file = resolve(pathname);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  const size = statSync(file).size;
  const type = types[extname(file)] ?? 'application/octet-stream';
  const header = req.headers.range ?? '';
  const range = header.startsWith('bytes=') ? header.slice(6).split(',')[0].split('-') : null;
  if (range && range.length === 2) {
    const start = range[0] ? Number(range[0]) : 0;
    const end = range[1] ? Number(range[1]) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Serving dist/ at http://localhost:${port}`));
