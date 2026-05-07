// Shared project-service primitives: path guards, JSON readers, and safe filesystem helpers.
import "server-only";

import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegStaticPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { v4 as createUuid } from "uuid";
import { flowStateSchema, type FlowState } from "@/lib/flow-schema";
import type {
  JsonObject,
  ProjectAssetItem,
  ProjectAssets,
  ProjectDetail,
  ProjectEpisode,
  ProjectConfig,
  ProjectImageAsset,
  ProjectListItem,
  ProjectStoryboard,
  ProjectVideoAsset,
} from "@/lib/project-types";

const PROJECT_ROOT = process.cwd();
export const PROJECTS_DIR = path.resolve(PROJECT_ROOT, "projects");
export const CURRENT_PROJECT_PATH = path.resolve(PROJECTS_DIR, "currentProject.json");
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const TEMP_FILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]{1,12}$/i;
export const IMAGE_FILE_PATTERN = /^image-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]{1,12}$/i;
export const PROJECT_IMAGE_FILE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}\.(png|jpg|jpeg|webp|gif)$/i;
export const VIDEO_FILE_PATTERN = /^video-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]{1,12}$/i;
export const IMAGE_ASSET_FIELDS = [
  "id",
  "name",
  "type",
  "source",
  "prompt",
  "url",
  "publicUrl",
  "publicUrlUpdatedAt",
] as const;
export const IMAGE_ASSET_TYPES = new Set(["characters", "scenes", "props", "voices", "videos", "reference"]);
export const PROJECT_ASSET_IMAGE_TYPES = new Set(["characters", "scenes", "props", "voices", "videos"]);
export const EMPTY_FLOW_STATE: FlowState = flowStateSchema.parse({ nodes: [], edges: [] });
export const execFileAsync = promisify(execFile);
export const FFMPEG_COMMAND = ffmpegStaticPath ?? "ffmpeg";
export const FFPROBE_COMMAND = ffprobeStatic.path || "ffprobe";

export type ProjectTempImage = {
  id: string;
  label: string;
  name: string;
  fileName: string;
  type: string;
  url: string;
};

export type ProjectTempImageInput = {
  buffer: Buffer;
  contentType: string;
  name: string;
};

export type CreateProjectImageInput = {
  category: string;
  image?: ProjectTempImageInput;
  name: string;
  parentId?: string;
  prompt: string;
  source: string;
};

export type CreateProjectVideoInput = {
  name: string;
  prompt: string;
  source: string;
};

export type RemoteGeneratedFile = {
  buffer: Buffer;
  contentType: string;
  extension: string;
  sourceUrl: string;
};

