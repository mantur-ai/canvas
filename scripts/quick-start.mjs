#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const REQUIRED_NODE_MAJOR = 20;
const PROJECT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const IS_WINDOWS = process.platform === "win32";

function log(message) {
  console.log(`[Mantur Canvas] ${message}`);
}

function commandName(command) {
  return IS_WINDOWS ? `${command}.cmd` : command;
}

function run(command, args, options = {}) {
  const result = spawnSync(commandName(command), args, {
    cwd: PROJECT_DIR,
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.error) {
    log(`${command} failed: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function getOutput(command, args) {
  const result = spawnSync(commandName(command), args, {
    cwd: PROJECT_DIR,
    encoding: "utf8",
    shell: false,
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return result.stdout.trim();
}

function commandExists(command) {
  const lookupCommand = IS_WINDOWS ? "where" : "command";
  const lookupArgs = IS_WINDOWS ? [commandName(command)] : ["-v", command];
  const result = spawnSync(lookupCommand, lookupArgs, {
    cwd: PROJECT_DIR,
    stdio: "ignore",
    shell: !IS_WINDOWS,
  });

  return result.status === 0;
}

function ensureNode() {
  const majorVersion = Number(process.versions.node.split(".")[0]);

  if (majorVersion >= REQUIRED_NODE_MAJOR) {
    log(`Node.js ${process.version} detected.`);
    return;
  }

  log(`Node.js ${REQUIRED_NODE_MAJOR}+ is required. Current version is ${process.version}.`);
  log("Install Node.js 20 or later, then run npm run quick-start again.");
  process.exit(1);
}

function ensureNpm() {
  const npmVersion = getOutput("npm", ["-v"]);

  if (npmVersion) {
    log(`npm ${npmVersion} detected.`);
    return;
  }

  log("npm was not found. Install npm, then run npm run quick-start again.");
  process.exit(1);
}

function ensureOpencode() {
  if (commandExists("opencode")) {
    const version = getOutput("opencode", ["--version"]) ?? "installed";
    log(`opencode ${version} detected.`);
    return;
  }

  log("opencode was not found. Installing opencode globally...");
  run("npm", ["install", "-g", "opencode-ai"]);

  if (!commandExists("opencode")) {
    log("opencode installation completed, but the opencode command is not on PATH. Please reopen the terminal and run npm run quick-start again.");
    process.exit(1);
  }

  const version = getOutput("opencode", ["--version"]) ?? "installed";
  log(`opencode ${version} is ready.`);
}

function nextVersion() {
  const packageJson = JSON.parse(getOutput("node", ["-p", "JSON.stringify(require('./package.json'))"]) ?? "{}");
  const nextDependency = packageJson.dependencies?.next;

  if (typeof nextDependency !== "string") {
    log("Unable to find the Next.js dependency version in package.json.");
    process.exit(1);
  }

  return nextDependency.replace(/^[^0-9]*/, "");
}

function missingNextSwcLockEntries() {
  if (!existsSync(join(PROJECT_DIR, "package-lock.json"))) {
    return true;
  }

  const lockText = getOutput("node", ["-e", "process.stdout.write(require('node:fs').readFileSync('package-lock.json', 'utf8'))"]);

  if (!lockText) {
    return true;
  }

  const swcPackages = [
    "@next/swc-darwin-arm64",
    "@next/swc-darwin-x64",
    "@next/swc-linux-arm64-gnu",
    "@next/swc-linux-arm64-musl",
    "@next/swc-linux-x64-gnu",
    "@next/swc-linux-x64-musl",
    "@next/swc-win32-arm64-msvc",
    "@next/swc-win32-x64-msvc",
  ];

  return swcPackages.some((packageName) => !lockText.includes(`"node_modules/${packageName}"`));
}

function installDependencies() {
  log("Installing project dependencies...");
  run("npm", ["install"]);

  if (missingNextSwcLockEntries()) {
    log("Repairing Next.js SWC lockfile entries...");
    run("npm", ["install", "--package-lock-only", "--include=optional", `next@${nextVersion()}`]);
    run("npm", ["install"]);
  }
}

function copyMissingExampleFile(sourceFile, targetFile) {
  if (existsSync(targetFile)) {
    return;
  }

  mkdirSync(dirname(targetFile), { recursive: true });
  copyFileSync(sourceFile, targetFile);
}

function copyMissingExampleDir(sourceDir, targetDir) {
  if (!existsSync(sourceDir)) {
    return false;
  }

  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = join(sourceDir, entry);
    const targetPath = join(targetDir, relative(sourceDir, sourcePath));

    if (statSync(sourcePath).isDirectory()) {
      copyMissingExampleDir(sourcePath, targetPath);
      continue;
    }

    copyMissingExampleFile(sourcePath, targetPath);
  }

  return true;
}

function initializeExampleFiles() {
  log("Preparing local db and skills from example...");
  mkdirSync(join(PROJECT_DIR, "db"), { recursive: true });
  mkdirSync(join(PROJECT_DIR, "skills"), { recursive: true });

  copyMissingExampleDir(join(PROJECT_DIR, "example", "db"), join(PROJECT_DIR, "db"));
  copyMissingExampleDir(join(PROJECT_DIR, "example", "skills"), join(PROJECT_DIR, "skills"));
}

function main() {
  process.chdir(PROJECT_DIR);
  ensureNode();
  ensureNpm();
  ensureOpencode();
  installDependencies();
  initializeExampleFiles();

  log("Building Mantur Canvas for production...");
  run("npm", ["run", "build"]);

  log("Starting Mantur Canvas at http://localhost:3000");
  run("npm", ["run", "start"]);
}

main();
