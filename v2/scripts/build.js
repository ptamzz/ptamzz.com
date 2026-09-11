const fs = require("node:fs");
const path = require("node:path");

const {
  loadEssays,
  renderEssayList,
  renderRecentCards,
  replaceRegion,
} = require("./lib/essays");

const DEFAULT_SOURCE_ROOT = path.join(__dirname, "..");
const RECENT_LIMIT = 2;
const SHARED_ROOT_ASSETS = ["favicon.png"];
const SHARED_ESSAY_ASSETS = ["styles.css"];
// Site-wide components, served from /shared so home and the essays can both
// reach them without either owning the other's files.
const SHARED_COMPONENT_DIR = "shared";
const NAV_STYLESHEET = '<link rel="stylesheet" href="/shared/particle-mark.css" />';
const NAV_SCRIPT = '<script defer src="/shared/particle-mark.js"></script>';

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyArticleFiles(folder, outDir) {
  fs.mkdirSync(outDir, { recursive: true });

  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    // meta.json is build input, not something the site should serve.
    if (entry.name === "meta.json") continue;

    const from = path.join(folder, entry.name);
    const to = path.join(outDir, entry.name);

    if (entry.isDirectory()) {
      fs.cpSync(from, to, { recursive: true });
    } else {
      copyFile(from, to);
    }
  }
}

// Articles set to default navigation get the shared particle control appended
// to their head. Articles declaring custom navigation are copied untouched.
function injectNavigation(html, slug) {
  if (html.includes(NAV_SCRIPT)) {
    return html;
  }

  const headClose = html.indexOf("</head>");
  if (headClose === -1) {
    throw new Error(
      `${slug}: index.html has no </head>, so default navigation cannot be injected. Set "navigation": "custom" to opt out.`,
    );
  }

  const lineStart = html.lastIndexOf("\n", headClose) + 1;
  const pad = " ".repeat(headClose - lineStart + 2);
  const injection = `${pad}${NAV_STYLESHEET}\n${pad}${NAV_SCRIPT}\n`;

  return html.slice(0, lineStart) + injection + html.slice(lineStart);
}

function build({
  sourceRoot = DEFAULT_SOURCE_ROOT,
  outDir = path.join(sourceRoot, "dist"),
  recentLimit = RECENT_LIMIT,
} = {}) {
  const { essays, errors } = loadEssays(sourceRoot);

  if (errors.length > 0) {
    const error = new Error(
      `Essay metadata is invalid:\n  - ${errors.join("\n  - ")}`,
    );
    error.validationErrors = errors;
    throw error;
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  for (const asset of SHARED_ROOT_ASSETS) {
    copyFile(path.join(sourceRoot, asset), path.join(outDir, asset));
  }

  fs.cpSync(
    path.join(sourceRoot, SHARED_COMPONENT_DIR),
    path.join(outDir, SHARED_COMPONENT_DIR),
    { recursive: true },
  );

  const homeSource = fs.readFileSync(path.join(sourceRoot, "index.html"), "utf8");
  const home = replaceRegion(
    homeSource,
    "recent",
    renderRecentCards(essays, { limit: recentLimit }),
    "index.html",
  );
  fs.writeFileSync(path.join(outDir, "index.html"), home);

  const indexSource = fs.readFileSync(
    path.join(sourceRoot, "essay", "index.html"),
    "utf8",
  );
  const essayIndex = replaceRegion(
    indexSource,
    "essay-list",
    renderEssayList(essays),
    "essay/index.html",
  );
  fs.mkdirSync(path.join(outDir, "essay"), { recursive: true });
  fs.writeFileSync(path.join(outDir, "essay", "index.html"), essayIndex);

  for (const asset of SHARED_ESSAY_ASSETS) {
    copyFile(
      path.join(sourceRoot, "essay", asset),
      path.join(outDir, "essay", asset),
    );
  }

  for (const essay of essays) {
    const articleOut = path.join(outDir, "essay", essay.slug);
    copyArticleFiles(essay.folder, articleOut);

    if (essay.navigation === "default") {
      const pagePath = path.join(articleOut, "index.html");
      const page = fs.readFileSync(pagePath, "utf8");
      fs.writeFileSync(pagePath, injectNavigation(page, essay.slug));
    }
  }

  return { essays, outDir, recentLimit };
}

if (require.main === module) {
  try {
    const result = build();
    const recent = result.essays.slice(0, result.recentLimit).map((e) => e.slug);
    console.log(
      `Built ${result.essays.length} essay${result.essays.length === 1 ? "" : "s"} into ${path.relative(process.cwd(), result.outDir) || "."}`,
    );
    console.log(`Recent on Home: ${recent.join(", ") || "none"}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { build, injectNavigation, DEFAULT_SOURCE_ROOT };