export function assertSafeProjectPath(targetPath: string) {
  if (targetPath !== PROJECTS_DIR && !targetPath.startsWith(`${PROJECTS_DIR}${path.sep}`)) {
    throw new Error("Invalid project path.");
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function readBoolean(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

export function readEpisodeCount(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.filter((episode) => isRecord(episode) && typeof episode.id === "string").length;
}

export function readEpisodes(value: unknown): ProjectEpisode[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((episode) => {
    if (!isRecord(episode)) return [];

    const id = readString(episode.id);
    const name = readString(episode.name);
    return id && name ? [{ id, name }] : [];
  });
}

export function readAssetItems(value: unknown): ProjectAssetItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((asset) => {
    if (!isRecord(asset)) return [];

    const id = readString(asset.id);
    return id
      ? [
        {
          id,
          children: readStringArray(asset.children),
        },
      ]
      : [];
  });
}

export function readAssets(value: unknown): ProjectAssets {
  const assets = isRecord(value) ? value : {};

  return {
    characters: readAssetItems(assets.characters),
    scenes: readAssetItems(assets.scenes),
    props: readAssetItems(assets.props),
    voices: readAssetItems(assets.voices),
    videos: readAssetItems(assets.videos),
  };
}

export function normalizeProjectImageType(value: unknown): ProjectImageAsset["type"] {
  const type = readString(value);
  if (type === "character" || type === "characters") return "characters";
  if (type === "scene" || type === "scenes") return "scenes";
  if (type === "prop" || type === "props") return "props";
  if (type === "reference" || type === "references") return "reference";
  if (type === "voice" || type === "voices") return "voices";
  if (type === "video" || type === "videos") return "videos";
  return "props";
}

export function withFallbackImageType(record: unknown, type: ProjectImageAsset["type"]) {
  if (!isRecord(record)) return record;
  return readString(record.type) ? record : { ...record, type };
}

export function readWrappedProjectImageRecords(value: unknown) {
  if (Array.isArray(value)) return { changed: false, records: value };
  if (!isRecord(value)) return { changed: true, records: [] };

  const directRecordFields = ["id", "name", "prompt"];
  if (directRecordFields.some((field) => typeof value[field] === "string")) {
    return { changed: true, records: [value] };
  }

  const records: unknown[] = [];
  const pushGroupedRecords = (source: unknown) => {
    if (!isRecord(source)) return;
    IMAGE_ASSET_TYPES.forEach((type) => {
      const groupedValue = source[type];
      if (!Array.isArray(groupedValue)) return;
      groupedValue.forEach((record) => records.push(withFallbackImageType(record, type)));
    });
  };
  const wrappedArrays = [value.images, value.assets, value.items, value.data, value.records];
  wrappedArrays.forEach((wrappedValue) => {
    if (Array.isArray(wrappedValue)) records.push(...wrappedValue);
  });

  pushGroupedRecords(value);
  pushGroupedRecords(value.images);
  pushGroupedRecords(value.assets);
  pushGroupedRecords(value.data);

  return { changed: true, records };
}

export function normalizeProjectImageRecords(value: unknown) {
  const wrapped = readWrappedProjectImageRecords(value);
  const records = wrapped.records;
  const usedIds = new Set<string>();
  const idMap = new Map<string, string>();
  let changed = wrapped.changed;

  const images = records.flatMap((record): ProjectImageAsset[] => {
    if (!isRecord(record)) {
      changed = true;
      return [];
    }

    const originalId = readString(record.id);
    const id =
      originalId && UUID_PATTERN.test(originalId) && !usedIds.has(originalId)
        ? originalId
        : createUuid();
    usedIds.add(id);
    if (originalId) idMap.set(originalId, id);
    if (id !== originalId) changed = true;

    const type = normalizeProjectImageType(record.type);
    const source = readString(record.source) || "generate";
    const prompt = readString(record.prompt) || readString(record.description);
    const image: ProjectImageAsset = {
      id,
      name: readString(record.name),
      publicUrl: readString(record.publicUrl),
      publicUrlUpdatedAt: readString(record.publicUrlUpdatedAt),
      type,
      source: source === "custom" || source === "global" || source === "generate" ? source : "generate",
      prompt,
      url: readString(record.url),
    };
    const keys = Object.keys(record);

    if (
      keys.length !== IMAGE_ASSET_FIELDS.length ||
      IMAGE_ASSET_FIELDS.some((field) => !keys.includes(field)) ||
      readString(record.type) !== image.type ||
      readString(record.source) !== image.source ||
      readString(record.prompt) !== image.prompt ||
      readString(record.url) !== image.url ||
      readString(record.publicUrl) !== image.publicUrl ||
      readString(record.publicUrlUpdatedAt) !== image.publicUrlUpdatedAt
    ) {
      changed = true;
    }

    return [image];
  });

  return { changed, idMap, images };
}

export function normalizeAssetItemsWithIdMap(
  items: ProjectAssetItem[],
  idMap: Map<string, string>,
  imageIds: Set<string>,
) {
  const seen = new Set<string>();

  return items.flatMap((item): ProjectAssetItem[] => {
    const id = idMap.get(item.id) ?? item.id;
    if (!imageIds.has(id) || seen.has(id)) return [];
    seen.add(id);

    return [
      {
        id,
        children: [...new Set(item.children.map((childId) => idMap.get(childId) ?? childId))]
          .filter((childId) => childId !== id && imageIds.has(childId)),
      },
    ];
  });
}

export function readProjectVideoAssets(value: unknown): ProjectVideoAsset[] {
  const videoRecords = Array.isArray(value) ? value : [value];

  return videoRecords.flatMap((videoAsset) => {
    if (!isRecord(videoAsset)) return [];

    const id = readString(videoAsset.id);
    if (!id) return [];
    const cover = readString(videoAsset.cover) || readString(videoAsset.coverUrl) || readString(videoAsset.poster);

    return [
      {
        apiUrl: readString(videoAsset.apiUrl) || readString(videoAsset.api_url),
        id,
        name: readString(videoAsset.name),
        source: readString(videoAsset.source),
        prompt: readString(videoAsset.prompt),
        url: readString(videoAsset.url),
        cover,
        coverUrl: cover,
        poster: cover,
        duration: readString(videoAsset.duration),
        status: readString(videoAsset.status),
      },
    ];
  });
}

export function readProjectStoryboards(value: unknown): ProjectStoryboard[] {
  const storyboardRecords = Array.isArray(value) ? value : [value];

  return storyboardRecords.flatMap((storyboard) => {
    if (!isRecord(storyboard)) return [];

    const id = readString(storyboard.id);
    if (!id) return [];
    const videoPrompt = readString(storyboard.videoPrompt);

    return [
      {
        id,
        name: readString(storyboard.name),
        description: readString(storyboard.description),
        prompt: readString(storyboard.prompt),
        videoPrompt,
        images: readStringArray(storyboard.images),
        videos: readStringArray(storyboard.videos),
        selectedVideo: readString(storyboard.selectedVideo),
      },
    ];
  });
}

export function createAssetLookupTerms(asset: ProjectImageAsset) {
  const rawTerms = [
    asset.name,
    ...asset.name.split(/[/\s,，、|]+/u),
    ...asset.prompt.split(/[\s,，。；;：:、()（）「」『』【】[\]]+/u),
  ];
  const stopTerms = new Set([
    "视觉",
    "元素",
    "特征",
    "光线",
    "氛围",
    "电影",
    "风格",
    "写实",
    "提示",
    "显示",
    "普通",
    "重要",
  ]);
  const terms = new Set<string>();

  rawTerms.forEach((rawTerm) => {
    const term = rawTerm.trim().toLowerCase();
    if (term.length < 2 || stopTerms.has(term)) return;
    terms.add(term);

    const cjkMatches = term.match(/[\u4e00-\u9fff]{2,}/gu) ?? [];
    cjkMatches.forEach((match) => {
      for (let size = 2; size <= Math.min(match.length, 6); size += 1) {
        for (let index = 0; index <= match.length - size; index += 1) {
          const fragment = match.slice(index, index + size);
          if (!stopTerms.has(fragment)) terms.add(fragment);
        }
      }
    });
  });

  return [...terms].sort((left, right) => right.length - left.length);
}

export function scoreStoryboardAssetMatch(storyboard: ProjectStoryboard, asset: ProjectImageAsset) {
  const text = [
    storyboard.name,
    storyboard.description,
    storyboard.prompt,
    storyboard.videoPrompt,
    ...storyboard.images,
  ]
    .join("\n")
    .toLowerCase();
  const exactName = asset.name.trim().toLowerCase();
  let score = exactName && text.includes(exactName) ? 12 : 0;

  createAssetLookupTerms(asset).forEach((term) => {
    if (!text.includes(term)) return;
    score += term.length >= 4 ? 4 : term.length === 3 ? 3 : 1;
  });

  if (asset.type === "characters" && score > 0) return score + 4;
  if (asset.type === "scenes" && score > 0) return score + 2;
  return score;
}

export function selectStoryboardAssetIds(params: {
  allowedAssetIds: Set<string>;
  assets: ProjectImageAsset[];
  storyboard: ProjectStoryboard;
}) {
  const matchedByType = new Map<string, ProjectImageAsset[]>();

  params.assets
    .filter((asset) => params.allowedAssetIds.has(asset.id))
    .map((asset) => ({
      asset,
      score: scoreStoryboardAssetMatch(params.storyboard, asset),
    }))
    .filter((item) => item.score >= 2)
    .sort((left, right) => right.score - left.score)
    .forEach(({ asset }) => {
      const current = matchedByType.get(asset.type) ?? [];
      matchedByType.set(asset.type, [...current, asset]);
    });

  const selected = [
    ...(matchedByType.get("characters") ?? []),
    ...(matchedByType.get("scenes") ?? []).slice(0, 1),
    ...(matchedByType.get("props") ?? []).slice(0, 4),
    ...(matchedByType.get("voices") ?? []).slice(0, 1),
    ...(matchedByType.get("videos") ?? []).slice(0, 3),
  ];
  const ids = new Set<string>();

  selected.forEach((asset) => ids.add(asset.id));
  params.storyboard.images
    .filter((imageId) => params.allowedAssetIds.has(imageId))
    .forEach((imageId) => ids.add(imageId));

  return [...ids];
}

export function readFlowState(value: unknown): FlowState {
  const parsedFlow = flowStateSchema.safeParse(value);
  if (parsedFlow.success) return parsedFlow.data;

  return EMPTY_FLOW_STATE;
}

export async function readOrCreateProjectFlow(flowJsonPath: string): Promise<FlowState> {
  try {
    const content = await readFile(flowJsonPath, "utf8");
    return readFlowState(JSON.parse(content));
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      await writeFile(flowJsonPath, JSON.stringify(EMPTY_FLOW_STATE, null, 2), "utf8");
    }

    return EMPTY_FLOW_STATE;
  }
}

export function readProjectConfig(value: unknown): ProjectConfig {
  return isRecord(value) ? (value as ProjectConfig) : {};
}

export function toProjectDetail(value: unknown): ProjectDetail | null {
  if (!isRecord(value)) return null;

  const id = readString(value.id);
  const name = readString(value.name);
  if (!id || !name) return null;

  return {
    id,
    name,
    description: readString(value.description),
    aspectRatio: readString(value.aspectRatio),
    resolution: readString(value.resolution),
    episodes: readEpisodes(value.episodes),
    assets: readAssets(value.assets),
    assetsParsed: readBoolean(value.assetsParsed),
    createdAt: readString(value.createdAt),
  };
}

export function toProjectListItem(value: unknown): ProjectListItem | null {
  const project = toProjectDetail(value);
  if (!project) return null;

  return {
    ...project,
    episodeCount: readEpisodeCount(project.episodes),
  };
}

export function getProjectDir(projectId: string) {
  if (!UUID_PATTERN.test(projectId)) {
    throw new Error("Invalid project id.");
  }

  const projectDir = path.resolve(PROJECTS_DIR, projectId);
  assertSafeProjectPath(projectDir);
  return projectDir;
}

export function getProjectTempDir(projectId: string) {
  const tempDir = path.resolve(getProjectDir(projectId), "temp");
  assertSafeProjectPath(tempDir);
  return tempDir;
}

export function getProjectVideosDir(projectId: string) {
  const videosDir = path.resolve(getProjectDir(projectId), "videos");
  assertSafeProjectPath(videosDir);
  return videosDir;
}

export function getProjectImagesDir(projectId: string) {
  const imagesDir = path.resolve(getProjectDir(projectId), "images");
  assertSafeProjectPath(imagesDir);
  return imagesDir;
}

export function getImageExtension(contentType: string, fileName: string) {
  const normalizedContentType = contentType.toLowerCase();
  if (normalizedContentType === "image/png") return "png";
  if (normalizedContentType === "image/jpeg" || normalizedContentType === "image/jpg") return "jpg";
  if (normalizedContentType === "image/webp") return "webp";
  if (normalizedContentType === "image/gif") return "gif";

  const extension = path.extname(fileName).replace(".", "").toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(extension)) return extension;

  throw new Error("Unsupported image type.");
}

