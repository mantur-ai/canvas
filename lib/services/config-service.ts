import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { appConfigSchema, DEFAULT_WORKFLOW_SKILLS, type AppConfig } from "@/lib/config-schema";
import { withFixedProviderConfig } from "@/lib/fixed-providers";

const PROJECT_ROOT = process.cwd();
const CONFIG_DB_DIR = path.resolve(PROJECT_ROOT, "db");
const CONFIG_DB_PATH = path.resolve(CONFIG_DB_DIR, "config.json");

const EMPTY_CONFIG: AppConfig = {
  imageModels: [],
  videoModels: [],
  imageBeds: [],
  workflowSkills: DEFAULT_WORKFLOW_SKILLS,
};

function assertSafeConfigPath(targetPath: string) {
  if (targetPath !== CONFIG_DB_DIR && !targetPath.startsWith(`${CONFIG_DB_DIR}${path.sep}`)) {
    throw new Error("Invalid config database path.");
  }
}

async function writeConfigFile(config: AppConfig) {
  assertSafeConfigPath(CONFIG_DB_DIR);
  assertSafeConfigPath(CONFIG_DB_PATH);
  await mkdir(CONFIG_DB_DIR, { recursive: true });
  await writeFile(CONFIG_DB_PATH, JSON.stringify(config, null, 2), "utf8");
}

async function ensureConfigFile() {
  assertSafeConfigPath(CONFIG_DB_DIR);
  assertSafeConfigPath(CONFIG_DB_PATH);
  await mkdir(CONFIG_DB_DIR, { recursive: true });

  try {
    await readFile(CONFIG_DB_PATH, "utf8");
  } catch {
    await writeConfigFile(EMPTY_CONFIG);
  }
}

export async function readConfig(): Promise<AppConfig> {
  await ensureConfigFile();

  try {
    const raw = await readFile(CONFIG_DB_PATH, "utf8");
    return withFixedProviderConfig(appConfigSchema.parse(JSON.parse(raw)));
  } catch {
    const fixedConfig = withFixedProviderConfig(EMPTY_CONFIG);
    await writeConfigFile(fixedConfig);
    return fixedConfig;
  }
}

export async function writeConfig(config: AppConfig): Promise<AppConfig> {
  const validated = withFixedProviderConfig(appConfigSchema.parse(config));
  await writeConfigFile(validated);
  return validated;
}
