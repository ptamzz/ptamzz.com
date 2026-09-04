const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { build } = require("../scripts/build");
const { loadEssays } = require("../scripts/lib/essays");
const { createFixture, defaultMeta, tempOutDir } = require("./helpers/fixture");

const SOURCE_ROOT = path.join(__dirname, "..");

function read(outDir, ...segments) {
  return fs.readFileSync(path.join(outDir, ...segments), "utf8");
}

function matches(html, pattern) {
  return [...html.matchAll(pattern)].map((match) => match[1]);
}

function recentHrefs(html) {
  return matches(html, /<a class="recent-card[^"]*" href="([^"]+)"/g);
}

function essayListHrefs(html) {
  return matches(html, /<li>\s*<a href="([^"]+)"/g);
}

test("home shows the newest two essays plus More, in date order", () => {
  const fixture = createFixture([
    { slug: "oldest", meta: defaultMeta("oldest", { date: "2024-01-01" }) },
    { slug: "newest", meta: defaultMeta("newest", { date: "2026-05-05" }) },
    { slug: "middle", meta: defaultMeta("middle", { date: "2025-03-03" }) },
  ]);

  try {
    build({ sourceRoot: fixture.root, outDir: fixture.outDir });
    const home = read(fixture.outDir, "index.html");

    assert.deepEqual(recentHrefs(home), [
      "/essay/newest",
      "/essay/middle",
      "/essay",
    ]);
    assert.ok(!home.includes("/essay/oldest"));
    assert.match(home, /<h3>More<\/h3>/);
  } finally {
    fixture.cleanup();
  }
});

test("essay index lists every published essay newest first", () => {
  const fixture = createFixture([
    { slug: "oldest", meta: defaultMeta("oldest", { date: "2024-01-01" }) },
    { slug: "newest", meta: defaultMeta("newest", { date: "2026-05-05" }) },
    { slug: "middle", meta: defaultMeta("middle", { date: "2025-03-03" }) },
  ]);

  try {
    build({ sourceRoot: fixture.root, outDir: fixture.outDir });
    const index = read(fixture.outDir, "essay", "index.html");

    assert.deepEqual(essayListHrefs(index), [
      "/essay/newest",
      "/essay/middle",
      "/essay/oldest",
    ]);
  } finally {
    fixture.cleanup();
  }
});

test("editing one meta.json updates Home and the essay index together", () => {
  const fixture = createFixture([
    { slug: "alpha", meta: defaultMeta("alpha", { date: "2025-01-01" }) },
    { slug: "beta", meta: defaultMeta("beta", { date: "2025-02-02" }) },
  ]);

  try {
    build({ sourceRoot: fixture.root, outDir: fixture.outDir });
    assert.deepEqual(recentHrefs(read(fixture.outDir, "index.html")), [
      "/essay/beta",
      "/essay/alpha",
      "/essay",
    ]);

    fs.writeFileSync(
      path.join(fixture.articleFolder("alpha"), "meta.json"),
      JSON.stringify(
        defaultMeta("alpha", { date: "2026-12-31", title: "Renamed Alpha" }),
        null,
        2,
      ),
    );

    build({ sourceRoot: fixture.root, outDir: fixture.outDir });
    const home = read(fixture.outDir, "index.html");
    const index = read(fixture.outDir, "essay", "index.html");

    assert.deepEqual(recentHrefs(home), [
      "/essay/alpha",
      "/essay/beta",
      "/essay",
    ]);
    assert.match(home, /<h3>Renamed Alpha<\/h3>/);
    assert.match(home, /<time datetime="2026-12-31">Dec 31, 2026<\/time>/);
    assert.deepEqual(essayListHrefs(index), ["/essay/alpha", "/essay/beta"]);
    assert.match(index, /Renamed Alpha/);
  } finally {
    fixture.cleanup();
  }
});

