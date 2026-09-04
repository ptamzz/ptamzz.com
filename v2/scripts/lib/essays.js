const fs = require("node:fs");
const path = require("node:path");

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NAVIGATION_MODES = ["default", "custom"];
const HERO_TYPES = ["gradient", "image"];

const listDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function articlesDir(sourceRoot) {
  return path.join(sourceRoot, "essay", "articles");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatListDate(isoDate) {
  return listDateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

// Collection metadata only. Everything about how an article looks or behaves
// stays inside the article folder and is never read here.
function validateMeta(meta, folderName) {
  const errors = [];

  if (typeof meta !== "object" || meta === null || Array.isArray(meta)) {
    return [`${folderName}: meta.json must contain a JSON object`];
  }

  for (const field of ["slug", "title", "date", "excerpt"]) {
    if (typeof meta[field] !== "string" || meta[field].trim() === "") {
      errors.push(`${folderName}: "${field}" must be a non-empty string`);
    }
  }

  if (typeof meta.slug === "string" && !SLUG_PATTERN.test(meta.slug)) {
    errors.push(
      `${folderName}: "slug" must be lowercase words separated by single hyphens`,
    );
  }

  if (typeof meta.slug === "string" && meta.slug !== folderName) {
    errors.push(
      `${folderName}: "slug" must match the folder name (found "${meta.slug}")`,
    );
  }

  if (typeof meta.date === "string" && !DATE_PATTERN.test(meta.date)) {
    errors.push(`${folderName}: "date" must use YYYY-MM-DD format`);
  } else if (
    typeof meta.date === "string" &&
    Number.isNaN(new Date(`${meta.date}T00:00:00Z`).getTime())
  ) {
    errors.push(`${folderName}: "date" is not a real calendar date`);
  }

  if (
    meta.navigation !== undefined &&
    !NAVIGATION_MODES.includes(meta.navigation)
  ) {
    errors.push(
      `${folderName}: "navigation" must be one of ${NAVIGATION_MODES.join(", ")}`,
    );
  }

  if (meta.draft !== undefined && typeof meta.draft !== "boolean") {
    errors.push(`${folderName}: "draft" must be true or false`);
  }

  errors.push(...validateHero(meta.hero, folderName));

  return errors;
}

function validateHero(hero, folderName) {
  if (typeof hero !== "object" || hero === null || Array.isArray(hero)) {
    return [`${folderName}: "hero" must be an object`];
  }

  if (!HERO_TYPES.includes(hero.type)) {
    return [`${folderName}: "hero.type" must be one of ${HERO_TYPES.join(", ")}`];
  }

  const errors = [];

  if (hero.type === "gradient") {
    if (typeof hero.background !== "string" || hero.background.trim() === "") {
      errors.push(
        `${folderName}: gradient heroes need a non-empty "hero.background"`,
      );
    }
  }

  if (hero.type === "image") {
    if (typeof hero.src !== "string" || hero.src.trim() === "") {
      errors.push(`${folderName}: image heroes need a non-empty "hero.src"`);
    } else if (hero.src.startsWith("/") || hero.src.includes("..")) {
      errors.push(
        `${folderName}: "hero.src" must be a path inside the article folder`,
      );
    }

    if (hero.alt !== undefined && typeof hero.alt !== "string") {
      errors.push(`${folderName}: "hero.alt" must be a string`);
    }
  }

  return errors;
}

function readEssaySources(sourceRoot) {
  const dir = articlesDir(sourceRoot);

  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((folderName) => {
      const folder = path.join(dir, folderName);
      const metaPath = path.join(folder, "meta.json");
      const pagePath = path.join(folder, "index.html");
      const errors = [];
      let meta = null;

      if (!fs.existsSync(metaPath)) {
        errors.push(`${folderName}: missing meta.json`);
      } else {
        try {
          meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        } catch (error) {
          errors.push(`${folderName}: meta.json is not valid JSON (${error.message})`);
        }
      }

      if (!fs.existsSync(pagePath)) {
        errors.push(`${folderName}: missing index.html`);
      }

      if (meta) {
        errors.push(...validateMeta(meta, folderName));

        if (meta.hero?.type === "image" && typeof meta.hero.src === "string") {
          const heroPath = path.join(folder, meta.hero.src);
          if (!errors.length && !fs.existsSync(heroPath)) {
            errors.push(`${folderName}: hero image "${meta.hero.src}" not found`);
          }
        }
      }

      return { folderName, folder, meta, errors };
    });
}

function toEssay(source) {
  const { meta, folder, folderName } = source;

  return {
    slug: meta.slug,
    title: meta.title,
    date: meta.date,
    displayDate: formatListDate(meta.date),
    excerpt: meta.excerpt,
    hero: meta.hero,
    navigation: meta.navigation ?? "default",
    draft: meta.draft === true,
    href: `/essay/${meta.slug}`,
    folder,
    folderName,
  };
}

// Newest first. Slug breaks ties so a rebuild always produces identical output.
function sortEssays(essays) {
  return [...essays].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    return a.slug.localeCompare(b.slug);
  });
}

