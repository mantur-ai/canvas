// Temporary upload actions: validate generated names before serving project temp files.
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { v4 as createUuid } from "uuid";
import type { ProjectTempImage, ProjectTempImageInput } from "./shared";
import {
  PROJECT_IMAGE_FILE_PATTERN,
  TEMP_FILE_PATTERN,
  assertSafeProjectPath,
  getProjectImageFileNameFromUrl,
  getProjectImagesDir,
  getImageExtension,
  getProjectTempDir,
  getSafeFileExtension,
  getTempFileContentType,
  normalizeProjectImageAssets,
} from "./shared";

type SkillContextAttachmentInput = {
  fileName?: string;
  id: string;
  kind?: string;
  label?: string;
  name?: string;
  type?: string;
  url?: string;
};

type SkillContextFile = {
  id: string;
  kind: "image" | "temp";
  label: string;
  name: string;
  publicUrl?: string;
  relativePath: string;
  sourceUrl: string;
};

type SkillContextReference = {
  hasFile: boolean;
  id: string;
  kind: "image" | "temp";
  label: string;
  name: string;
  relativePath: string;
  sourceUrl: string;
};

const MENTION_ID_PATTERN = /@\{([^}]+)\}/g;
const SKILL_CONTEXT_DIR_NAME = "skill-context";
const UUID_DIR_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getMentionIds(text: string) {
  const ids = new Set<string>();
  for (const match of text.matchAll(MENTION_ID_PATTERN)) {
    const id = match[1]?.trim();
    if (id) ids.add(id);
  }

  return ids;
}

function getSafeContextFileName(params: {
  fallbackExtension: string;
  id: string;
  index: number;
  name: string;
}) {
  const extension = path.extname(params.name).replace(".", "").toLowerCase() || params.fallbackExtension;
  const safeExtension = /^[a-z0-9]{1,12}$/.test(extension) ? extension : params.fallbackExtension;
  const safeId = params.id.replace(/[^a-z0-9._-]/gi, "_").slice(0, 80) || "file";
  return `${String(params.index + 1).padStart(2, "0")}-${safeId}.${safeExtension}`;
}

function resolveSkillContextDir(projectId: string, contextDir: string) {
  const tempDir = getProjectTempDir(projectId);
  const skillContextRoot = path.resolve(tempDir, SKILL_CONTEXT_DIR_NAME);
  assertSafeProjectPath(skillContextRoot);

  const normalizedContextDir = contextDir.trim();
  const contextId = path.basename(normalizedContextDir);
  if (!UUID_DIR_PATTERN.test(contextId)) {
    throw new Error("Invalid skill context id.");
  }

  const resolvedDir = path.resolve(skillContextRoot, contextId);
  assertSafeProjectPath(resolvedDir);
  if (!resolvedDir.startsWith(`${skillContextRoot}${path.sep}`)) {
    throw new Error("Invalid skill context path.");
  }

  return resolvedDir;
}