test("drafts are excluded from every collection surface", () => {
  const fixture = createFixture([
    { slug: "live", meta: defaultMeta("live", { date: "2025-01-01" }) },
    {
      slug: "hidden",
      meta: defaultMeta("hidden", { date: "2026-01-01", draft: true }),
    },
  ]);

  try {
    build({ sourceRoot: fixture.root, outDir: fixture.outDir });

    assert.deepEqual(recentHrefs(read(fixture.outDir, "index.html")), [
      "/essay/live",
      "/essay",
    ]);
    assert.deepEqual(
      essayListHrefs(read(fixture.outDir, "essay", "index.html")),
      ["/essay/live"],
    );
    assert.equal(
      fs.existsSync(path.join(fixture.outDir, "essay", "hidden")),
      false,
    );
  } finally {
    fixture.cleanup();
  }
});

test("articles keep their own presentation, scripts, and assets", () => {
  const fixture = createFixture([
    {
      slug: "wide-serif",
      css: ":root { --page-width: 900px; } body { font-family: Georgia, serif; }\n",
      body: '<div class="field"><canvas></canvas></div>',
      extraFiles: { "field.js": "// local sketch\n", "img/hero.png": "png" },
    },
    {
      slug: "narrow-sans",
      css: ":root { --page-width: 520px; } body { font-family: system-ui; }\n",
    },
  ]);

  try {
    build({ sourceRoot: fixture.root, outDir: fixture.outDir });

    const wide = read(fixture.outDir, "essay", "wide-serif", "article.css");
    const narrow = read(fixture.outDir, "essay", "narrow-sans", "article.css");

    assert.notEqual(wide, narrow);
    assert.match(wide, /900px/);
    assert.match(narrow, /520px/);

    for (const slug of ["wide-serif", "narrow-sans"]) {
      const page = read(fixture.outDir, "essay", slug, "index.html");
      assert.ok(
        !page.includes("/essay/styles.css"),
        `${slug} must not depend on shared article CSS`,
      );
    }

    assert.ok(
      fs.existsSync(path.join(fixture.outDir, "essay", "wide-serif", "field.js")),
    );
    assert.ok(
      fs.existsSync(
        path.join(fixture.outDir, "essay", "wide-serif", "img", "hero.png"),
      ),
    );
  } finally {
    fixture.cleanup();
  }
});

test("meta.json is build input and is never published", () => {
  const fixture = createFixture([{ slug: "alpha" }]);

  try {
    build({ sourceRoot: fixture.root, outDir: fixture.outDir });
    assert.equal(
      fs.existsSync(path.join(fixture.outDir, "essay", "alpha", "meta.json")),
      false,
    );
  } finally {
    fixture.cleanup();
  }
});

test("the shared favicon is published at the site root", () => {
  const fixture = createFixture([{ slug: "alpha" }]);

  try {
    build({ sourceRoot: fixture.root, outDir: fixture.outDir });
    assert.equal(
      fs.readFileSync(path.join(fixture.outDir, "favicon.png"), "utf8"),
      "png",
    );
  } finally {
    fixture.cleanup();
  }
});

test("image heroes resolve to the article folder and are escaped", () => {
  const fixture = createFixture([
    {
      slug: "alpha",
      meta: defaultMeta("alpha", {
        hero: { type: "image", src: "hero.png", alt: 'A "wide" shot' },
      }),
      extraFiles: { "hero.png": "png" },
    },
  ]);

  try {
    build({ sourceRoot: fixture.root, outDir: fixture.outDir });
    const index = read(fixture.outDir, "essay", "index.html");

    assert.match(
      index,
      /<img class="essay-hero" src="\/essay\/alpha\/hero\.png" alt="A &quot;wide&quot; shot"/,
    );
  } finally {
    fixture.cleanup();
  }
});

test("titles and excerpts are HTML escaped", () => {
  const fixture = createFixture([
    {
      slug: "alpha",
      meta: defaultMeta("alpha", {
        title: "Tools & <script>",
        excerpt: '5 > 3 & "true"',
      }),
    },
  ]);

  try {
    build({ sourceRoot: fixture.root, outDir: fixture.outDir });
    const home = read(fixture.outDir, "index.html");
    const index = read(fixture.outDir, "essay", "index.html");

    assert.match(home, /<h3>Tools &amp; &lt;script&gt;<\/h3>/);
    assert.match(index, /5 &gt; 3 &amp; &quot;true&quot;/);
  } finally {
    fixture.cleanup();
  }
});

