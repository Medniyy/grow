import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Static host for the exported Grow web build.
 *
 * Zero dependencies, the same rule the proxy follows: nothing to install,
 * nothing to audit, nothing to break on deploy.
 *
 *   npx expo export --platform web     # writes ../dist
 *   node web/server.js                 # serves it locally
 *
 * Deployed by copying `dist` to `web/public` and pushing that directory as its
 * own Railway service, so the site and the API proxy scale and fail separately.
 */
const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * `public/` when deployed, the sibling `dist/` when run from a checkout — so
 * the same file serves the real site and a local preview of it.
 */
const ROOT = existsSync(join(HERE, 'public')) ? join(HERE, 'public') : resolve(HERE, '..', 'dist');
const PORT = process.env.PORT || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.map': 'application/json; charset=utf-8',
};

function send(res, file, status = 200) {
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  /**
   * Hashed bundles may be cached forever; `index.html` may never be. Cache it
   * and a redeploy leaves people on the previous bundle with no way to know,
   * which on a money screen means an old build spending against a new backend.
   */
  const immutable = file.includes('_expo');
  res.writeHead(status, {
    'content-type': type,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // `normalize` collapses `..`; the prefix check refuses whatever still points
  // outside the published directory.
  const target = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (!target.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  if (existsSync(target) && statSync(target).isFile()) {
    send(res, target);
    return;
  }

  /**
   * ⚠️ THE SPA FALLBACK IS THE WHOLE REASON THIS IS NOT A ONE-LINER. The export
   * produces a single `index.html`, but the app's routes are real paths —
   * `/grow`, `/yield`, `/tour`. Serving files only, a reload on any of them is a
   * 404, and so is every link anyone shares.
   */
  send(res, join(ROOT, 'index.html'));
}).listen(PORT, () => console.log(`Grow web on :${PORT} (serving ${ROOT})`));
