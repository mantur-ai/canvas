import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { SKILL_FOLDER_CATEGORIES, type SkillFolderCategory } from "@/lib/skill-categories";

export type SkillFolder = {
  name: string;
  fileCount: number;
};

type UploadSkillFile = {
  relativePath: string;
  content: ArrayBuffer;
};

const PROJECT_ROOT = process.cwd();
const SKILLS_DIR = path.resolve(PROJECT_ROOT, "skills");
const SAFE_FOLDER_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function assertSafeSkillsPath(targetPath: string) {
  if (targetPath !== SKILLS_DIR && !targetPath.startsWith(`${SKILLS_DIR}${path.sep}`)) {
    throw new Error("Invalid skills path.");
  }
}

function validateFolderName(folderName: string) {
  if (!SAFE_FOLDER_NAME_PATTERN.test(folderName)) {
    throw new Error("Invalid skill folder name.");
  }
}

function validateSkillCategory(folderName: string): SkillFolderCategory {
  validateFolderName(folderName);
  if (!SKILL_FOLDER_CATEGORIES.includes(folderName as SkillFolderCategory)) {
    throw new Error("Invalid skill category.");
  }

  return folderName as SkillFolderCategory;
}

function validateRelativePath(relativePath: string) {
  const normalized = path.normalize(relativePath);
  if (
    normalized.startsWith("..") ||
    path.isAbsolute(normalized) ||
    normalized.split(path.sep).some((part) => part === ".." || part === "")
  ) {
    throw new Error("Invalid upload path.");
  }
  return normalized;
}

async function ensureSkillsDir() {
  assertSafeSkillsPath(SKILLS_DIR);
  await mkdir(SKILLS_DIR, { recursive: true });
}

async function countFiles(folderPath: string): Promise<number> {
  const entries = await readdir(folderPath, { withFileTypes: true });
  const counts = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.resolve(folderPath, entry.name);
      assertSafeSkillsPath(entryPath);
      if (entry.isDirectory()) return countFiles(entryPath);
      return entry.isFile() ? 1 : 0;
    }),
  );
  return counts.reduce((total, count) => total + count, 0);
}

export async function listSkillFolders(): Promise<SkillFolder[]> {
  await ensureSkillsDir();

  try {
    const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
    const folders = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const folderPath = path.resolve(SKILLS_DIR, entry.name);
          assertSafeSkillsPath(folderPath);
          return {
            name: entry.name,
            fileCount: await countFiles(folderPath),
          };
        }),
    );

    return folders.sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return [];
  }
}

function rebaseUploadPath(relativePath: string, targetFolderName: SkillFolderCategory) {
  const normalizedPath = validateRelativePath(relativePath);
  const pathParts = normalizedPath.split(path.sep);
  const filePathInsideFolder =
    pathParts.length > 1 ? pathParts.slice(1).join(path.sep) : pathParts[0];

  return path.join(targetFolderName, filePathInsideFolder);
}

export async function uploadSkillFolder(
  files: UploadSkillFile[],
  targetFolderName?: string,
): Promise<SkillFolder> {
  await ensureSkillsDir();
  if (files.length === 0) throw new Error("No files selected.");

  const folderName = targetFolderName
    ? validateSkillCategory(targetFolderName)
    : validateSkillCategory(validateRelativePath(files[0].relativePath).split(path.sep)[0]);
  const normalizedFiles = files.map((file) => ({
    ...file,
    relativePath: targetFolderName
      ? rebaseUploadPath(file.relativePath, folderName)
      : validateRelativePath(file.relativePath),
  }));

  const folderPath = path.resolve(SKILLS_DIR, folderName);
  assertSafeSkillsPath(folderPath);
  await mkdir(folderPath, { recursive: true });

  await Promise.all(
    normalizedFiles.map(async (file) => {
      const targetPath = path.resolve(SKILLS_DIR, file.relativePath);
      assertSafeSkillsPath(targetPath);
      if (!targetPath.startsWith(`${folderPath}${path.sep}`) && targetPath !== folderPath) {
        throw new Error("Upload contains files outside the selected folder.");
      }

      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, Buffer.from(file.content));
    }),
  );

  return {
    name: folderName,
    fileCount: await countFiles(folderPath),
  };
}

export async function deleteSkillFolder(folderName: string): Promise<void> {
  validateFolderName(folderName);
  const folderPath = path.resolve(SKILLS_DIR, folderName);
  assertSafeSkillsPath(folderPath);
  await rm(folderPath, { recursive: true, force: true });
}
