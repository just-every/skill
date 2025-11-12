const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(process.cwd(), 'apps/web/dist');
const port = Number(process.env.PORT || 4173);
const indexPath = path.join(root, 'index.html');

const mime = new Map([
  ['.html', 'text/html'],
  ['.js', 'application/javascript'],
  ['.css', 'text/css'],
  ['.json', 'application/json'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.webm', 'video/webm'],
]);

const send = (res, status, data, type) => {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
  });
  res.end(data);
};

const serveFile = (res, filePath) => {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      serveIndex(res);
      return;
    }
    const ext = path.extname(filePath);
    const type = mime.get(ext) ?? 'application/octet-stream';
    send(res, 200, data, type);
  });
};

const serveIndex = (res) => {
  fs.readFile(indexPath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('index.html missing');
      return;
    }
    send(res, 200, data, 'text/html');
  });
};

const server = http.createServer((req, res) => {
  const requestedPath = path.normalize(decodeURIComponent(new URL(req.url, `http://localhost`).pathname));
  const relativePath = requestedPath.replace(/^\/+/, '');
  const candidate = path.join(root, relativePath || 'index.html');
  if (!candidate.startsWith(root)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  fs.stat(candidate, (err, stats) => {
    if (err) {
      serveIndex(res);
      return;
    }
    if (stats.isDirectory()) {
      const indexCandidate = path.join(candidate, 'index.html');
      fs.stat(indexCandidate, (dirErr) => {
        if (!dirErr) {
          serveFile(res, indexCandidate);
        } else {
          serveIndex(res);
        }
      });
      return;
    }
    serveFile(res, candidate);
  });
});

server.listen(port, () => {
  console.log(`serving ${root} on http://127.0.0.1:${port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
