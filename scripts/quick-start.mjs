#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const REQUIRED_NODE_MAJOR = 24;
const PM2_APP_NAME = "mantur-canvas";
const APP_URL = "http://localhost:3000";
const NPM_REGISTRY = "https://registry.npmmirror.com";
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
  log(`Install Node.js ${REQUIRED_NODE_MAJOR} or later, then run npm run quick-start again.`);
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

function useNpmMirror() {
  log(`Configuring npm registry: ${NPM_REGISTRY}`);
  run("npm", ["config", "set", "registry", NPM_REGISTRY]);
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

function ensurePm2() {
  if (commandExists("pm2")) {
    const version = getOutput("pm2", ["--version"]) ?? "installed";
    log(`pm2 ${version} detected.`);
    return;
  }

  log("pm2 was not found. Installing pm2 globally...");
  run("npm", ["install", "-g", "pm2"]);

  if (!commandExists("pm2")) {
    log("pm2 installation completed, but the pm2 command is not on PATH. Please reopen the terminal and run npm run quick-start again.");
    process.exit(1);
  }

  const version = getOutput("pm2", ["--version"]) ?? "installed";
  log(`pm2 ${version} is ready.`);
}

function startWithPm2() {
  const status = pm2AppStatus();

  if (status === "online") {
    log(`Restarting Mantur Canvas with pm2 at ${APP_URL}`);
    run("npm", ["run", "pm2:reload"]);
    return;
  }

  if (status !== "missing" && status !== "unknown") {
    log(`Removing existing PM2 app in ${status} status before starting...`);
    run("npm", ["run", "pm2:delete"]);
  }

  log(`Starting Mantur Canvas with pm2 at ${APP_URL}`);
  run("npm", ["run", "pm2:start"]);
}

function pm2AppStatus() {
  const output = getOutput("pm2", ["jlist"]);

  if (!output) {
    return "unknown";
  }

  try {
    const apps = JSON.parse(output);
    const app = apps.find((item) => item?.name === PM2_APP_NAME);
    return app?.pm2_env?.status ?? "missing";
  } catch {
    return "unknown";
  }
}

function showPm2Diagnostics() {
  log("PM2 status:");
  run("pm2", ["status"]);
  log(`Recent PM2 logs for ${PM2_APP_NAME}:`);
  run("pm2", ["logs", PM2_APP_NAME, "--lines", "80", "--nostream"]);
}

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function waitForPm2Online() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const status = pm2AppStatus();

    if (status === "online") {
      log("PM2 app is online.");
      return true;
    }

    if (status === "stopped" || status === "errored") {
      log(`PM2 app status is ${status}.`);
      return false;
    }

    wait(1000);
  }

  log("PM2 app did not become online in time.");
  return false;
}

function isAppUrlReady() {
  const result = spawnSync(commandName("node"), ["-e", `
fetch(process.argv[1])
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
`, APP_URL], {
    cwd: PROJECT_DIR,
    stdio: "ignore",
    shell: false,
  });

  return result.status === 0;
}

function waitForAppUrl() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (isAppUrlReady()) {
      log(`Mantur Canvas is ready at ${APP_URL}`);
      return true;
    }

    wait(1000);
  }

  log(`Mantur Canvas did not respond at ${APP_URL} in time.`);
  return false;
}

function openAppUrl() {
  log(`Opening Mantur Canvas at ${APP_URL}`);

  if (IS_WINDOWS) {
    spawnSync("cmd", ["/c", "start", "", APP_URL], { stdio: "ignore", shell: false });
    return;
  }

  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  spawnSync(opener, [APP_URL], { stdio: "ignore", shell: false });
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

  const dbDir = join(PROJECT_DIR, "db");
  if (existsSync(join(dbDir, "config.json"))) {
    log("db/config.json already exists. Skipping example db copy.");
  } else {
    mkdirSync(dbDir, { recursive: true });
    copyMissingExampleDir(join(PROJECT_DIR, "example", "db"), dbDir);
  }

  const skillsDir = join(PROJECT_DIR, "skills");
  if (existsSync(skillsDir)) {
    log("skills directory already exists. Skipping example skills copy.");
  } else {
    mkdirSync(skillsDir, { recursive: true });
    copyMissingExampleDir(join(PROJECT_DIR, "example", "skills"), skillsDir);
  }
}

function main() {
  process.chdir(PROJECT_DIR);
  ensureNode();
  ensureNpm();
  useNpmMirror();
  ensureOpencode();
  ensurePm2();
  installDependencies();
  initializeExampleFiles();

  log("Building Mantur Canvas for production...");
  run("npm", ["run", "build"]);

  startWithPm2();
  if (!waitForPm2Online()) {
    showPm2Diagnostics();
    process.exit(1);
  }

  if (!waitForAppUrl()) {
    showPm2Diagnostics();
    process.exit(1);
  }

  openAppUrl();
}

main();
