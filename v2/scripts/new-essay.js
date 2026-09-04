const fs = require("node:fs");
const path = require("node:path");

const { SLUG_PATTERN, DATE_PATTERN, articlesDir } = require("./lib/essays");

const TEMPLATE_DIR = path.join(__dirname, "templates", "article");
const DEFAULT_EXCERPT = "One-sentence summary shown on Home and the essay index.";

const longDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function parseArgs(argv) {
  const options = { dryRun: false, slug: null, title: null, date: null };
  const rest = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--title" || arg === "--date") {
      const value = argv[index + 1];
      if (value === undefined) {
        throw new Error(`${arg} needs a value`);
      }
      options[arg.slice(2)] = value;
      index += 1;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option ${arg}`);
    } else {
      rest.push(arg);
    }
  }

  options.slug = rest[0] ?? null;
  return options;
}

function titleFromSlug(slug) {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    key in values ? values[key] : match,
  );
}

function scaffold(options, sourceRoot = path.join(__dirname, "..")) {
  const { slug } = options;

  if (!slug) {
    throw new Error("Usage: npm run new:essay -- <slug> [--title ...] [--date YYYY-MM-DD] [--dry-run]");
  }

  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(
      `"${slug}" is not a valid slug. Use lowercase words separated by single hyphens.`,
    );
  }

  const date = options.date ?? today();
  if (!DATE_PATTERN.test(date)) {
    throw new Error(`"${date}" is not a valid date. Use YYYY-MM-DD.`);
  }

  const folder = path.join(articlesDir(sourceRoot), slug);
  if (fs.existsSync(folder)) {
    throw new Error(`${path.relative(sourceRoot, folder)} already exists`);
  }

  const values = {
    slug,
    title: options.title ?? titleFromSlug(slug),
    date,
    longDate: longDateFormatter.format(new Date(`${date}T00:00:00Z`)),
    excerpt: DEFAULT_EXCERPT,
  };

  const files = fs
    .readdirSync(TEMPLATE_DIR)
    .sort()
    .map((name) => ({
      name,
      target: path.join(folder, name),
      contents: fill(fs.readFileSync(path.join(TEMPLATE_DIR, name), "utf8"), values),
    }));

  if (!options.dryRun) {
    fs.mkdirSync(folder, { recursive: true });
    for (const file of files) {
      fs.writeFileSync(file.target, file.contents);
    }
  }

  return { folder, files, values, dryRun: options.dryRun };
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = scaffold(options);
    const sourceRoot = path.join(__dirname, "..");
    const label = result.dryRun ? "would create" : "created";

    console.log(`${label} ${path.relative(sourceRoot, result.folder)}/`);
    for (const file of result.files) {
      console.log(`  ${label} ${path.relative(sourceRoot, file.target)}`);
    }
    console.log(
      `  title: ${result.values.title}\n  date:  ${result.values.date}\n  hero:  gradient (swap for an image in meta.json)`,
    );
    if (!result.dryRun) {
      console.log("\nNext: edit the folder, then run `npm run build`.");
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { parseArgs, scaffold, titleFromSlug };
