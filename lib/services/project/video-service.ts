// Video asset actions: manage uploaded files, storyboard links, and local ffmpeg merges.
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { v4 as createUuid } from "uuid";
import type { ProjectStoryboard, ProjectVideoAsset } from "@/lib/project-types";
import type { CreateProjectVideoInput, ProjectTempImageInput } from "./shared";
import {
  VIDEO_FILE_PATTERN,
  FFMPEG_COMMAND,
  FFPROBE_COMMAND,
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

async function hasAudioStream(videoFilePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(FFPROBE_COMMAND, [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=index",
      "-of",
      "csv=p=0",
      videoFilePath,
    ]);

    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function ensureVideoAudioTrack(params: {
  inputPath: string;
  outputPath: string;
}): Promise<{ path: string; generated: boolean }> {
  if (await hasAudioStream(params.inputPath)) {
    return { path: params.inputPath, generated: false };
  }

  await execFileAsync(FFMPEG_COMMAND, [
    "-y",
    "-i",
    params.inputPath,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    params.outputPath,
  ]);

  return { path: params.outputPath, generated: true };
}

async function transcodeProjectVideoForBrowser(params: {
  inputPath: string;
  outputPath: string;
}): Promise<void> {
  const hasAudio = await hasAudioStream(params.inputPath);
  const audioInputArgs = hasAudio
    ? []
    : ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"];
  const audioMapArgs = hasAudio ? ["-map", "0:a:0"] : ["-map", "1:a:0", "-shortest"];

  await execFileAsync(FFMPEG_COMMAND, [
    "-y",
    "-i",
    params.inputPath,
    ...audioInputArgs,
    "-map",
    "0:v:0",
    ...audioMapArgs,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    params.outputPath,
  ]);
}

async function removeProjectVideoFiles(params: {
  keepFileName?: string;
  projectId: string;
  videoId: string;
  videoUrl: string;
}): Promise<void> {
  const videosDir = getProjectVideosDir(params.projectId);
  const fileNames = new Set<string>();
  const currentFileName = getProjectVideoFileNameFromUrl(params.projectId, params.videoUrl);
  if (currentFileName) fileNames.add(currentFileName);

  const videoFiles = await readdir(videosDir).catch((): string[] => []);
  videoFiles
    .filter(
      (fileName) => fileName.startsWith(`${params.videoId}.`) && VIDEO_FILE_PATTERN.test(fileName),
    )
    .forEach((fileName) => fileNames.add(fileName));

  await Promise.all(
    [...fileNames].filter((fileName) => fileName !== params.keepFileName).map(async (fileName) => {
      const filePath = path.resolve(videosDir, fileName);
      assertSafeProjectPath(filePath);
      await rm(filePath, { force: true });
    }),
  );
}

async function confirmProjectVideoHasStoryboardLink(params: {
  projectId: string;
  videoId: string;
}) {
  return updateProjectStoryboard({
    projectId: params.projectId,
    update: (storyboard) =>
      storyboard.videos.includes(params.videoId) ? { ...storyboard } : storyboard,
  });
}

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
    const tempDir = getProjectTempDir(params.projectId);
    const videosJsonPath = path.resolve(videosDir, "videos.json");
    assertSafeProjectPath(videosDir);
    assertSafeProjectPath(tempDir);
    assertSafeProjectPath(videosJsonPath);

    await mkdir(videosDir, { recursive: true });
    const content = await readFile(videosJsonPath, "utf8");
    const currentVideos = readProjectVideoAssets(JSON.parse(content));
    const currentVideo = currentVideos.find((video) => video.id === params.videoId);
    if (!currentVideo) return { success: false, error: "VIDEO_NOT_FOUND" };

    const sourceExtension = getVideoExtension(params.file.contentType, params.file.name);
    const uploadSourcePath = path.resolve(tempDir, `${params.videoId}-upload.${sourceExtension}`);
    const fileName = `${params.videoId}.mp4`;
    const filePath = path.resolve(videosDir, fileName);
    assertSafeProjectPath(uploadSourcePath);
    assertSafeProjectPath(filePath);
    await mkdir(tempDir, { recursive: true });
    await writeFile(uploadSourcePath, params.file.buffer);

    try {
      await transcodeProjectVideoForBrowser({
        inputPath: uploadSourcePath,
        outputPath: filePath,
      });
    } finally {
      await rm(uploadSourcePath, { force: true }).catch(() => {
        // Uploaded source copy is only needed while transcoding.
      });
    }
    if (currentVideo.url) {
      await removeProjectVideoFiles({
        keepFileName: fileName,
        projectId: params.projectId,
        videoId: params.videoId,
        videoUrl: currentVideo.url,
      });
    }
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

export async function updateProjectVideoPrompt(params: {
  projectId: string;
  prompt: string;
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
    const currentVideos = await readFile(videosJsonPath, "utf8")
      .then((content) => readProjectVideoAssets(JSON.parse(content)))
      .catch(() => []);
    const currentVideo = currentVideos.find((video) => video.id === params.videoId);
    if (!currentVideo) return { success: false, error: "VIDEO_NOT_FOUND" };

    const nextVideo: ProjectVideoAsset = {
      ...currentVideo,
      prompt: params.prompt,
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
  prompt?: string;
  projectId: string;
  resultUrl: string;
  source?: string;
  status?: string;
  storyboardId?: string;
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
      prompt: params.prompt ?? currentVideo?.prompt ?? "",
      source: params.source ?? currentVideo?.source ?? "generate",
      status: params.status ?? "",
      url: `/api/projects/${encodeURIComponent(params.projectId)}/videos/${encodeURIComponent(fileName)}`,
    };
    const videos = currentVideo
      ? currentVideos.map((video) => (video.id === params.videoId ? nextVideo : video))
      : [nextVideo, ...currentVideos];
    await writeFile(videosJsonPath, JSON.stringify(videos, null, 2), "utf8");
    if (params.storyboardId) {
      const storyboardUpdate = await addProjectVideoToStoryboard({
        projectId: params.projectId,
        storyboardId: params.storyboardId,
        videoId: params.videoId,
      });
      if (!storyboardUpdate.success) {
        const existingStoryboardLink = await confirmProjectVideoHasStoryboardLink({
          projectId: params.projectId,
          videoId: params.videoId,
        });
        if (!existingStoryboardLink.success) return storyboardUpdate;
      }
    }

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
      if (storyboard.videos.includes(params.videoId)) {
        return { ...storyboard };
      }

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
    const currentVideo = videos.find((video) => video.id === params.videoId);
    const nextVideos = videos.filter((video) => video.id !== params.videoId);

    await writeFile(videosJsonPath, JSON.stringify(nextVideos, null, 2), "utf8");
    if (currentVideo?.url) {
      await removeProjectVideoFiles({
        projectId: params.projectId,
        videoId: params.videoId,
        videoUrl: currentVideo.url,
      });
    }
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
    const generatedAudioPaths: string[] = [];
    const mergeInputPaths: string[] = [];

    for (const [index, inputPath] of inputPaths.entries()) {
      const audioFixedPath = path.resolve(tempDir, `${mergeId}-audio-${index}.mp4`);
      assertSafeProjectPath(audioFixedPath);
      const mergeInput = await ensureVideoAudioTrack({
        inputPath,
        outputPath: audioFixedPath,
      });
      mergeInputPaths.push(mergeInput.path);
      if (mergeInput.generated) generatedAudioPaths.push(mergeInput.path);
    }

    // ffmpeg's concat demuxer needs a local manifest; only validated project video files are listed.
    await writeFile(
      listPath,
      mergeInputPaths.map((filePath) => `file ${quoteFfmpegConcatPath(filePath)}`).join("\n"),
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
      await Promise.all(
        generatedAudioPaths.map((filePath) =>
          rm(filePath, { force: true }).catch(() => {
            // Generated silent-audio inputs are temporary merge artifacts.
          }),
        ),
      );
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
