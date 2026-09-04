const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT) || 4173;
const root = process.env.SERVE_ROOT
  ? path.resolve(process.env.SERVE_ROOT)
  : path.join(__dirname, "dist");

const ESSAY_INDEX_PATHS = new Set([
  "/essay",
  "/essay/",
  "/essays",
  "/essays/",
]);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// Keeps every resolved path inside the served directory.
function withinRoot(candidate) {
  const resolved = path.resolve(candidate);
  return resolved === root || resolved.startsWith(root + path.sep)
    ? resolved
    : null;
}

function resolveRequest(urlPath) {
  if (urlPath === "/" || urlPath === "/index.html") {
    return path.join(root, "index.html");
  }

  if (ESSAY_INDEX_PATHS.has(urlPath)) {
    return path.join(root, "essay", "index.html");
  }

  const essayMatch = urlPath.match(/^\/essay\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
  if (essayMatch) {
    return withinRoot(path.join(root, "essay", essayMatch[1], "index.html"));
  }

  return withinRoot(path.join(root, urlPath));
}

function sendNotFound(response) {
  response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
<html lang="en">
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Not found · Pritam Pebam</title>
  <body>
    <main><h1>Not found</h1><p><a href="/">Return home</a></p></main>
  </body>
</html>`);
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  let filePath = null;

  try {
    filePath = resolveRequest(decodeURIComponent(requestUrl.pathname));
  } catch {
    filePath = null;
  }

  if (!filePath) {
    sendNotFound(response);
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      sendNotFound(response);
      return;
    }

    const contentType =
      contentTypes[path.extname(filePath).toLowerCase()] ||
      "application/octet-stream";
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    fs.createReadStream(filePath).pipe(response);
  });
});

function start() {
  if (!fs.existsSync(path.join(root, "index.html"))) {
    console.error(
      `No build found in ${root}. Run \`npm run build\` before starting the server.`,
    );
    process.exitCode = 1;
    return;
  }

  server.listen(port, host, () => {
    console.log(`Portfolio running at http://${host}:${port}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = { resolveRequest, root, server };
