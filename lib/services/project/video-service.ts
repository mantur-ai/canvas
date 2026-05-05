// Video asset actions: manage uploaded files, storyboard links, and local ffmpeg merges.
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { v4 as createUuid } from "uuid";
import type { ProjectStoryboard, ProjectVideoAsset } from "@/lib/project-types";
import type { CreateProjectVideoInput, ProjectTempImageInput } from "./shared";
import {
  VIDEO_FILE_PATTERN,
  FFMPEG_COMMAND,
  assertSafeProjectPath,
  createProjectVideoCover,
  ensureProjectVideoCovers,
  downloadRemoteGeneratedFile,
  execFileAsync,
  getProjectDir,
  getProjectTempDir,
  getVideoExtensionFromUrl,
  getProjectVideoFileNameFromUrl,
  getProjectVideosDir,
  getVideoExtension,
  getVideoFileContentType,
  quoteFfmpegConcatPath,
  readProjectVideoAssets,
  readProjectVideoDuration,
  updateProjectStoryboard,
  updateProjectStoryboards,
} from "./shared";

export async function getProjectVideos(
  projectId: string,
): Promise<{ success: true; videos: ProjectVideoAsset[] } | { success: false; error: string }> {
  try {
    const videosJsonPath = path.resolve(getProjectDir(projectId), "videos", "videos.json");
    assertSafeProjectPath(videosJsonPath);

    try {
      const content = await readFile(videosJsonPath, "utf8");
      const videos = await ensureProjectVideoCovers({
        projectId,
        videos: readProjectVideoAssets(JSON.parse(content)),
        videosJsonPath,
      });
      return { success: true, videos };
    } catch {
      return { success: true, videos: [] };
    }
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function createProjectVideo(params: {
  projectId: string;
  video: CreateProjectVideoInput;
}): Promise<
  | { success: true; video: ProjectVideoAsset; videos: ProjectVideoAsset[] }
  | { success: false; error: string }
> {
  try {
    const videosDir = path.resolve(getProjectDir(params.projectId), "videos");
    const videosJsonPath = path.resolve(videosDir, "videos.json");
    assertSafeProjectPath(videosDir);
    assertSafeProjectPath(videosJsonPath);

    await mkdir(videosDir, { recursive: true });
    const currentVideos = await readFile(videosJsonPath, "utf8")
      .then((content) => readProjectVideoAssets(JSON.parse(content)))
      .catch(() => []);
    const id = `video-${createUuid()}`;
    const video: ProjectVideoAsset = {
      apiUrl: "",
      id,
      cover: "",
      coverUrl: "",
      duration: "",
      name: params.video.name,
      poster: "",
      prompt: params.video.prompt,
      source: params.video.source,
      status: "",
      url: "",
    };
    const videos = [video, ...currentVideos];
    await writeFile(videosJsonPath, JSON.stringify(videos, null, 2), "utf8");

    return { success: true, video, videos };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function updateProjectVideoFile(params: {
  file: ProjectTempImageInput;
  projectId: string;
  videoId: string;
}): Promise<
  | { success: true; video: ProjectVideoAsset; videos: ProjectVideoAsset[] }
  | { success: false; error: string }
> {
  try {
    const videosDir = path.resolve(getProjectDir(params.projectId), "videos");
    const videosJsonPath = path.resolve(videosDir, "videos.json");
    assertSafeProjectPath(videosDir);
    assertSafeProjectPath(videosJsonPath);

    await mkdir(videosDir, { recursive: true });
    const content = await readFile(videosJsonPath, "utf8");
    const currentVideos = readProjectVideoAssets(JSON.parse(content));
    const currentVideo = currentVideos.find((video) => video.id === params.videoId);
    if (!currentVideo) return { success: false, error: "VIDEO_NOT_FOUND" };

    const extension = getVideoExtension(params.file.contentType, params.file.name);
    const fileName = `${params.videoId}.${extension}`;
    const filePath = path.resolve(videosDir, fileName);
    assertSafeProjectPath(filePath);
    await writeFile(filePath, params.file.buffer);
    const cover = await createProjectVideoCover({
      projectId: params.projectId,
      videoFilePath: filePath,
    });
    const duration = (await readProjectVideoDuration(filePath)) || currentVideo.duration;

    const nextVideo: ProjectVideoAsset = {
      ...currentVideo,
      cover: cover || currentVideo.cover,
      coverUrl: cover || currentVideo.coverUrl,
      duration,
      poster: cover || currentVideo.poster,
      source: currentVideo.source || "local",
      url: `/api/projects/${encodeURIComponent(params.projectId)}/videos/${encodeURIComponent(fileName)}`,
    };
    const videos = currentVideos.map((video) => (video.id === params.videoId ? nextVideo : video));
    await writeFile(videosJsonPath, JSON.stringify(videos, null, 2), "utf8");

    return { success: true, video: nextVideo, videos };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function storeGeneratedProjectVideo(params: {
  cover?: string;
  duration?: string;
  name?: string;
  projectId: string;
  resultUrl: string;
  source?: string;
  status?: string;
  videoId: string;
}): Promise<
  | { success: true; video: ProjectVideoAsset; videos: ProjectVideoAsset[] }
  | { success: false; error: string }
> {
  try {
    const videosDir = path.resolve(getProjectDir(params.projectId), "videos");
    const videosJsonPath = path.resolve(videosDir, "videos.json");
    assertSafeProjectPath(videosDir);
    assertSafeProjectPath(videosJsonPath);

    await mkdir(videosDir, { recursive: true });
    const fallbackExtension = getVideoExtensionFromUrl(params.resultUrl) || "mp4";
    const remoteFile = await downloadRemoteGeneratedFile({
      fallbackExtension,
      sourceUrl: params.resultUrl,
      type: "video",
    });
    const fileName = `${params.videoId}.${remoteFile.extension}`;
    if (!VIDEO_FILE_PATTERN.test(fileName)) {
      return { success: false, error: "INVALID_VIDEO_FILE_NAME" };
    }

    const filePath = path.resolve(videosDir, fileName);
    assertSafeProjectPath(filePath);
    await writeFile(filePath, remoteFile.buffer);

    const currentVideos = await readFile(videosJsonPath, "utf8")
      .then((content) => readProjectVideoAssets(JSON.parse(content)))
      .catch(() => []);
    const currentVideo = currentVideos.find((video) => video.id === params.videoId);
    const generatedCover =
      (await createProjectVideoCover({
        projectId: params.projectId,
        videoFilePath: filePath,
      })) ||
      params.cover ||
      currentVideo?.cover ||
      currentVideo?.coverUrl ||
      currentVideo?.poster ||
      "";
    const duration =
      (await readProjectVideoDuration(filePath)) || params.duration || currentVideo?.duration || "";
    const nextVideo: ProjectVideoAsset = {
      apiUrl: remoteFile.sourceUrl,
      id: params.videoId,
      cover: generatedCover,
      coverUrl: generatedCover,
      duration,
      name: params.name ?? currentVideo?.name ?? "",
      poster: generatedCover,
      prompt: "",
      source: params.source ?? currentVideo?.source ?? "generate",
      status: params.status ?? "",
      url: `/api/projects/${encodeURIComponent(params.projectId)}/videos/${encodeURIComponent(fileName)}`,
    };
    const videos = currentVideo
      ? currentVideos.map((video) => (video.id === params.videoId ? nextVideo : video))
      : [nextVideo, ...currentVideos];
    await writeFile(videosJsonPath, JSON.stringify(videos, null, 2), "utf8");

    return { success: true, video: nextVideo, videos };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function addProjectVideoToStoryboard(params: {
  projectId: string;
  storyboardId: string;
  videoId: string;
}): Promise<
  | { success: true; episodeId: string; storyboards: ProjectStoryboard[] }
  | { success: false; error: string }
> {
  return updateProjectStoryboard({
    projectId: params.projectId,
    update: (storyboard) => {
      if (storyboard.id !== params.storyboardId) return storyboard;
      if (storyboard.videos.includes(params.videoId)) return storyboard;

      return {
        ...storyboard,
        videos: [params.videoId, ...storyboard.videos],
      };
    },
  });
}

export async function setProjectStoryboardSelectedVideo(params: {
  projectId: string;
  storyboardId: string;
  videoId: string;
}): Promise<
  | { success: true; episodeId: string; storyboards: ProjectStoryboard[] }
  | { success: false; error: string }
> {
  return updateProjectStoryboard({
    projectId: params.projectId,
    update: (storyboard) => {
      if (storyboard.id !== params.storyboardId) return storyboard;

      return {
        ...storyboard,
        selectedVideo: params.videoId,
        videos: storyboard.videos.includes(params.videoId)
          ? storyboard.videos
          : [params.videoId, ...storyboard.videos],
      };
    },
  });
}

export async function clearProjectStoryboardSelectedVideo(params: {
  projectId: string;
  storyboardId: string;
  videoId: string;
}): Promise<
  | { success: true; episodeId: string; storyboards: ProjectStoryboard[] }
  | { success: false; error: string }
> {
  return updateProjectStoryboard({
    projectId: params.projectId,
    update: (storyboard) => {
      if (storyboard.id !== params.storyboardId || storyboard.selectedVideo !== params.videoId) {
        return storyboard;
      }

      return {
        ...storyboard,
        selectedVideo: "",
      };
    },
  });
}

export async function deleteProjectVideo(params: {
  projectId: string;
  videoId: string;
}): Promise<{ success: true; videos: ProjectVideoAsset[] } | { success: false; error: string }> {
  try {
    const videosJsonPath = path.resolve(getProjectDir(params.projectId), "videos", "videos.json");
    assertSafeProjectPath(videosJsonPath);

    const content = await readFile(videosJsonPath, "utf8");
    const videos = readProjectVideoAssets(JSON.parse(content));
    const nextVideos = videos.filter((video) => video.id !== params.videoId);

    await writeFile(videosJsonPath, JSON.stringify(nextVideos, null, 2), "utf8");
    const storyboardUpdate = await updateProjectStoryboards({
      projectId: params.projectId,
      update: (storyboard) => {
        if (
          !storyboard.videos.includes(params.videoId) &&
          storyboard.selectedVideo !== params.videoId
        ) {
          return storyboard;
        }

        return {
          ...storyboard,
          selectedVideo:
            storyboard.selectedVideo === params.videoId ? "" : storyboard.selectedVideo,
          videos: storyboard.videos.filter((videoId) => videoId !== params.videoId),
        };
      },
    });
    if (!storyboardUpdate.success) return storyboardUpdate;

    return { success: true, videos: nextVideos };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function mergeProjectVideos(params: {
  projectId: string;
  videoIds: string[];
}): Promise<{ success: true; buffer: Buffer } | { success: false; error: string }> {
  try {
    const videosDir = getProjectVideosDir(params.projectId);
    const tempDir = getProjectTempDir(params.projectId);
    const videosJsonPath = path.resolve(videosDir, "videos.json");
    assertSafeProjectPath(videosJsonPath);

    const videoIds = params.videoIds.filter((videoId) => videoId);
    if (videoIds.length === 0) return { success: false, error: "NO_VIDEO_SELECTED" };

    await mkdir(tempDir, { recursive: true });

    const videos = await readFile(videosJsonPath, "utf8")
      .then((content) => readProjectVideoAssets(JSON.parse(content)))
      .catch(() => []);
    const selectedVideos = videoIds.flatMap((videoId) => {
      const video = videos.find((item) => item.id === videoId);
      return video ? [video] : [];
    });
    if (selectedVideos.length !== videoIds.length) {
      return { success: false, error: "VIDEO_NOT_FOUND" };
    }

    const inputPaths: string[] = [];
    for (const video of selectedVideos) {
      const fileName = getProjectVideoFileNameFromUrl(params.projectId, video.url);
      if (!fileName) continue;

      const filePath = path.resolve(videosDir, fileName);
      assertSafeProjectPath(filePath);
      const exists = await access(filePath).then(
        () => true,
        () => false,
      );
      if (exists) inputPaths.push(filePath);
    }
    if (inputPaths.length !== selectedVideos.length) {
      return { success: false, error: "VIDEO_FILE_NOT_FOUND" };
    }

    // Merge output is ephemeral: write to the project temp dir, stream back to the
    // client, and delete it. The browser saves the file to the user-picked folder.
    const mergeId = `video-${createUuid()}`;
    const listPath = path.resolve(tempDir, `${mergeId}.txt`);
    const outputPath = path.resolve(tempDir, `${mergeId}.mp4`);
    assertSafeProjectPath(listPath);
    assertSafeProjectPath(outputPath);

    // ffmpeg's concat demuxer needs a local manifest; only validated project video files are listed.
    await writeFile(
      listPath,
      inputPaths.map((filePath) => `file ${quoteFfmpegConcatPath(filePath)}`).join("\n"),
      "utf8",
    );

    try {
      try {
        await execFileAsync(FFMPEG_COMMAND, [
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          listPath,
          "-c",
          "copy",
          outputPath,
        ]);
      } catch {
        await execFileAsync(FFMPEG_COMMAND, [
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          listPath,
          "-c:v",
          "libx264",
          "-c:a",
          "aac",
          "-movflags",
          "+faststart",
          outputPath,
        ]);
      }

      const buffer = await readFile(outputPath);
      return { success: true, buffer };
    } finally {
      await rm(listPath, { force: true }).catch(() => {
        // The manifest is generated per merge and can be ignored if cleanup is blocked.
      });
      await rm(outputPath, { force: true }).catch(() => {
        // The merged file has already been streamed to the client; cleanup is best-effort.
      });
    }
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

export async function readProjectVideoFile(params: {
  fileName: string;
  projectId: string;
}): Promise<
  { success: true; buffer: Buffer; contentType: string } | { success: false; error: string }
> {
  try {
    if (!VIDEO_FILE_PATTERN.test(params.fileName)) {
      return { success: false, error: "INVALID_VIDEO_FILE_NAME" };
    }

    const filePath = path.resolve(getProjectDir(params.projectId), "videos", params.fileName);
    assertSafeProjectPath(filePath);
    const buffer = await readFile(filePath);

    return {
      success: true,
      buffer,
      contentType: getVideoFileContentType(params.fileName),
    };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}