test("the build is deterministic", () => {
  const fixture = createFixture([
    { slug: "alpha", meta: defaultMeta("alpha", { date: "2026-02-02" }) },
    { slug: "beta", meta: defaultMeta("beta", { date: "2026-02-02" }) },
  ]);

  try {
    build({ sourceRoot: fixture.root, outDir: fixture.outDir });
    const first = read(fixture.outDir, "essay", "index.html");
    build({ sourceRoot: fixture.root, outDir: fixture.outDir });
    const second = read(fixture.outDir, "essay", "index.html");

    assert.equal(first, second);
    // Same date, so slug order decides and stays stable.
    assert.deepEqual(essayListHrefs(first), ["/essay/alpha", "/essay/beta"]);
  } finally {
    fixture.cleanup();
  }
});

test("invalid metadata fails the build with an explanatory message", () => {
  const cases = [
    {
      name: "slug does not match folder",
      article: { slug: "alpha", meta: defaultMeta("beta") },
      expected: /"slug" must match the folder name/,
    },
    {
      name: "bad date",
      article: { slug: "alpha", meta: defaultMeta("alpha", { date: "Sep 2026" }) },
      expected: /"date" must use YYYY-MM-DD/,
    },
    {
      name: "missing excerpt",
      article: { slug: "alpha", meta: defaultMeta("alpha", { excerpt: "" }) },
      expected: /"excerpt" must be a non-empty string/,
    },
    {
      name: "unknown navigation mode",
      article: {
        slug: "alpha",
        meta: defaultMeta("alpha", { navigation: "magic" }),
      },
      expected: /"navigation" must be one of default, custom/,
    },
    {
      name: "hero escapes the article folder",
      article: {
        slug: "alpha",
        meta: defaultMeta("alpha", {
          hero: { type: "image", src: "../../secret.png" },
        }),
      },
      expected: /"hero\.src" must be a path inside the article folder/,
    },
    {
      name: "unparseable JSON",
      article: { slug: "alpha", rawMeta: "{ nope }" },
      expected: /is not valid JSON/,
    },
  ];

  for (const testCase of cases) {
    const fixture = createFixture([testCase.article]);
    try {
      assert.throws(
        () => build({ sourceRoot: fixture.root, outDir: fixture.outDir }),
        testCase.expected,
        testCase.name,
      );
    } finally {
      fixture.cleanup();
    }
  }
});

test("a missing generation marker fails loudly", () => {
  const fixture = createFixture([{ slug: "alpha" }], {
    homeTemplate: "<!doctype html><html><body></body></html>",
  });

  try {
    assert.throws(
      () => build({ sourceRoot: fixture.root, outDir: fixture.outDir }),
      /missing generated region markers for "recent"/,
    );
  } finally {
    fixture.cleanup();
  }
});

test("the real site builds and both collection surfaces agree", () => {
  const { essays, errors } = loadEssays(SOURCE_ROOT);
  assert.deepEqual(errors, []);
  assert.ok(essays.length >= 2, "expected at least two published essays");

  const result = build({ outDir: tempOutDir("real-build") });
  const home = read(result.outDir, "index.html");
  const index = read(result.outDir, "essay", "index.html");

  assert.deepEqual(recentHrefs(home), [
    ...essays.slice(0, 2).map((essay) => essay.href),
    "/essay",
  ]);
  assert.deepEqual(
    essayListHrefs(index),
    essays.map((essay) => essay.href),
  );
  assert.ok(fs.existsSync(path.join(result.outDir, "favicon.png")));
  assert.match(home, /<link rel="icon" type="image\/png" href="\/favicon\.png" \/>/);
  assert.match(index, /<link rel="icon" type="image\/png" href="\/favicon\.png" \/>/);

  for (const essay of essays) {
    const pagePath = path.join(
      result.outDir,
      "essay",
      essay.slug,
      "index.html",
    );
    assert.ok(fs.existsSync(pagePath), `${essay.slug} should be published`);
    assert.match(
      fs.readFileSync(pagePath, "utf8"),
      /<link rel="icon" type="image\/png" href="\/favicon\.png" \/>/,
    );
  }
});