export function getVideoExtension(contentType: string, fileName: string) {
  const normalizedContentType = contentType.toLowerCase();
  if (normalizedContentType === "video/mp4") return "mp4";
  if (normalizedContentType === "video/webm") return "webm";
  if (normalizedContentType === "video/quicktime") return "mov";

  const extension = path.extname(fileName).replace(".", "").toLowerCase();
  if (["mp4", "webm", "mov"].includes(extension)) return extension;

  throw new Error("Unsupported video type.");
}

export function getImageExtensionFromUrl(url: string) {
  try {
    const extension = path.extname(new URL(url).pathname).replace(".", "").toLowerCase();
    if (["png", "jpg", "jpeg", "webp", "gif"].includes(extension)) return extension;
  } catch {
    return "";
  }

  return "";
}

export function getVideoExtensionFromUrl(url: string) {
  try {
    const extension = path.extname(new URL(url).pathname).replace(".", "").toLowerCase();
    if (["mp4", "webm", "mov"].includes(extension)) return extension;
  } catch {
    return "";
  }

  return "";
}

export function normalizeRemoteUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Remote URL must use http or https.");
    }

    return url.toString();
  } catch {
    throw new Error("Invalid remote URL.");
  }
}

export async function downloadRemoteGeneratedFile(params: {
  fallbackExtension: string;
  sourceUrl: string;
  type: "image" | "video";
}): Promise<RemoteGeneratedFile> {
  const sourceUrl = normalizeRemoteUrl(params.sourceUrl);
  const response = await fetch(sourceUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("REMOTE_FILE_DOWNLOAD_FAILED");
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error("REMOTE_FILE_EMPTY");
  }
  if (
    contentType &&
    contentType !== "application/octet-stream" &&
    !contentType.startsWith(`${params.type}/`)
  ) {
    throw new Error("REMOTE_FILE_TYPE_MISMATCH");
  }

  const extension =
    params.type === "image"
      ? getImageExtension(contentType, `remote.${params.fallbackExtension}`)
      : getVideoExtension(contentType, `remote.${params.fallbackExtension}`);

  return {
    buffer,
    contentType,
    extension,
    sourceUrl,
  };
}

