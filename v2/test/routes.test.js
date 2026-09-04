const assert = require("node:assert/strict");
const test = require("node:test");

const { build } = require("../scripts/build");
const { tempOutDir } = require("./helpers/fixture");

const result = build({ outDir: tempOutDir("real-routes") });
process.env.SERVE_ROOT = result.outDir;

const { server } = require("../server");

let origin;

test.before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
});

async function status(pathname) {
  const response = await fetch(`${origin}${pathname}`);
  await response.arrayBuffer();
  return response.status;
}

test("home, essay index, and every generated article route return 200", async () => {
  const routes = [
    "/",
    "/essay",
    "/essay/",
    "/essays",
    ...result.essays.map((essay) => essay.href),
    ...result.essays.map((essay) => `${essay.href}/`),
  ];

  for (const route of routes) {
    assert.equal(await status(route), 200, route);
  }
});

test("shared and article-local assets are served", async () => {
  const assets = [
    "/essay/styles.css",
    "/essay/particle-mark.css",
    "/essay/particle-mark.js",
    ...result.essays.map((essay) => `${essay.href}/article.css`),
  ];

  for (const asset of assets) {
    assert.equal(await status(asset), 200, asset);
  }
});

test("the essay index is served for the /essay route, not a directory listing", async () => {
  const response = await fetch(`${origin}/essay`);
  const body = await response.text();

  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(body, /<ol class="essay-list">/);
});

test("unknown slugs, build inputs, and traversal attempts return 404", async () => {
  const routes = [
    "/essay/no-such-essay",
    "/essay/no-such-essay/",
    "/nope",
    `${result.essays[0].href}/meta.json`,
    "/../package.json",
    "/essay/../../package.json",
  ];

  for (const route of routes) {
    assert.equal(await status(route), 404, route);
  }
});