export async function saveProjectTempImages(params: {
  projectId: string;
  images: ProjectTempImageInput[];
}): Promise<{ success: true; images: ProjectTempImage[] } | { success: false; error: string }> {
  try {
    const tempDir = getProjectTempDir(params.projectId);
    await mkdir(tempDir, { recursive: true });

    const images = await Promise.all(
      params.images.map(async (image) => {
        const id = createUuid();
        const extension = getImageExtension(image.contentType, image.name);
        const fileName = `${id}.${extension}`;
        const filePath = path.resolve(tempDir, fileName);
        assertSafeProjectPath(filePath);
        await writeFile(filePath, image.buffer);

        return {
          id,
          label: image.name || id,
          name: image.name,
          fileName,
          type: image.contentType,
          url: `/api/projects/${encodeURIComponent(params.projectId)}/temp/${encodeURIComponent(fileName)}`,
        };
      }),
    );

    return { success: true, images };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function saveProjectTempFiles(params: {
  projectId: string;
  files: ProjectTempImageInput[];
}): Promise<{ success: true; images: ProjectTempImage[] } | { success: false; error: string }> {
  try {
    const tempDir = getProjectTempDir(params.projectId);
    await mkdir(tempDir, { recursive: true });

    const images = await Promise.all(
      params.files.map(async (file) => {
        const id = createUuid();
        const extension = file.contentType.startsWith("image/")
          ? getImageExtension(file.contentType, file.name)
          : getSafeFileExtension(file.name);
        const fileName = `${id}.${extension}`;
        const filePath = path.resolve(tempDir, fileName);
        assertSafeProjectPath(filePath);
        await writeFile(filePath, file.buffer);

        return {
          id,
          label: file.name || id,
          name: file.name,
          fileName,
          type: file.contentType || "application/octet-stream",
          url: `/api/projects/${encodeURIComponent(params.projectId)}/temp/${encodeURIComponent(fileName)}`,
        };
      }),
    );

    return { success: true, images };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function readProjectTempImage(params: {
  projectId: string;
  fileName: string;
}): Promise<
  { success: true; buffer: Buffer; contentType: string } | { success: false; error: string }
> {
  try {
    if (!TEMP_FILE_PATTERN.test(params.fileName)) {
      return { success: false, error: "INVALID_TEMP_FILE_NAME" };
    }

    const filePath = path.resolve(getProjectTempDir(params.projectId), params.fileName);
    assertSafeProjectPath(filePath);
    const buffer = await readFile(filePath);

    return {
      success: true,
      buffer,
      contentType: getTempFileContentType(params.fileName),
    };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function createProjectSkillContext(params: {
  attachments: SkillContextAttachmentInput[];
  projectId: string;
  text: string;
}): Promise<
  {
    success: true;
    contextDir: string;
    files: SkillContextFile[];
    manifestPath: string;
    references: SkillContextReference[];
  }
  | { success: false; error: string }
> {
  try {
    const tempDir = getProjectTempDir(params.projectId);
    const contextId = createUuid();
    const contextDir = path.resolve(tempDir, SKILL_CONTEXT_DIR_NAME, contextId);
    assertSafeProjectPath(contextDir);
    await mkdir(contextDir, { recursive: true });

    const mentionIds = getMentionIds(params.text);
    params.attachments.forEach((attachment) => {
      if (attachment.id) mentionIds.add(attachment.id);
    });

    const files: SkillContextFile[] = [];
    const references = new Map<string, SkillContextReference>();
    const copiedIds = new Set<string>();
    const upsertReference = (reference: SkillContextReference) => {
      const currentReference = references.get(reference.id);
      if (currentReference?.hasFile && !reference.hasFile) return;
      references.set(reference.id, reference);
    };
    const copyContextFile = async (input: {
      fallbackExtension: string;
      id: string;
      kind: SkillContextFile["kind"];
      label: string;
      name: string;
      publicUrl?: string;
      sourcePath: string;
      sourceUrl: string;
    }) => {
      if (copiedIds.has(input.id)) return;
      assertSafeProjectPath(input.sourcePath);
      const fileName = getSafeContextFileName({
        fallbackExtension: input.fallbackExtension,
        id: input.id,
        index: files.length,
        name: input.name,
      });
      const targetPath = path.resolve(contextDir, fileName);
      assertSafeProjectPath(targetPath);
      await copyFile(input.sourcePath, targetPath);
      copiedIds.add(input.id);
      const file = {
        id: input.id,
        kind: input.kind,
        label: input.label,
        name: input.name,
        ...(input.publicUrl ? { publicUrl: input.publicUrl } : {}),
        relativePath: fileName,
        sourceUrl: input.sourceUrl,
      };
      files.push(file);
      upsertReference({
        ...file,
        hasFile: true,
      });
    };

    const tempAttachments = params.attachments.filter((attachment) => attachment.fileName);
    await Promise.all(
      tempAttachments.map(async (attachment) => {
        const fileName = attachment.fileName ?? "";
        if (!TEMP_FILE_PATTERN.test(fileName)) return;

        await copyContextFile({
          fallbackExtension: getSafeFileExtension(fileName),
          id: attachment.id,
          kind: "temp",
          label: attachment.label || attachment.name || attachment.id,
          name: attachment.name || fileName,
          sourcePath: path.resolve(tempDir, fileName),
          sourceUrl: attachment.url || `/api/projects/${encodeURIComponent(params.projectId)}/temp/${encodeURIComponent(fileName)}`,
        });
      }),
    );

    const projectImages = await normalizeProjectImageAssets(params.projectId).catch(() => []);
    await Promise.all(
      projectImages
        .filter((image) => mentionIds.has(image.id))
        .map(async (image) => {
          const fileName = getProjectImageFileNameFromUrl(params.projectId, image.url);
          const label = image.name || image.id;
          upsertReference({
            hasFile: false,
            id: image.id,
            kind: "image",
            label,
            name: label,
            ...(image.publicUrl ? { publicUrl: image.publicUrl } : {}),
            relativePath: "",
            sourceUrl: image.url,
          });
          if (!fileName || !PROJECT_IMAGE_FILE_PATTERN.test(fileName)) return;

          await copyContextFile({
            fallbackExtension: getSafeFileExtension(fileName),
            id: image.id,
            kind: "image",
            label,
            name: image.name || fileName,
            publicUrl: image.publicUrl,
            sourcePath: path.resolve(getProjectImagesDir(params.projectId), fileName),
            sourceUrl: image.url,
          }).catch(() => {
            // Keep the semantic reference available even when the backing file is missing.
          });
        }),
    );

    const manifestPath = path.resolve(contextDir, "context.json");
    assertSafeProjectPath(manifestPath);
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          files,
          projectId: params.projectId,
          references: [...references.values()],
        },
        null,
        2,
      ),
      "utf8",
    );

    return {
      success: true,
      contextDir: path.relative(process.cwd(), contextDir),
      files,
      manifestPath: path.relative(process.cwd(), manifestPath),
      references: [...references.values()],
    };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function deleteProjectSkillContext(params: {
  contextDir: string;
  projectId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const contextDir = resolveSkillContextDir(params.projectId, params.contextDir);
    await rm(contextDir, { force: true, recursive: true });

    return { success: true };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}