export function readJsonObjects(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((record) => (isRecord(record) ? [record as JsonObject] : []));
}

export function upsertJsonRecord(records: JsonObject[], record: JsonObject) {
  const id = readString(record.id);
  const index = records.findIndex((item) => readString(item.id) === id);
  if (index < 0) return [record, ...records];

  return records.map((item, itemIndex) => (itemIndex === index ? { ...item, ...record } : item));
}

export function getSafeFileExtension(fileName: string) {
  const extension = path.extname(fileName).replace(".", "").toLowerCase();
  if (/^[a-z0-9]{1,12}$/.test(extension)) return extension;
  return "bin";
}

export function getTempFileContentType(fileName: string) {
  const extension = path.extname(fileName).replace(".", "").toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return "application/octet-stream";
}

export function getVideoFileContentType(fileName: string) {
  const extension = path.extname(fileName).replace(".", "").toLowerCase();
  if (extension === "mp4") return "video/mp4";
  if (extension === "webm") return "video/webm";
  if (extension === "mov") return "video/quicktime";
  return "application/octet-stream";
}

export function getProjectVideoFileNameFromUrl(projectId: string, url: string) {
  try {
    const parsedUrl = new URL(url, "http://localhost");
    const parts = parsedUrl.pathname.split("/").filter(Boolean);
    const projectIndex = parts.findIndex((part) => part === "projects");
    const fileName = decodeURIComponent(parts.at(-1) ?? "");

    if (
      projectIndex < 0 ||
      parts[projectIndex + 1] !== projectId ||
      parts[projectIndex + 2] !== "videos" ||
      !VIDEO_FILE_PATTERN.test(fileName)
    ) {
      return "";
    }

    return fileName;
  } catch {
    return "";
  }
}

