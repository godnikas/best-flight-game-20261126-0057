// Skylark Run — a tiny static server for local play-testing only.
// Serves game/ at http://localhost:8080 (and screenshots/ at /shots/).
// Not part of the entry: main.ts hands in game/ and screenshots/ directly.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const gameDir = join(root, 'game');
const shotsDir = join(root, 'screenshots');
const port = Number(process.env.PORT ?? 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const base = rel.startsWith('/shots/') ? shotsDir : gameDir;
    const file = rel.startsWith('/shots/') ? rel.slice('/shots/'.length) : rel.slice(1);
    const path = resolve(join(base, normalize(file)));
    if (!path.startsWith(base)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    const bytes = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(port, () => {
  console.log(`Skylark Run at http://localhost:${port} (game/ + /shots/)`);
});
