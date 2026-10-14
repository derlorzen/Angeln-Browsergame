// Produktionsserver: liefert das gebaute Spiel (dist/) aus und vermittelt unter /api/ die Mehrspieler-Räume.
// Start: node server/server.mjs  (PORT, Standard 80; DIST, Standard ./dist)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createRooms } from './rooms.mjs';

const PORT = Number(process.env.PORT ?? 80);
const DIST = resolve(process.env.DIST ?? join(import.meta.dirname, '..', 'dist'));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};
const rooms = createRooms();
/** @type {Map<string, {raw: Buffer, gz: Buffer | null, mtime: number}>} */
const cache = new Map();

async function file(path) {
  const st = await stat(path);
  if (!st.isFile()) return null;
  const hit = cache.get(path);
  if (hit && hit.mtime === st.mtimeMs) return hit;
  const raw = await readFile(path);
  const gz = /\.(js|css|html|svg|json)$/.test(path) && raw.length > 1024 ? gzipSync(raw) : null;
  const entry = { raw, gz, mtime: st.mtimeMs };
  cache.set(path, entry);
  return entry;
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  try {
    if (await rooms.handle(req, res)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://x');
    let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (rel.includes('..')) {
      res.writeHead(400).end();
      return;
    }
    let path = join(DIST, rel || 'index.html');
    let f = await file(path).catch(() => null);
    if (!f) {
      // Einzelseitenanwendung: unbekannte Pfade auf index.html
      path = join(DIST, 'index.html');
      f = await file(path).catch(() => null);
    }
    if (!f) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden – wurde das Spiel gebaut (npm run build)?');
      return;
    }
    const gzip = f.gz && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    res.writeHead(200, {
      'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream',
      // gebündelte Dateien tragen einen Hash im Namen → lange zwischenspeichern; index.html immer frisch
      'Cache-Control': rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      ...(gzip ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : {}),
    });
    res.end(req.method === 'HEAD' ? undefined : gzip ? f.gz : f.raw);
  } catch {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});
server.listen(PORT, () => console.log(`Angeln läuft auf Port ${PORT} (Dateien: ${DIST})`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
