// Project lifecycle actions: list, select, update, delete, and create projects.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { v4 as createUuid } from "uuid";
import { parseScriptMD } from "@/lib/script-parser";
import type { ProjectDetail, ProjectListItem } from "@/lib/project-types";
import {
  CURRENT_PROJECT_PATH,
  PROJECTS_DIR,
  assertSafeProjectPath,
  getProjectDir,
  normalizeProjectImageAssets,
  readCurrentProjectDetail,
  readProjectDetail,
  toProjectListItem,
  writeCurrentProjectDetail,
  writeProjectDetail,
} from "./shared";

export async function listProjects(): Promise<
  { success: true; projects: ProjectListItem[] } | { success: false; error: string }
> {
  try {
    assertSafeProjectPath(PROJECTS_DIR);
    await mkdir(PROJECTS_DIR, { recursive: true });

    const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
    const projects = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const projectJsonPath = path.resolve(PROJECTS_DIR, entry.name, "project.json");
          assertSafeProjectPath(projectJsonPath);

          try {
            const content = await readFile(projectJsonPath, "utf8");
            return toProjectListItem(JSON.parse(content));
          } catch {
            return null;
          }
        }),
    );

    return {
      success: true,
      projects: projects
        .filter((project): project is ProjectListItem => project !== null)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function getCurrentProject(): Promise<
  { success: true; project: ProjectDetail | null } | { success: false; error: string }
> {
  try {
    const project = await readCurrentProjectDetail();
    return { success: true, project };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function setCurrentProject(
  projectId: string,
): Promise<{ success: true; project: ProjectDetail } | { success: false; error: string }> {
  try {
    const project = await readProjectDetail(projectId);
    if (!project) {
      return { success: false, error: "PROJECT_NOT_FOUND" };
    }

    await writeCurrentProjectDetail(project);
    return { success: true, project };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function clearCurrentProject(): Promise<
  { success: true } | { success: false; error: string }
> {
  try {
    assertSafeProjectPath(CURRENT_PROJECT_PATH);
    await rm(CURRENT_PROJECT_PATH, { force: true });
    return { success: true };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function getProject(
  projectId: string,
): Promise<{ success: true; project: ProjectDetail } | { success: false; error: string }> {
  try {
    await normalizeProjectImageAssets(projectId);
    const project = await readProjectDetail(projectId);
    if (!project) {
      return { success: false, error: "PROJECT_NOT_FOUND" };
    }

    return { success: true, project };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function updateProject(params: {
  projectId: string;
  description: string;
  aspectRatio: string;
  resolution: string;
  generateAudio: boolean;
  generateSubtitles: boolean;
}): Promise<{ success: true; project: ProjectDetail } | { success: false; error: string }> {
  try {
    const project = await readProjectDetail(params.projectId);
    if (!project) {
      return { success: false, error: "PROJECT_NOT_FOUND" };
    }

    const nextProject: ProjectDetail = {
      ...project,
      description: params.description,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution,
      generateAudio: params.generateAudio,
      generateSubtitles: params.generateSubtitles,
    };
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

export async function deleteProject(
  projectId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const currentProject = await readCurrentProjectDetail().catch(() => null);
    const projectDir = getProjectDir(projectId);
    await rm(projectDir, { recursive: true, force: true });
    if (currentProject?.id === projectId) {
      await clearCurrentProject();
    }
    return { success: true };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function createProject(params: {
  fileName: string;
  fileContent: string;
  description: string;
  aspectRatio: string;
  resolution: string;
  generateAudio: boolean;
  generateSubtitles: boolean;
}): Promise<{ success: true; projectId: string } | { success: false; error: string }> {
  try {
    const projectId = createUuid();
    const projectDir = path.resolve(PROJECTS_DIR, projectId);
    assertSafeProjectPath(projectDir);
    const parsedScript = parseScriptMD(params.fileContent);
    const episodes = parsedScript.episodes.map((episode) => ({
      id: createUuid(),
      name: episode.name,
    }));
    const project: ProjectDetail = {
      id: projectId,
      name: params.fileName,
      description: params.description,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution,
      generateAudio: params.generateAudio,
      generateSubtitles: params.generateSubtitles,
      episodes,
      assets: {
        characters: [],
        scenes: [],
        props: [],
        voices: [],
        videos: [],
      },
      assetsParsed: false,
      createdAt: new Date().toISOString(),
    };

    await mkdir(projectDir, { recursive: true });
    const episodeDir = path.resolve(projectDir, "episode");
    assertSafeProjectPath(episodeDir);
    await mkdir(episodeDir, { recursive: true });

    const scriptPath = path.resolve(projectDir, "script.md");
    assertSafeProjectPath(scriptPath);
    await writeFile(scriptPath, params.fileContent, "utf8");
    await Promise.all(
      episodes.map((episode) => {
        const episodeStoryboardPath = path.resolve(episodeDir, `${episode.id}.json`);
        assertSafeProjectPath(episodeStoryboardPath);

        // Each episode starts with an empty storyboard list that the canvas can append to later.
        return writeFile(episodeStoryboardPath, JSON.stringify([], null, 2), "utf8");
      }),
    );

    await writeProjectDetail(project);
    await writeCurrentProjectDetail(project);

    return { success: true, projectId };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}
