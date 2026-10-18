// preview-server.js — local preview server that mirrors vercel.json rewrites:
// `/about` -> about.html, unknown app routes -> index.html, static files as-is.
// Serves the `frontend/` directory and binds 0.0.0.0 for the Freebuff preview.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'frontend');
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function safeJoin(root, urlPath) {
  const resolved = path.resolve(root, '.' + urlPath);
  return resolved.startsWith(root) ? resolved : null;
}

function serve(res, file, status) {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(status || 200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

http
  .createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }

    let file = safeJoin(ROOT, urlPath);
    if (!file) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (urlPath === '/' || urlPath === '/index.html') {
      serve(res, path.join(ROOT, 'index.html'));
      return;
    }

    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      serve(res, file);
      return;
    }

    // Vercel-style rewrite: extensionless path -> same name .html
    const htmlFile = file + '.html';
    if (!path.extname(urlPath) && fs.existsSync(htmlFile) && fs.statSync(htmlFile).isFile()) {
      serve(res, htmlFile);
      return;
    }

    // SPA fallback: unknown routes render the app shell
    serve(res, path.join(ROOT, 'index.html'));
  })
  .listen(PORT, '0.0.0.0', () => {
    console.log(`preview-server listening on 0.0.0.0:${PORT} (root: ${ROOT})`);
  });