export function getProjectImageFileNameFromUrl(projectId: string, url: string) {
  try {
    const parsedUrl = new URL(url, "http://localhost");
    const parts = parsedUrl.pathname.split("/").filter(Boolean);
    const projectIndex = parts.findIndex((part) => part === "projects");
    const fileName = decodeURIComponent(parts.at(-1) ?? "");

    if (
      projectIndex < 0 &&
      parts.length === 2 &&
      parts[0] === "images" &&
      PROJECT_IMAGE_FILE_PATTERN.test(fileName)
    ) {
      return fileName;
    }

    if (
      projectIndex < 0 ||
      parts[projectIndex + 1] !== projectId ||
      parts[projectIndex + 2] !== "images" ||
      (!IMAGE_FILE_PATTERN.test(fileName) && !PROJECT_IMAGE_FILE_PATTERN.test(fileName))
    ) {
      return "";
    }

    return fileName;
  } catch {
    return "";
  }
}

export function quoteFfmpegConcatPath(filePath: string) {
  return `'${filePath.replaceAll("'", "'\\''")}'`;
}

export async function createProjectVideoCover(params: {
  projectId: string;
  videoFilePath: string;
}): Promise<string> {
  const imagesDir = getProjectImagesDir(params.projectId);
  const coverFileName = `image-${createUuid()}.png`;
  const coverFilePath = path.resolve(imagesDir, coverFileName);

  try {
    await mkdir(imagesDir, { recursive: true });
    assertSafeProjectPath(coverFilePath);

    await execFileAsync(FFMPEG_COMMAND, [
      "-y",
      "-i",
      params.videoFilePath,
      "-map",
      "0:v:0",
      "-frames:v",
      "1",
      "-vf",
      "scale=640:-2",
      coverFilePath,
    ]);
    const coverStats = await stat(coverFilePath);
    if (coverStats.size <= 0) throw new Error("Empty video cover.");

    return `/api/projects/${encodeURIComponent(params.projectId)}/images/${encodeURIComponent(coverFileName)}`;
  } catch (err) {
    // Surface ffmpeg failures (missing binary, unsupported codec) to the server log so
    // a missing cover doesn't fail silently. Best-effort cleanup of any partial file.
    console.error("[createProjectVideoCover] failed", {
      ffmpeg: FFMPEG_COMMAND,
      videoFilePath: params.videoFilePath,
      error: err instanceof Error ? err.message : err,
    });
    await rm(coverFilePath, { force: true }).catch(() => {
      // Cover generation is best-effort; cleanup failure should not block video upload.
    });
    return "";
  }
}