function loadEssays(sourceRoot, { includeDrafts = false } = {}) {
  const sources = readEssaySources(sourceRoot);
  const errors = sources.flatMap((source) => source.errors);

  if (errors.length > 0) {
    return { essays: [], errors };
  }

  const essays = sortEssays(sources.map(toEssay)).filter(
    (essay) => includeDrafts || !essay.draft,
  );

  return { essays, errors: [] };
}

function heroMarkup(essay) {
  if (essay.hero.type === "image") {
    const src = `/essay/${essay.slug}/${essay.hero.src.replace(/^\.\//, "")}`;
    const alt = essay.hero.alt ? escapeHtml(essay.hero.alt) : "";
    return `<img class="essay-hero" src="${escapeHtml(src)}" alt="${alt}" loading="lazy" />`;
  }

  return `<div class="essay-hero" style="background: ${escapeHtml(essay.hero.background)}" aria-hidden="true"></div>`;
}

function indent(lines, spaces) {
  const pad = " ".repeat(spaces);
  return lines.map((line) => (line === "" ? line : `${pad}${line}`)).join("\n");
}

function renderRecentCards(essays, { limit = 2, spaces = 12 } = {}) {
  const lines = essays.slice(0, limit).flatMap((essay) => [
    `<a class="recent-card" href="${escapeHtml(essay.href)}">`,
    `  <h3>${escapeHtml(essay.title)}</h3>`,
    `  <time datetime="${escapeHtml(essay.date)}">${escapeHtml(essay.displayDate)}</time>`,
    `</a>`,
  ]);

  lines.push(
    `<a class="recent-card recent-card-more" href="/essay">`,
    `  <h3>More</h3>`,
    `</a>`,
  );

  return indent(lines, spaces);
}

function renderEssayList(essays, { spaces = 8 } = {}) {
  const lines = essays.flatMap((essay) => [
    `<li>`,
    `  <a href="${escapeHtml(essay.href)}">`,
    `    ${heroMarkup(essay)}`,
    `    <div class="essay-meta">`,
    `      <h2 class="essay-title">${escapeHtml(essay.title)}</h2>`,
    `      <time datetime="${escapeHtml(essay.date)}">${escapeHtml(essay.displayDate)}</time>`,
    `    </div>`,
    `    <p class="essay-excerpt">${escapeHtml(essay.excerpt)}</p>`,
    `  </a>`,
    `</li>`,
  ]);

  return indent(lines, spaces);
}

function replaceRegion(source, name, replacement, label) {
  const start = `<!-- generated:${name}:start -->`;
  const end = `<!-- generated:${name}:end -->`;
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(
      `${label}: missing generated region markers for "${name}". Expected ${start} ... ${end}`,
    );
  }

  const before = source.slice(0, startIndex + start.length);
  const after = source.slice(endIndex);

  return `${before}\n${replacement}\n${" ".repeat(regionIndent(source, startIndex))}${after}`;
}

function regionIndent(source, startIndex) {
  const lineStart = source.lastIndexOf("\n", startIndex) + 1;
  return startIndex - lineStart;
}

module.exports = {
  DATE_PATTERN,
  HERO_TYPES,
  NAVIGATION_MODES,
  SLUG_PATTERN,
  articlesDir,
  escapeHtml,
  formatListDate,
  heroMarkup,
  loadEssays,
  readEssaySources,
  renderEssayList,
  renderRecentCards,
  replaceRegion,
  sortEssays,
  validateMeta,
};
