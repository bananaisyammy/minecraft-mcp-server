#!/usr/bin/env node
import { spawnSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Allow running only the build for testing: `--skip-start`
let args = process.argv.slice(2);
const skipStartIndex = args.indexOf("--skip-start");
const skipStart = skipStartIndex !== -1;
if (skipStart) args.splice(skipStartIndex, 1);

function runCommand(cmd, cmdArgs) {
  try {
    return spawnSync(cmd, cmdArgs, { stdio: "inherit" });
  } catch (err) {
    return { error: err };
  }
}

// Try npm first; if npm isn't available (ENOENT), fall back to local tsc / npx
async function buildProject() {
  console.log("Running build (npm run build)...");
  const npmBuild = runCommand("npm", ["run", "build"]);

  if (!npmBuild.error && npmBuild.status === 0) {
    return;
  }

  // If npm is not found, attempt fallbacks
  if (npmBuild.error && (npmBuild.error.code === "ENOENT" || npmBuild.error.code === "ENOTFOUND")) {
    console.warn("`npm` not found in PATH — attempting fallback build methods...");

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const projectRoot = path.resolve(__dirname, "..");

    // 1) Try local node_modules/.bin/tsc (Windows uses .cmd)
    const localTscBase = path.join(projectRoot, "node_modules", ".bin", "tsc");
    const localTscCmd = localTscBase + (process.platform === "win32" ? ".cmd" : "");
    if (fs.existsSync(localTscCmd) || fs.existsSync(localTscBase)) {
      const tscPath = fs.existsSync(localTscCmd) ? localTscCmd : localTscBase;
      console.log("Found local tsc:", tscPath);
      const r = runCommand(tscPath, ["-p", "tsconfig.build.json"]);
      if (r.error) {
        console.error("Local tsc failed:", r.error);
        process.exit(r.status || 1);
      }
      if (r.status !== 0) process.exit(r.status);
      return;
    }

    // 2) Try running the TypeScript bin via node (node node_modules/typescript/bin/tsc)
    const tscJs = path.join(projectRoot, "node_modules", "typescript", "bin", "tsc");
    if (fs.existsSync(tscJs)) {
      console.log("Found typescript bin tsc:", tscJs, " — running with node");
      const r = runCommand(process.execPath, [tscJs, "-p", "tsconfig.build.json"]);
      if (r.error) {
        console.error("Node-run tsc failed:", r.error);
        process.exit(r.status || 1);
      }
      if (r.status !== 0) process.exit(r.status);
      return;
    }

    // 3) Try npx tsc (if npx exists)
    console.log("Trying npx tsc...");
    const npxR = runCommand("npx", ["--yes", "tsc", "-p", "tsconfig.build.json"]);
    if (!npxR.error && npxR.status === 0) return;
    if (npxR.error) {
      console.error("npx run failed:", npxR.error);
    } else if (npxR.status !== 0) {
      process.exit(npxR.status);
    }

    console.error("Unable to run build: npm/npx/tsc not found or build failed.");
    console.error("Please install Node.js and npm, run `npm install`, then `npm run build` manually.");
    process.exit(1);
  } else if (npmBuild.error) {
    // npm existed but spawnSync threw another error
    console.error("Build failed:", npmBuild.error);
    process.exit(npmBuild.status || 1);
  } else {
    // npm run build ran but returned non-zero exit code
    if (npmBuild.status !== 0) process.exit(npmBuild.status);
  }
}

(async () => {
  await buildProject();

  if (skipStart) {
    console.log("Build finished; skipping server start (--skip-start).");
    process.exit(0);
  }

  console.log("Starting server...");
  const server = spawn(process.execPath, ["dist/main.js", ...args], { stdio: "inherit" });

  server.on("close", (code) => {
    process.exit(code ?? 0);
  });

  server.on("error", (err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
})();
