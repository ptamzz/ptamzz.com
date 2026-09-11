const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { build } = require("../scripts/build");
const { OUTLINE_PATH, resolveReturnTarget } = require("../shared/particle-mark");
const {
  articlePage,
  createFixture,
  defaultMeta,
  tempOutDir,
} = require("./helpers/fixture");

const ORIGIN = "https://pritampebam.com";
const SOURCE_ROOT = path.join(__dirname, "..");

test("a direct or external visit sends the reader home", () => {
  const cases = ["", undefined, null, "not a url", "https://news.example.com/essay"];

  for (const referrer of cases) {
    const target = resolveReturnTarget(referrer, ORIGIN);
    assert.equal(target.href, "/", `referrer: ${referrer}`);
    assert.equal(target.useHistoryBack, false);
    assert.equal(target.label, "Return to home");
  }
});

test("arriving from the essay index returns to the essay index", () => {
  for (const pathname of ["/essay", "/essay/", "/essays", "/essays/"]) {
    const target = resolveReturnTarget(`${ORIGIN}${pathname}`, ORIGIN);
    assert.equal(target.href, pathname);
    assert.equal(target.useHistoryBack, true);
    assert.equal(target.label, "Return to all essays");
  }
});

test("arriving from another page on the site still sends the reader home", () => {
  for (const pathname of ["/", "/essay/some-slug", "/essayish"]) {
    const target = resolveReturnTarget(`${ORIGIN}${pathname}`, ORIGIN);
    assert.equal(target.href, "/", `referrer: ${pathname}`);
  }
});

test("query strings and hashes on the index referrer are ignored", () => {
  const target = resolveReturnTarget(`${ORIGIN}/essay?page=2#list`, ORIGIN);
  assert.equal(target.href, "/essay");
  assert.equal(target.useHistoryBack, true);
});

test("default articles receive the particle control automatically", () => {
  const fixture = createFixture([{ slug: "alpha" }]);

  try {
    build({ sourceRoot: fixture.root, outDir: fixture.outDir });
    const page = fs.readFileSync(
      path.join(fixture.outDir, "essay", "alpha", "index.html"),
      "utf8",
    );

    assert.match(page, /<link rel="stylesheet" href="\/shared\/particle-mark\.css" \/>/);
    assert.match(page, /<script defer src="\/shared\/particle-mark\.js"><\/script>/);
    assert.ok(
      page.indexOf("particle-mark.js") < page.indexOf("</head>"),
      "the control should be injected inside the head",
    );
  } finally {
    fixture.cleanup();
  }
});

test("custom-navigation articles are published byte-for-byte unmodified", () => {
  const fixture = createFixture([
    {
      slug: "custom",
      meta: defaultMeta("custom", { navigation: "custom" }),
      page: articlePage("custom", '<a class="my-own-back" href="/">back</a>'),
    },
  ]);

  try {
    build({ sourceRoot: fixture.root, outDir: fixture.outDir });

    const source = fs.readFileSync(
      path.join(fixture.articleFolder("custom"), "index.html"),
      "utf8",
    );
    const published = fs.readFileSync(
      path.join(fixture.outDir, "essay", "custom", "index.html"),
      "utf8",
    );

    assert.equal(published, source);
    assert.ok(!published.includes("particle-mark"));
  } finally {
    fixture.cleanup();
  }
});

test("injection is idempotent when an article already carries the control", () => {
  const page = `<!doctype html>
<html lang="en">
  <head>
    <title>alpha</title>
    <script defer src="/shared/particle-mark.js"></script>
  </head>
  <body></body>
</html>
`;
  const fixture = createFixture([{ slug: "alpha", page }]);

  try {
    build({ sourceRoot: fixture.root, outDir: fixture.outDir });
    const published = fs.readFileSync(
      path.join(fixture.outDir, "essay", "alpha", "index.html"),
      "utf8",
    );

    assert.equal(published.match(/particle-mark\.js/g).length, 1);
    assert.equal(published, page);
  } finally {
    fixture.cleanup();
  }
});

test("the particle mark lives in exactly one component", () => {
  const styles = fs.readFileSync(
    path.join(SOURCE_ROOT, "essay", "styles.css"),
    "utf8",
  );
  const component = fs.readFileSync(
    path.join(SOURCE_ROOT, "shared", "particle-mark.css"),
    "utf8",
  );

  assert.ok(
    !styles.includes(".home-mark") && !styles.includes(".particle-mark"),
    "essay styles must not own the control",
  );
  assert.match(component, /\.particle-mark/);
  assert.match(component, /\.home-mark/);
  assert.match(component, /--mark-accent/, "the colour must come from a token");

  // The shape and the renderer may not be duplicated into any page, or home
  // and the essays can drift apart again.
  for (const page of ["index.html", path.join("essay", "index.html")]) {
    const markup = fs.readFileSync(path.join(SOURCE_ROOT, page), "utf8");

    assert.ok(
      !markup.includes(OUTLINE_PATH),
      `${page} must not carry its own copy of the outline`,
    );
    assert.ok(
      !markup.includes("getContext"),
      `${page} must not draw the mark itself`,
    );
  }
});

test("both real articles are published with working navigation", () => {
  const result = build({ outDir: tempOutDir("real-navigation") });

  for (const essay of result.essays) {
    const page = fs.readFileSync(
      path.join(result.outDir, "essay", essay.slug, "index.html"),
      "utf8",
    );

    if (essay.navigation === "default") {
      assert.match(page, /particle-mark\.js/, `${essay.slug} should get the control`);
      assert.match(page, /particle-mark\.css/, `${essay.slug} should get its styles`);
    }
  }

  assert.ok(
    fs.existsSync(path.join(result.outDir, "shared", "particle-mark.js")),
    "the shared control must be published",
  );
  assert.ok(
    fs.existsSync(path.join(result.outDir, "shared", "particle-mark.css")),
    "the shared control styles must be published",
  );
});
