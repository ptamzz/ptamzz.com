const path = require("node:path");
const { loadEssays } = require("./lib/essays");

const sourceRoot = path.join(__dirname, "..");
const { essays, errors } = loadEssays(sourceRoot, { includeDrafts: true });

if (errors.length > 0) {
  console.error("Essay metadata is invalid:");
  for (const message of errors) {
    console.error(`  - ${message}`);
  }
  process.exit(1);
}

for (const essay of essays) {
  const flags = [essay.navigation, essay.draft ? "draft" : "published"];
  console.log(`ok  ${essay.date}  ${essay.slug}  (${flags.join(", ")})`);
}

console.log(`${essays.length} essay${essays.length === 1 ? "" : "s"} validated`);
