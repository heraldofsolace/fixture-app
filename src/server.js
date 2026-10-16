import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { loadBoard } from './github.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(here, '..', 'public');

const PORT = Number(process.env.PORT ?? 3000);
const REPO = process.env.GITHUB_REPO ?? '';
const TOKEN = process.env.GITHUB_TOKEN ?? '';
const CACHE_TTL_MS = Number(process.env.BOARD_CACHE_MS ?? 60_000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

let cache = { at: 0, board: null };

/** Board payload, served from a short-lived in-memory cache. */
export async function getBoard({ force = false } = {}) {
  if (!force && cache.board && Date.now() - cache.at < CACHE_TTL_MS) {
    return { ...cache.board, cached: true };
  }
  const board = {
    ...(await loadBoard({ repo: REPO, token: TOKEN })),
    fetchedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), board };
  return { ...board, cached: false };
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function serveStatic(res, pathname) {
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, relative);

  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('forbidden');
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (url.pathname === '/health') {
      sendJson(res, 200, { ok: true, repo: REPO || null });
      return;
    }

    if (url.pathname === '/api/board') {
      try {
        sendJson(res, 200, await getBoard({ force: url.searchParams.has('refresh') }));
      } catch (error) {
        sendJson(res, 502, { error: error.message });
      }
      return;
    }

    await serveStatic(res, url.pathname);
  });
}

createServer().listen(PORT, () => {
  console.log(`kanban board: http://localhost:${PORT}`);
  if (!REPO) console.warn('warning: GITHUB_REPO is not set - /api/board will fail');
  if (!TOKEN) console.warn('warning: GITHUB_TOKEN is not set - GitHub may rate-limit you hard');
});
