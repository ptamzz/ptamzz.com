const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const HOME_TEMPLATE = `<!doctype html>
<html lang="en">
  <body>
    <section id="recent">
      <div class="recent-grid">
        <!-- generated:recent:start -->
        <!-- generated:recent:end -->
      </div>
    </section>
  </body>
</html>
`;

const ESSAY_INDEX_TEMPLATE = `<!doctype html>
<html lang="en">
  <body>
    <ol class="essay-list">
      <!-- generated:essay-list:start -->
      <!-- generated:essay-list:end -->
    </ol>
  </body>
</html>
`;

function defaultMeta(slug, overrides = {}) {
  return {
    slug,
    title: slug,
    date: "2026-01-01",
    excerpt: `Excerpt for ${slug}.`,
    hero: { type: "gradient", background: "#eee" },
    navigation: "default",
    ...overrides,
  };
}

function articlePage(slug, body = "") {
  return `<!doctype html>
<html lang="en">
  <head>
    <title>${slug}</title>
    <link rel="stylesheet" href="/essay/${slug}/article.css" />
  </head>
  <body>${body}</body>
</html>
`;
}

// Builds a throwaway source tree so build behaviour can be tested without
// touching the real site.
function createFixture(articles, { homeTemplate = HOME_TEMPLATE } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "essay-fixture-"));

  fs.mkdirSync(path.join(root, "essay", "articles"), { recursive: true });
  fs.writeFileSync(path.join(root, "index.html"), homeTemplate);
  fs.writeFileSync(path.join(root, "favicon.png"), "png");
  fs.writeFileSync(path.join(root, "essay", "index.html"), ESSAY_INDEX_TEMPLATE);
  fs.writeFileSync(path.join(root, "essay", "styles.css"), "/* index */\n");

  fs.mkdirSync(path.join(root, "shared"), { recursive: true });
  fs.writeFileSync(path.join(root, "shared", "particle-mark.css"), "/* mark */\n");
  fs.writeFileSync(path.join(root, "shared", "particle-mark.js"), "// mark\n");

  for (const article of articles) {
    const slug = article.slug ?? article.meta?.slug;
    const folder = path.join(root, "essay", "articles", slug);
    fs.mkdirSync(folder, { recursive: true });

    const meta = article.meta ?? defaultMeta(slug);
    if (article.rawMeta !== undefined) {
      fs.writeFileSync(path.join(folder, "meta.json"), article.rawMeta);
    } else {
      fs.writeFileSync(
        path.join(folder, "meta.json"),
        `${JSON.stringify(meta, null, 2)}\n`,
      );
    }

    fs.writeFileSync(
      path.join(folder, "index.html"),
      article.page ?? articlePage(slug, article.body ?? ""),
    );
    fs.writeFileSync(
      path.join(folder, "article.css"),
      article.css ?? `/* ${slug} */\n`,
    );

    for (const [name, contents] of Object.entries(article.extraFiles ?? {})) {
      fs.mkdirSync(path.dirname(path.join(folder, name)), { recursive: true });
      fs.writeFileSync(path.join(folder, name), contents);
    }
  }

  return {
    root,
    outDir: path.join(root, "dist"),
    articleFolder: (slug) => path.join(root, "essay", "articles", slug),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

// Test files run in parallel, so each one needs its own output directory
// rather than sharing the real dist/.
function tempOutDir(label) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`)), "dist");
}

module.exports = {
  ESSAY_INDEX_TEMPLATE,
  tempOutDir,
  HOME_TEMPLATE,
  articlePage,
  createFixture,
  defaultMeta,
};
