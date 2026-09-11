const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const scriptsRoot = __dirname;
const buildEntry = path.join(scriptsRoot, "build.js");
const serverEntry = path.join(projectRoot, "server.js");
const DEBOUNCE_MS = 120;

// Build inputs only. Watching dist would make each build retrigger itself.
const watchTargets = [
  "index.html",
  "favicon.png",
  "essay",
  "shared",
  "scripts",
  "server.js",
];

function runBuild() {
  // Drop cached build modules so edits to the build itself take effect.
  for (const id of Object.keys(require.cache)) {
    if (id !== __filename && id.startsWith(scriptsRoot + path.sep)) {
      delete require.cache[id];
    }
  }

  try {
    const { build } = require(buildEntry);
    const { essays } = build();
    console.log(
      `[dev] rebuilt ${essays.length} essay${essays.length === 1 ? "" : "s"}`,
    );
    return true;
  } catch (error) {
    console.error(`[dev] build failed, serving previous output: ${error.message}`);
    return false;
  }
}

let child = null;
let restarting = false;

function startServer() {
  child = spawn(process.execPath, [serverEntry], {
    cwd: projectRoot,
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    child = null;
    if (restarting) return;
    process.exit(code ?? 0);
  });
}

function restartServer() {
  if (!child) {
    startServer();
    return;
  }

  restarting = true;
  child.once("exit", () => {
    restarting = false;
    startServer();
  });
  child.kill("SIGTERM");
}

let pending = null;
let serverChanged = false;

function scheduleRebuild(changedPath) {
  if (changedPath === serverEntry) {
    serverChanged = true;
  }

  clearTimeout(pending);
  pending = setTimeout(() => {
    runBuild();
    // Pages are read from disk per request, so only server code needs a restart.
    if (serverChanged) {
      serverChanged = false;
      console.log("[dev] restarting server");
      restartServer();
    }
  }, DEBOUNCE_MS);
}

function watch(target) {
  const absolute = path.join(projectRoot, target);
  if (!fs.existsSync(absolute)) return;

  const recursive = fs.statSync(absolute).isDirectory();

  try {
    fs.watch(absolute, { recursive }, (_event, filename) => {
      scheduleRebuild(filename ? path.join(absolute, filename) : absolute);
    });
  } catch (error) {
    console.warn(`[dev] cannot watch ${target}: ${error.message}`);
  }
}

if (!runBuild() && !fs.existsSync(path.join(projectRoot, "dist", "index.html"))) {
  process.exitCode = 1;
} else {
  for (const target of watchTargets) {
    watch(target);
  }

  console.log("[dev] watching for changes");
  startServer();

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      restarting = false;
      if (child) child.kill(signal);
      process.exit(0);
    });
  }
}
