// Canvas and project settings actions: keep flow.json, storyboards, and config files isolated.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { v4 as createUuid } from "uuid";
import { flowStateSchema, type FlowState } from "@/lib/flow-schema";
import type {
  ProjectConfig,
  ProjectImageAsset,
  ProjectSelectedImageBedInfo,
  ProjectSelectedModelInfo,
  ProjectStoryboard,
  ProjectVideoAsset,
} from "@/lib/project-types";
import {
  UUID_PATTERN,
  assertSafeProjectPath,
  ensureProjectVideoCovers,
  getProjectDir,
  isRecord,
  normalizeProjectImageAssets,
  readOrCreateProjectFlow,
  readProjectConfig,
  readProjectDetail,
  readProjectStoryboards,
  readProjectVideoAssets,
  readString,
  readStringArray,
  selectStoryboardAssetIds,
} from "./shared";

export async function getProjectFlow(projectId: string): Promise<
  { success: true; flow: FlowState } | { success: false; error: string }
> {
  try {
    const projectDir = getProjectDir(projectId);
    const flowJsonPath = path.resolve(projectDir, "flow.json");
    assertSafeProjectPath(flowJsonPath);

    const flow = await readOrCreateProjectFlow(flowJsonPath);
    return { success: true, flow };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function getProjectCanvasData(params: {
  projectId: string;
  episodeId: string;
}): Promise<
  | {
    success: true;
    flow: FlowState;
    storyboards: ProjectStoryboard[];
    images: ProjectImageAsset[];
    videos: ProjectVideoAsset[];
  }
  | { success: false; error: string }
> {
  try {
    const projectDir = getProjectDir(params.projectId);
    const flowJsonPath = path.resolve(projectDir, "flow.json");
    const projectStoryboardPath = path.resolve(projectDir, `${params.projectId}.json`);
    const episodeStoryboardPath = path.resolve(projectDir, "episode", `${params.episodeId}.json`);
    const imagesJsonPath = path.resolve(projectDir, "images", "images.json");
    const videosJsonPath = path.resolve(projectDir, "videos", "videos.json");

    [
      flowJsonPath,
      projectStoryboardPath,
      episodeStoryboardPath,
      imagesJsonPath,
      videosJsonPath,
    ].forEach(assertSafeProjectPath);

    const flow = await readOrCreateProjectFlow(flowJsonPath);

    const images = await normalizeProjectImageAssets(params.projectId);
    const nextStoryboardContent = await readFile(episodeStoryboardPath, "utf8").catch(async () =>
      readFile(projectStoryboardPath, "utf8"),
    );
    const nextStoryboards = readProjectStoryboards(JSON.parse(nextStoryboardContent));
    const videos = await readFile(videosJsonPath, "utf8")
      .then((content) => readProjectVideoAssets(JSON.parse(content)))
      .catch(() => []);
    const videosWithCovers = await ensureProjectVideoCovers({
      projectId: params.projectId,
      videos,
      videosJsonPath,
    });

    return { success: true, flow, storyboards: nextStoryboards, images, videos: videosWithCovers };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function normalizeProjectStoryboardAssets(params: {
  episodeId: string;
  projectId: string;
}): Promise<
  | {
    success: true;
    storyboards: ProjectStoryboard[];
    updatedCount: number;
  }
  | { success: false; error: string }
> {
  try {
    const projectDir = getProjectDir(params.projectId);
    const episodeStoryboardPath = path.resolve(projectDir, "episode", `${params.episodeId}.json`);
    const imagesJsonPath = path.resolve(projectDir, "images", "images.json");

    [episodeStoryboardPath, imagesJsonPath].forEach(assertSafeProjectPath);

    const storyboards = await readFile(episodeStoryboardPath, "utf8")
      .then((content) => readProjectStoryboards(JSON.parse(content)))
      .catch((): ProjectStoryboard[] => []);
    const imageAssets = await normalizeProjectImageAssets(params.projectId);
    const imageIds = new Set(imageAssets.map((asset) => asset.id));
    let updatedCount = 0;

    const nextStoryboards = storyboards.map((storyboard) => {
      const nextImages = selectStoryboardAssetIds({
        allowedAssetIds: imageIds,
        assets: imageAssets,
        storyboard,
      });

      if (JSON.stringify(storyboard.images) === JSON.stringify(nextImages)) return storyboard;

      updatedCount += 1;
      return {
        ...storyboard,
        images: nextImages,
      };
    });

    if (updatedCount > 0) {
      await writeFile(episodeStoryboardPath, JSON.stringify(nextStoryboards, null, 2), "utf8");
    }

    return { success: true, storyboards: nextStoryboards, updatedCount };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

type IncomingStoryboard = {
  id?: string;
  name: string;
  description: string;
  prompt: string;
  videoPrompt: string;
};

function readIncomingStoryboards(value: unknown): IncomingStoryboard[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): IncomingStoryboard[] => {
    if (!isRecord(entry)) return [];

    const name = readString(entry.name);
    if (!name) return [];

    const id = readString(entry.id);
    return [
      {
        ...(id && UUID_PATTERN.test(id) ? { id } : {}),
        description: readString(entry.description),
        name,
        prompt: readString(entry.prompt),
        videoPrompt: readString(entry.videoPrompt),
      },
    ];
  });
}

function normalizeStoryboardName(name: string): string {
  return name.trim().toLowerCase();
}

export async function saveProjectEpisodeStoryboards(params: {
  episodeId: string;
  projectId: string;
  storyboards: unknown;
}): Promise<
  | { success: true; storyboards: ProjectStoryboard[] }
  | { success: false; error: string }
> {
  try {
    const project = await readProjectDetail(params.projectId);
    if (!project) return { success: false, error: "PROJECT_NOT_FOUND" };
    if (!project.episodes.some((episode) => episode.id === params.episodeId)) {
      return { success: false, error: "EPISODE_NOT_FOUND" };
    }

    const projectDir = getProjectDir(params.projectId);
    const episodeDir = path.resolve(projectDir, "episode");
    const episodeStoryboardPath = path.resolve(episodeDir, `${params.episodeId}.json`);
    assertSafeProjectPath(episodeDir);
    assertSafeProjectPath(episodeStoryboardPath);

    // Read existing storyboards so the skill never has to know about prior IDs,
    // generated videos, or selected video — the backend preserves them on re-parse.
    const existing = await readFile(episodeStoryboardPath, "utf8")
      .then((content) => readProjectStoryboards(JSON.parse(content)))
      .catch((): ProjectStoryboard[] => []);
    const existingById = new Map<string, ProjectStoryboard>();
    const existingByName = new Map<string, ProjectStoryboard>();
    existing.forEach((storyboard) => {
      existingById.set(storyboard.id, storyboard);
      const key = normalizeStoryboardName(storyboard.name);
      if (key && !existingByName.has(key)) existingByName.set(key, storyboard);
    });

    const incoming = readIncomingStoryboards(params.storyboards);
    const claimedIds = new Set<string>();
    const merged: ProjectStoryboard[] = incoming.map((entry) => {
      const matchById = entry.id ? existingById.get(entry.id) : undefined;
      const match =
        matchById ?? existingByName.get(normalizeStoryboardName(entry.name)) ?? null;
      const reusableId = match && !claimedIds.has(match.id) ? match.id : null;
      const stableId = reusableId ?? entry.id ?? createUuid();
      claimedIds.add(stableId);

      return {
        id: stableId,
        name: entry.name,
        description: entry.description,
        prompt: entry.prompt,
        videoPrompt: entry.videoPrompt,
        // Asset binding is server-owned; auto-matched below.
        images: [],
        videos: match ? readStringArray(match.videos) : [],
        selectedVideo: match ? readString(match.selectedVideo) : "",
      };
    });

    const imageAssets = await normalizeProjectImageAssets(params.projectId);
    const allowedAssetIds = new Set(imageAssets.map((asset) => asset.id));
    const final = merged.map((storyboard) => ({
      ...storyboard,
      images: selectStoryboardAssetIds({
        allowedAssetIds,
        assets: imageAssets,
        storyboard,
      }),
    }));

    await mkdir(episodeDir, { recursive: true });
    await writeFile(episodeStoryboardPath, JSON.stringify(final, null, 2), "utf8");

    return { success: true, storyboards: final };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function saveProjectFlow(params: {
  projectId: string;
  flow: FlowState;
}): Promise<{ success: true; flow: FlowState } | { success: false; error: string }> {
  try {
    const projectDir = getProjectDir(params.projectId);
    const flowJsonPath = path.resolve(projectDir, "flow.json");
    assertSafeProjectPath(flowJsonPath);

    const flow = flowStateSchema.parse(params.flow);
    await writeFile(flowJsonPath, JSON.stringify(flow, null, 2), "utf8");

    return { success: true, flow };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function getProjectConfig(
  projectId: string,
): Promise<{ success: true; config: ProjectConfig } | { success: false; error: string }> {
  try {
    const configJsonPath = path.resolve(getProjectDir(projectId), "config.json");
    assertSafeProjectPath(configJsonPath);

    const config = await readFile(configJsonPath, "utf8")
      .then((content) => readProjectConfig(JSON.parse(content)))
      .catch((): ProjectConfig => ({}));

    return { success: true, config };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function saveProjectConfig(params: {
  imageBed?: ProjectSelectedImageBedInfo;
  model?: ProjectSelectedModelInfo;
  projectId: string;
}): Promise<{ success: true; config: ProjectConfig } | { success: false; error: string }> {
  try {
    const configJsonPath = path.resolve(getProjectDir(params.projectId), "config.json");
    assertSafeProjectPath(configJsonPath);

    const currentConfig = await readFile(configJsonPath, "utf8")
      .then((content) => readProjectConfig(JSON.parse(content)))
      .catch((): ProjectConfig => ({}));
    const nextConfig: ProjectConfig = {
      ...currentConfig,
      ...(params.model?.type === "image"
        ? { imageModel: params.model }
        : {}),
      ...(params.model?.type === "video"
        ? { videoModel: params.model }
        : {}),
      ...(params.imageBed ? { imageBed: params.imageBed } : {}),
    };

    await writeFile(configJsonPath, JSON.stringify(nextConfig, null, 2), "utf8");

    return { success: true, config: nextConfig };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}