export async function readProjectVideoDuration(videoFilePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(FFPROBE_COMMAND, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      videoFilePath,
    ]);
    const durationSeconds = Number(stdout.trim());

    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return "";

    return `${durationSeconds.toFixed(2)}s`;
  } catch {
    return "";
  }
}

export async function ensureProjectVideoCovers(params: {
  projectId: string;
  videos: ProjectVideoAsset[];
  videosJsonPath: string;
}): Promise<ProjectVideoAsset[]> {
  let changed = false;
  const videosDir = getProjectVideosDir(params.projectId);
  const videoFiles = await readdir(videosDir).catch((): string[] => []);
  const nextVideos: ProjectVideoAsset[] = [];

  for (const video of params.videos) {
    let nextVideo = video;
    let fileName = getProjectVideoFileNameFromUrl(params.projectId, video.url);

    if (!fileName) {
      const matchedFileName = videoFiles.find(
        (candidateFileName) =>
          candidateFileName.startsWith(`${video.id}.`) && VIDEO_FILE_PATTERN.test(candidateFileName),
      );

      if (matchedFileName) {
        fileName = matchedFileName;
        changed = true;
        nextVideo = {
          ...nextVideo,
          url: `/api/projects/${encodeURIComponent(params.projectId)}/videos/${encodeURIComponent(matchedFileName)}`,
        };
      }
    }

    if (!fileName) {
      nextVideos.push(nextVideo);
      continue;
    }
    const videoFilePath = path.resolve(videosDir, fileName);
    assertSafeProjectPath(videoFilePath);

    try {
      const videoStats = await stat(videoFilePath);
      if (videoStats.size <= 0) {
        nextVideos.push(nextVideo);
        continue;
      }

      if (!nextVideo.duration) {
        const duration = await readProjectVideoDuration(videoFilePath);
        if (duration) {
          changed = true;
          nextVideo = {
            ...nextVideo,
            duration,
          };
        }
      }

      if (!nextVideo.cover && !nextVideo.coverUrl && !nextVideo.poster) {
        const cover = await createProjectVideoCover({
          projectId: params.projectId,
          videoFilePath,
        });

        if (cover) {
          changed = true;
          nextVideo = {
            ...nextVideo,
            cover,
            coverUrl: cover,
            poster: cover,
          };
        }
      }

      nextVideos.push(nextVideo);
    } catch {
      nextVideos.push(nextVideo);
    }
  }

  if (changed) {
    assertSafeProjectPath(params.videosJsonPath);
    await writeFile(params.videosJsonPath, JSON.stringify(nextVideos, null, 2), "utf8");
  }

  return nextVideos;
}

export function upsertAssetItem(items: ProjectAssetItem[], assetId: string) {
  if (items.some((item) => item.id === assetId)) return items;
  return [{ id: assetId, children: [] }, ...items];
}

export async function updateProjectStoryboard(params: {
  projectId: string;
  update: (storyboard: ProjectStoryboard) => ProjectStoryboard;
}): Promise<
  | { success: true; episodeId: string; storyboards: ProjectStoryboard[] }
  | { success: false; error: string }
