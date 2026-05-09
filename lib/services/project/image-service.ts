// Image asset actions: normalize metadata, write uploads, and link assets to storyboards.
import { appendFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { v4 as createUuid } from "uuid";
import type { ProjectDetail, ProjectImageAsset, ProjectStoryboard } from "@/lib/project-types";
import type { CreateProjectImageInput, ProjectTempImageInput } from "./shared";
import {
  IMAGE_FILE_PATTERN,
  PROJECT_IMAGE_FILE_PATTERN,
  addImageToProjectAssets,
  assertSafeProjectPath,
  downloadRemoteGeneratedFile,
  getImageExtensionFromUrl,
  getImageExtension,
  getProjectDir,
  getProjectImageFileNameFromUrl,
  getTempFileContentType,
  isRecord,
  normalizeProjectImageAssets,
  normalizeProjectImageRecords,
  normalizeProjectImageType,
  readCurrentProjectDetail,
  readProjectDetail,
  readString,
  updateProjectStoryboard,
  writeCurrentProjectDetail,
  writeProjectDetail,
} from "./shared";

export async function getProjectImages(
  projectId: string,
): Promise<{ success: true; images: ProjectImageAsset[] } | { success: false; error: string }> {
  try {
    const images = await normalizeProjectImageAssets(projectId);
    return { success: true, images };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

function normalizeAssetMatchKey(type: string, name: string): string {
  return `${type}::${name.trim().toLowerCase()}`;
}

function isHttpUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

async function isReachablePublicUrl(url: string) {
  if (!isHttpUrl(url)) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const headResponse = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    if (headResponse.ok) return true;
    if (headResponse.status !== 405 && headResponse.status !== 403) return false;

    const getResponse = await fetch(url, {
      headers: { Range: "bytes=0-0" },
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    return getResponse.ok || getResponse.status === 206;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function getImageExtensionFromBuffer(buffer: Buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return "jpg";
  }
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  if (buffer.subarray(0, 3).toString("ascii") === "GIF") {
    return "gif";
  }
  return "";
}

function readGeneratedImageBase64(value: string) {
  const trimmed = value.trim();
  const dataUrlMatch = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(trimmed);
  const base64Text = (dataUrlMatch ? (dataUrlMatch[2] ?? "") : trimmed).replace(/\s/g, "");
  if (!base64Text || !/^[a-z0-9+/]+={0,2}$/i.test(base64Text)) return null;

  const buffer = Buffer.from(base64Text, "base64");
  if (buffer.length === 0 || buffer.length > 30 * 1024 * 1024) return null;

  const extension =
    (dataUrlMatch?.[1] ? getImageExtension(dataUrlMatch[1], `generated.${dataUrlMatch[1].split("/")[1] ?? "png"}`) : "") ||
    getImageExtensionFromBuffer(buffer);
  if (!extension) return null;

  return { buffer, extension };
}

const GENERATED_BASE64_UPLOAD_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const GENERATED_BASE64_CHUNK_MAX_LENGTH = 1024 * 1024;

function getGeneratedBase64ChunkPath(projectId: string, uploadId: string) {
  if (!GENERATED_BASE64_UPLOAD_ID_PATTERN.test(uploadId)) {
    throw new Error("INVALID_GENERATED_BASE64_UPLOAD_ID");
  }

  const chunkDir = path.resolve(getProjectDir(projectId), "images", ".generated-base64");
  const chunkPath = path.resolve(chunkDir, `${uploadId}.txt`);
  assertSafeProjectPath(chunkDir);
  assertSafeProjectPath(chunkPath);
  return { chunkDir, chunkPath };
}

function normalizeGeneratedBase64Chunk(chunk: string) {
  const normalized = chunk.replace(/\s/g, "");
  if (
    !normalized ||
    normalized.length > GENERATED_BASE64_CHUNK_MAX_LENGTH ||
    !/^[a-z0-9+/]+={0,2}$/i.test(normalized)
  ) {
    throw new Error("INVALID_GENERATED_BASE64_CHUNK");
  }

  return normalized;
}

export async function appendGeneratedProjectImageBase64Chunk(params: {
  chunk: string;
  projectId: string;
  reset?: boolean;
  uploadId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { chunkDir, chunkPath } = getGeneratedBase64ChunkPath(params.projectId, params.uploadId);
    await mkdir(chunkDir, { recursive: true });
    if (params.reset) {
      await writeFile(chunkPath, "", "utf8");
    }
    await appendFile(chunkPath, normalizeGeneratedBase64Chunk(params.chunk), "utf8");
    return { success: true };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function finalizeGeneratedProjectImageBase64Chunks(params: {
  category?: string;
  imageId: string;
  name?: string;
  parentId?: string;
  projectId: string;
  source?: string;
  uploadId: string;
}): Promise<{ success: true; image: ProjectImageAsset; images: ProjectImageAsset[] } | { success: false; error: string }> {
  try {
    const { chunkPath } = getGeneratedBase64ChunkPath(params.projectId, params.uploadId);
    const resultBase64 = await readFile(chunkPath, "utf8");
    const result = await storeGeneratedProjectImage({
      category: params.category,
      imageId: params.imageId,
      name: params.name,
      parentId: params.parentId,
      projectId: params.projectId,
      resultBase64,
      source: params.source,
    });
    if (!result.success) return result;

    await rm(chunkPath, { force: true });
    return result;
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function replaceProjectImages(params: {
  images: unknown;
  projectId: string;
}): Promise<
  | { success: true; images: ProjectImageAsset[]; project: ProjectDetail | null }
  | { success: false; error: string }
> {
  try {
    const projectDir = getProjectDir(params.projectId);
    const imagesDir = path.resolve(projectDir, "images");
    const imagesJsonPath = path.resolve(imagesDir, "images.json");
    assertSafeProjectPath(imagesDir);
    assertSafeProjectPath(imagesJsonPath);

    if (!Array.isArray(params.images)) {
      return { success: false, error: "INVALID_IMAGES_PAYLOAD" };
    }

    // Read existing catalog so the skill never has to know prior IDs or generated URLs;
    // we re-attach them by (type, name) match before normalization runs.
    const existing = await readFile(imagesJsonPath, "utf8")
      .then((content) => normalizeProjectImageRecords(JSON.parse(content)).images)
      .catch((): ProjectImageAsset[] => []);
    const existingByKey = new Map<string, ProjectImageAsset>();
    existing.forEach((asset) => {
      if (!asset.name) return;
      const key = normalizeAssetMatchKey(asset.type, asset.name);
      if (!existingByKey.has(key)) existingByKey.set(key, asset);
    });

    const merged = params.images.map((entry) => {
      if (!isRecord(entry)) return entry;

      const type = normalizeProjectImageType(entry.type);
      const name = readString(entry.name);
      const match = name ? existingByKey.get(normalizeAssetMatchKey(type, name)) : undefined;
      const textOnlyEntry = {
        name,
        type,
        source: readString(entry.source) || "generate",
        prompt: readString(entry.prompt) || readString(entry.description),
      };
      if (!match) return textOnlyEntry;

      return {
        ...textOnlyEntry,
        id: match.id,
        publicUrl: match.publicUrl,
        publicUrlUpdatedAt: match.publicUrlUpdatedAt,
        source: match.source || textOnlyEntry.source,
        url: match.url,
      };
    });

    const normalized = normalizeProjectImageRecords(merged);

    await mkdir(imagesDir, { recursive: true });
    await writeFile(imagesJsonPath, JSON.stringify(normalized.images, null, 2), "utf8");

    // normalizeProjectImageAssets re-reads images.json, syncs project.json.assets,
    // and remaps any storyboard image references to the surviving IDs.
    const images = await normalizeProjectImageAssets(params.projectId);
    const project = await readProjectDetail(params.projectId).catch(() => null);

    return { success: true, images, project };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function deleteProjectImage(params: {
  projectId: string;
  imageId: string;
}): Promise<{ success: true; images: ProjectImageAsset[] } | { success: false; error: string }> {
  try {
    const imagesJsonPath = path.resolve(getProjectDir(params.projectId), "images", "images.json");
    assertSafeProjectPath(imagesJsonPath);

    const images = await normalizeProjectImageAssets(params.projectId);
    const nextImages = images.filter((image) => image.id !== params.imageId);

    await writeFile(imagesJsonPath, JSON.stringify(nextImages, null, 2), "utf8");

    return { success: true, images: nextImages };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function createProjectImage(params: {
  image: CreateProjectImageInput;
  projectId: string;
}): Promise<
  { success: true; image: ProjectImageAsset; images: ProjectImageAsset[]; project: ProjectDetail | null } | { success: false; error: string }
> {
  try {
    const projectDir = getProjectDir(params.projectId);
    const imagesDir = path.resolve(projectDir, "images");
    const imagesJsonPath = path.resolve(imagesDir, "images.json");
    assertSafeProjectPath(imagesDir);
    assertSafeProjectPath(imagesJsonPath);

    await mkdir(imagesDir, { recursive: true });

    const id = createUuid();
    let url = "";

    if (params.image.image) {
      const extension = getImageExtension(params.image.image.contentType, params.image.image.name);
      const fileName = `image-${id}.${extension}`;
      const filePath = path.resolve(imagesDir, fileName);
      assertSafeProjectPath(filePath);
      await writeFile(filePath, params.image.image.buffer);
      url = `/api/projects/${encodeURIComponent(params.projectId)}/images/${encodeURIComponent(fileName)}`;
    }

    const currentImages = await normalizeProjectImageAssets(params.projectId);
    const imageType = normalizeProjectImageType(params.image.category);
    const image: ProjectImageAsset = {
      id,
      name: params.image.name,
      publicUrl: "",
      publicUrlUpdatedAt: "",
      type: imageType,
      source: params.image.source,
      prompt: params.image.prompt,
      url,
    };
    const images = [image, ...currentImages];

    await writeFile(imagesJsonPath, JSON.stringify(images, null, 2), "utf8");
    const project = await readProjectDetail(params.projectId).catch(() => null);
    const nextProject = project
      ? addImageToProjectAssets(project, {
        category: imageType,
        imageId: id,
        parentId: params.image.parentId,
      })
      : null;

    if (nextProject && nextProject !== project) {
      await writeProjectDetail(nextProject);
      const currentProject = await readCurrentProjectDetail().catch(() => null);
      if (currentProject?.id === nextProject.id) {
        await writeCurrentProjectDetail(nextProject);
      }
    }

    return { success: true, image, images, project: nextProject };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function updateProjectImageFile(params: {
  file: ProjectTempImageInput;
  imageId: string;
  projectId: string;
}): Promise<{ success: true; image: ProjectImageAsset; images: ProjectImageAsset[] } | { success: false; error: string }> {
  try {
    const projectDir = getProjectDir(params.projectId);
    const imagesDir = path.resolve(projectDir, "images");
    const imagesJsonPath = path.resolve(imagesDir, "images.json");
    assertSafeProjectPath(imagesDir);
    assertSafeProjectPath(imagesJsonPath);

    await mkdir(imagesDir, { recursive: true });
    const currentImages = await normalizeProjectImageAssets(params.projectId);
    const currentImage = currentImages.find((image) => image.id === params.imageId);
    if (!currentImage) return { success: false, error: "IMAGE_NOT_FOUND" };

    const extension = getImageExtension(params.file.contentType, params.file.name);
    const fileName = `image-${params.imageId}.${extension}`;
    const filePath = path.resolve(imagesDir, fileName);
    assertSafeProjectPath(filePath);
    await writeFile(filePath, params.file.buffer);

    const nextImage: ProjectImageAsset = {
      ...currentImage,
      source: currentImage.source || "local",
      url: `/api/projects/${encodeURIComponent(params.projectId)}/images/${encodeURIComponent(fileName)}`,
    };
    const images = currentImages.map((image) => (image.id === params.imageId ? nextImage : image));
    await writeFile(imagesJsonPath, JSON.stringify(images, null, 2), "utf8");

    return { success: true, image: nextImage, images };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function clearProjectImageFile(params: {
  imageId: string;
  projectId: string;
}): Promise<{ success: true; image: ProjectImageAsset; images: ProjectImageAsset[] } | { success: false; error: string }> {
  try {
    const projectDir = getProjectDir(params.projectId);
    const imagesDir = path.resolve(projectDir, "images");
    const imagesJsonPath = path.resolve(imagesDir, "images.json");
    assertSafeProjectPath(imagesDir);
    assertSafeProjectPath(imagesJsonPath);

    const currentImages = await normalizeProjectImageAssets(params.projectId);
    const currentImage = currentImages.find((image) => image.id === params.imageId);
    if (!currentImage) return { success: false, error: "IMAGE_NOT_FOUND" };

    const fileName = getProjectImageFileNameFromUrl(params.projectId, currentImage.url);
    const candidateFileNames = new Set<string>();
    if (fileName) {
      candidateFileNames.add(fileName);
    }
    const imageFiles = await readdir(imagesDir).catch(() => []);
    imageFiles
      .filter(
        (name) =>
          PROJECT_IMAGE_FILE_PATTERN.test(name) &&
          (name.startsWith(`image-${params.imageId}.`) || name.startsWith(`${params.imageId}.`)),
      )
      .forEach((name) => candidateFileNames.add(name));

    await Promise.all(
      Array.from(candidateFileNames).map(async (name) => {
        const filePath = path.resolve(imagesDir, name);
        assertSafeProjectPath(filePath);
        await rm(filePath, { force: true });
      }),
    );

    const nextImage: ProjectImageAsset = {
      ...currentImage,
      url: "",
    };
    const images = currentImages.map((image) => (image.id === params.imageId ? nextImage : image));
    await writeFile(imagesJsonPath, JSON.stringify(images, null, 2), "utf8");

    return { success: true, image: nextImage, images };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function storeGeneratedProjectImage(params: {
  category?: string;
  imageId: string;
  name?: string;
  parentId?: string;
  projectId: string;
  resultBase64?: string;
  resultUrl?: string;
  source?: string;
}): Promise<{ success: true; image: ProjectImageAsset; images: ProjectImageAsset[] } | { success: false; error: string }> {
  try {
    const projectDir = getProjectDir(params.projectId);
    const imagesDir = path.resolve(projectDir, "images");
    const imagesJsonPath = path.resolve(imagesDir, "images.json");
    assertSafeProjectPath(imagesDir);
    assertSafeProjectPath(imagesJsonPath);

    await mkdir(imagesDir, { recursive: true });
    const base64Input =
      params.resultBase64 ?? (params.resultUrl?.trim().startsWith("data:") ? params.resultUrl : "");
    const base64File = base64Input ? readGeneratedImageBase64(base64Input) : null;
    const remoteFile = base64File ?? (params.resultUrl
      ? await downloadRemoteGeneratedFile({
        fallbackExtension: getImageExtensionFromUrl(params.resultUrl) || "png",
        sourceUrl: params.resultUrl,
        type: "image",
      })
      : null);
    if (!remoteFile) {
      return { success: false, error: "GENERATED_IMAGE_DATA_NOT_FOUND" };
    }
    const fileName = `${params.imageId}.${remoteFile.extension}`;
    if (!PROJECT_IMAGE_FILE_PATTERN.test(fileName)) {
      return { success: false, error: "INVALID_IMAGE_FILE_NAME" };
    }

    const filePath = path.resolve(imagesDir, fileName);
    assertSafeProjectPath(filePath);
    await writeFile(filePath, remoteFile.buffer);

    const currentImages = await normalizeProjectImageAssets(params.projectId);
    const currentImage = currentImages.find((image) => image.id === params.imageId);
    const sourcePrompt = currentImage?.prompt ?? "";
    const imageType = params.category
      ? normalizeProjectImageType(params.category)
      : (currentImage?.type ?? "reference");
    const nextImage: ProjectImageAsset = {
      id: params.imageId,
      name: params.name ?? currentImage?.name ?? "",
      publicUrl: currentImage?.publicUrl ?? "",
      publicUrlUpdatedAt: currentImage?.publicUrlUpdatedAt ?? "",
      prompt: sourcePrompt,
      source: params.source ?? currentImage?.source ?? "generate",
      type: imageType,
      url: `/api/projects/${encodeURIComponent(params.projectId)}/images/${encodeURIComponent(fileName)}`,
    };
    const images = currentImage
      ? currentImages.map((image) => (image.id === params.imageId ? nextImage : image))
      : [nextImage, ...currentImages];
    await writeFile(imagesJsonPath, JSON.stringify(images, null, 2), "utf8");

    if (imageType !== "reference") {
      const project = await readProjectDetail(params.projectId).catch(() => null);
      const nextProject = project
        ? addImageToProjectAssets(project, {
          category: imageType,
          imageId: params.imageId,
          parentId: params.parentId,
        })
        : null;

      if (nextProject && nextProject !== project) {
        await writeProjectDetail(nextProject);
        const currentProject = await readCurrentProjectDetail().catch(() => null);
        if (currentProject?.id === nextProject.id) {
          await writeCurrentProjectDetail(nextProject);
        }
      }
    }

    return { success: true, image: nextImage, images };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function storeProjectImagePublicUrl(params: {
  imageId: string;
  projectId: string;
  publicUrl: string;
}): Promise<{ success: true; image: ProjectImageAsset; images: ProjectImageAsset[] } | { success: false; error: string }> {
  try {
    const publicUrl = params.publicUrl.trim();
    if (!isHttpUrl(publicUrl)) return { success: false, error: "INVALID_PUBLIC_URL" };
    const reachable = await isReachablePublicUrl(publicUrl);
    if (!reachable) return { success: false, error: "PUBLIC_URL_UNREACHABLE" };

    const imagesJsonPath = path.resolve(getProjectDir(params.projectId), "images", "images.json");
    assertSafeProjectPath(imagesJsonPath);

    const currentImages = await normalizeProjectImageAssets(params.projectId);
    const currentImage = currentImages.find((image) => image.id === params.imageId);
    if (!currentImage) return { success: false, error: "IMAGE_NOT_FOUND" };

    const nextImage: ProjectImageAsset = {
      ...currentImage,
      publicUrl,
      publicUrlUpdatedAt: new Date().toISOString(),
    };
    const images = currentImages.map((image) => (image.id === params.imageId ? nextImage : image));
    await writeFile(imagesJsonPath, JSON.stringify(images, null, 2), "utf8");

    return { success: true, image: nextImage, images };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function resolveProjectImagePublicUrl(params: {
  imageId: string;
  projectId: string;
}): Promise<
  | { success: true; image: ProjectImageAsset; publicUrl: string; reachable: boolean }
  | { success: false; error: string }
> {
  try {
    const images = await normalizeProjectImageAssets(params.projectId);
    const image = images.find((item) => item.id === params.imageId);
    if (!image) return { success: false, error: "IMAGE_NOT_FOUND" };

    const publicUrl = image.publicUrl.trim();
    const reachable = publicUrl ? await isReachablePublicUrl(publicUrl) : false;
    return {
      success: true,
      image,
      publicUrl: reachable ? publicUrl : "",
      reachable,
    };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function addProjectImageToStoryboard(params: {
  imageId: string;
  projectId: string;
  storyboardId: string;
}): Promise<
  | { success: true; episodeId: string; storyboards: ProjectStoryboard[] }
  | { success: false; error: string }
> {
  return updateProjectStoryboard({
    projectId: params.projectId,
    update: (storyboard) => {
      if (storyboard.id !== params.storyboardId) return storyboard;
      if (storyboard.images.includes(params.imageId)) {
        return { ...storyboard };
      }

      return {
        ...storyboard,
        images: [params.imageId, ...storyboard.images],
      };
    },
  });
}

export async function addExistingImageToProjectAssets(params: {
  category: string;
  imageId: string;
  parentId?: string;
  projectId: string;
}): Promise<{ success: true; project: ProjectDetail } | { success: false; error: string }> {
  try {
    const project = await readProjectDetail(params.projectId);
    if (!project) return { success: false, error: "PROJECT_NOT_FOUND" };

    const nextProject = addImageToProjectAssets(project, params);
    await writeProjectDetail(nextProject);
    const currentProject = await readCurrentProjectDetail().catch(() => null);
    if (currentProject?.id === nextProject.id) {
      await writeCurrentProjectDetail(nextProject);
    }

    return { success: true, project: nextProject };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function readProjectImageFile(params: {
  fileName: string;
  projectId: string;
}): Promise<
  { success: true; buffer: Buffer; contentType: string } | { success: false; error: string }
> {
  try {
    if (!IMAGE_FILE_PATTERN.test(params.fileName) && !PROJECT_IMAGE_FILE_PATTERN.test(params.fileName)) {
      return { success: false, error: "INVALID_IMAGE_FILE_NAME" };
    }

    const filePath = path.resolve(getProjectDir(params.projectId), "images", params.fileName);
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