> {
  try {
    const project = await readProjectDetail(params.projectId);
    if (!project) return { success: false, error: "PROJECT_NOT_FOUND" };

    const projectDir = getProjectDir(params.projectId);
    const storyboardFiles = [
      ...project.episodes.map((episode) => ({
        episodeId: episode.id,
        filePath: path.resolve(projectDir, "episode", `${episode.id}.json`),
      })),
      {
        episodeId: "",
        filePath: path.resolve(projectDir, `${params.projectId}.json`),
      },
    ];

    for (const storyboardFile of storyboardFiles) {
      assertSafeProjectPath(storyboardFile.filePath);

      const content = await readFile(storyboardFile.filePath, "utf8").catch(() => "");
      if (!content) continue;

      const storyboards = readProjectStoryboards(JSON.parse(content));
      let updated = false;
      const nextStoryboards = storyboards.map((storyboard) => {
        const nextStoryboard = params.update(storyboard);
        if (nextStoryboard !== storyboard) updated = true;
        return nextStoryboard;
      });

      if (!updated) continue;

      await writeFile(storyboardFile.filePath, JSON.stringify(nextStoryboards, null, 2), "utf8");
      return {
        success: true,
        episodeId: storyboardFile.episodeId,
        storyboards: nextStoryboards,
      };
    }

    return { success: false, error: "STORYBOARD_NOT_FOUND" };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function updateProjectStoryboards(params: {
  projectId: string;
  update: (storyboard: ProjectStoryboard) => ProjectStoryboard;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const project = await readProjectDetail(params.projectId);
    if (!project) return { success: false, error: "PROJECT_NOT_FOUND" };

    const projectDir = getProjectDir(params.projectId);
    const storyboardFiles = [
      ...project.episodes.map((episode) => path.resolve(projectDir, "episode", `${episode.id}.json`)),
      path.resolve(projectDir, `${params.projectId}.json`),
    ];

    await Promise.all(
      storyboardFiles.map(async (filePath) => {
        assertSafeProjectPath(filePath);

        const content = await readFile(filePath, "utf8").catch(() => "");
        if (!content) return;

        const storyboards = readProjectStoryboards(JSON.parse(content));
        let updated = false;
        const nextStoryboards = storyboards.map((storyboard) => {
          const nextStoryboard = params.update(storyboard);
          if (nextStoryboard !== storyboard) updated = true;
          return nextStoryboard;
        });

        if (updated) {
          await writeFile(filePath, JSON.stringify(nextStoryboards, null, 2), "utf8");
        }
      }),
    );

    return { success: true };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export function upsertChildAssetItem(items: ProjectAssetItem[], parentId: string, childId: string) {
  return items.map((item) => {
    if (item.id !== parentId || item.children.includes(childId)) return item;

    return {
      ...item,
      children: [childId, ...item.children],
    };
  });
}

export function addImageToProjectAssets(
  project: ProjectDetail,
  params: { category: string; imageId: string; parentId?: string },
) {
  const category = normalizeProjectImageType(params.category);

  if (category === "characters") {
    return {
      ...project,
      assets: {
        ...project.assets,
        characters: params.parentId
          ? upsertChildAssetItem(project.assets.characters, params.parentId, params.imageId)
          : upsertAssetItem(project.assets.characters, params.imageId),
      },
    };
  }

  if (category === "scenes") {
    return {
      ...project,
      assets: {
        ...project.assets,
        scenes: upsertAssetItem(project.assets.scenes, params.imageId),
      },
    };
  }

  if (category === "props") {
    return {
      ...project,
      assets: {
        ...project.assets,
        props: upsertAssetItem(project.assets.props, params.imageId),
      },
    };
  }

  return project;
}

export function buildProjectAssetsFromImages(
  project: ProjectDetail,
  images: ProjectImageAsset[],
  idMap: Map<string, string>,
) {
  const imageIds = new Set(images.map((image) => image.id));
  const assets: ProjectAssets = {
    characters: normalizeAssetItemsWithIdMap(project.assets.characters, idMap, imageIds),
    scenes: normalizeAssetItemsWithIdMap(project.assets.scenes, idMap, imageIds),
    props: normalizeAssetItemsWithIdMap(project.assets.props, idMap, imageIds),
    voices: normalizeAssetItemsWithIdMap(project.assets.voices, idMap, imageIds),
    videos: normalizeAssetItemsWithIdMap(project.assets.videos, idMap, imageIds),
  };
  const existingIds = new Set(Object.values(assets).flatMap((items) => items.map((item) => item.id)));

  images.forEach((image) => {
    if (existingIds.has(image.id) || !PROJECT_ASSET_IMAGE_TYPES.has(image.type)) return;
    assets[image.type as keyof ProjectAssets] = [
      ...assets[image.type as keyof ProjectAssets],
      { id: image.id, children: [] },
    ];
    existingIds.add(image.id);
  });

  return assets;
}

export async function remapProjectStoryboardImageIds(params: {
  idMap: Map<string, string>;
  imageIds: Set<string>;
  project: ProjectDetail;
}) {
  if (params.idMap.size === 0) return;

  const projectDir = getProjectDir(params.project.id);
  const storyboardFiles = [
    ...params.project.episodes.map((episode) => path.resolve(projectDir, "episode", `${episode.id}.json`)),
    path.resolve(projectDir, `${params.project.id}.json`),
  ];

  await Promise.all(
    storyboardFiles.map(async (filePath) => {
      assertSafeProjectPath(filePath);
      const content = await readFile(filePath, "utf8").catch(() => "");
      if (!content) return;

      const storyboards = readProjectStoryboards(JSON.parse(content));
      let changed = false;
      const nextStoryboards = storyboards.map((storyboard) => {
        const images = storyboard.images
          .map((imageId) => params.idMap.get(imageId) ?? imageId)
          .filter((imageId) => params.imageIds.has(imageId));
        if (images.join("\n") === storyboard.images.join("\n")) return storyboard;

        changed = true;
        return { ...storyboard, images };
      });

      if (changed) {
        await writeFile(filePath, JSON.stringify(nextStoryboards, null, 2), "utf8");
      }
    }),
  );
}

export async function normalizeProjectImageAssets(projectId: string) {
  const projectDir = getProjectDir(projectId);
  const imagesJsonPath = path.resolve(projectDir, "images", "images.json");
  assertSafeProjectPath(imagesJsonPath);

  const rawImages = await readFile(imagesJsonPath, "utf8")
    .then((content) => JSON.parse(content) as unknown)
    .catch(() => []);
  const normalized = normalizeProjectImageRecords(rawImages);
  const project = await readProjectDetail(projectId).catch(() => null);
  const imageIds = new Set(normalized.images.map((image) => image.id));

  if (normalized.changed) {
    await mkdir(path.dirname(imagesJsonPath), { recursive: true });
    await writeFile(imagesJsonPath, JSON.stringify(normalized.images, null, 2), "utf8");
  }

  if (project) {
    const nextAssets = buildProjectAssetsFromImages(project, normalized.images, normalized.idMap);
    const nextProject = {
      ...project,
      assets: nextAssets,
      // Treat images/images.json as the source of truth: an empty asset catalog is not parsed.
      assetsParsed: normalized.images.length > 0,
    };
    const projectChanged =
      JSON.stringify(project.assets) !== JSON.stringify(nextAssets) ||
      project.assetsParsed !== nextProject.assetsParsed;

    if (projectChanged) {
      await writeProjectDetail(nextProject);
      const currentProject = await readCurrentProjectDetail().catch(() => null);
      if (currentProject?.id === nextProject.id) {
        await writeCurrentProjectDetail(nextProject);
      }
    }

    await remapProjectStoryboardImageIds({
      idMap: normalized.idMap,
      imageIds,
      project: nextProject,
    });
  }

  return normalized.images;
}

export async function readProjectDetail(projectId: string): Promise<ProjectDetail | null> {
  const projectJsonPath = path.resolve(getProjectDir(projectId), "project.json");
  assertSafeProjectPath(projectJsonPath);

  const content = await readFile(projectJsonPath, "utf8");
  return toProjectDetail(JSON.parse(content));
}

export async function writeProjectDetail(project: ProjectDetail) {
  const projectJsonPath = path.resolve(getProjectDir(project.id), "project.json");
  assertSafeProjectPath(projectJsonPath);
  await writeFile(projectJsonPath, JSON.stringify(project, null, 2), "utf8");
}

export async function writeCurrentProjectDetail(project: ProjectDetail) {
  assertSafeProjectPath(CURRENT_PROJECT_PATH);
  await mkdir(PROJECTS_DIR, { recursive: true });
  await writeFile(CURRENT_PROJECT_PATH, JSON.stringify(project, null, 2), "utf8");
}

export async function readCurrentProjectDetail(): Promise<ProjectDetail | null> {
  assertSafeProjectPath(CURRENT_PROJECT_PATH);

  try {
    const content = await readFile(CURRENT_PROJECT_PATH, "utf8");
    const currentProject = toProjectDetail(JSON.parse(content));
    if (!currentProject) return null;

    return readProjectDetail(currentProject.id);
  } catch {
    return null;
  }
}
