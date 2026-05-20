import "server-only";

import { createAsyncTask } from "@/lib/services/project/async-task-service";
import { updateProjectStoryboardPrompt } from "@/lib/services/project/canvas-service";
import { readConfig } from "@/lib/services/config-service";
import { storeGeneratedProjectVideo } from "@/lib/services/project/video-service";
import {
  GenerationError,
  type GenerationAttachment,
  logGenerationStep,
  replacePromptMentionsWithLabels,
  resolveGenerationReferences,
  readProjectGenerationConfig,
} from "./shared";

type GenerateVideoInput = {
  attachments: GenerationAttachment[];
  mediaId: string;
  projectId: string;
  prompt: string;
  storyboardId: string;
  videoOptions?: {
    durationSeconds?: number;
    shotType?: string;
  };
};

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readByPath(value: unknown, path: string) {
  let cursor = value;
  for (const part of path.split(".")) {
    if (typeof cursor !== "object" || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function parseVideoResult(payload: unknown) {
  const resultUrl = [
    "metadata.url",
    "data.url",
    "data.video_url",
    "url",
    "video_url",
  ].map((path) => readString(readByPath(payload, path))).find(Boolean) ?? "";
  const taskId = [
    "task.id",
    "task_id",
    "taskId",
    "id",
  ].map((path) => readString(readByPath(payload, path))).find(Boolean) ?? "";

  return { resultUrl, taskId };
}

function readProviderError(payload: unknown) {
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object" || payload === null) return "";
  const record = payload as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  if (typeof record.error === "string") return record.error;
  const error = record.error;
  if (typeof error === "object" && error !== null && typeof (error as Record<string, unknown>).message === "string") {
    return (error as Record<string, string>).message;
  }
  return "";
}

function parseProviderJson(text: string) {
  try {
    return text ? JSON.parse(text) as unknown : {};
  } catch {
    return {};
  }
}

async function resolveVideoModel(projectVideoModel: Awaited<ReturnType<typeof readProjectGenerationConfig>>["config"]["videoModel"]) {
  const appConfig = await readConfig();
  const fallback = appConfig.videoModels[0];
  const fixedModel =
    appConfig.videoModels.find((model) => model.id === projectVideoModel?.id) ??
    appConfig.videoModels.find((model) => model.name === projectVideoModel?.name) ??
    fallback;
  const apiKey = projectVideoModel?.apiKey?.trim() || fixedModel?.apiKey?.trim() || "";
  return fixedModel ? { ...fixedModel, apiKey } : null;
}

function isHappyhorseModel(model: { id?: string; name?: string; providerId?: string }) {
  return Boolean(
    model.providerId === "happyhorse" ||
    model.id === "fixed-video-happyhorse-1-r2v" ||
    model.name?.toLowerCase().includes("happyhorse"),
  );
}

function buildVideoProviderRequest(params: {
  duration: number;
  finalPrompt: string;
  happyhorse: boolean;
  project: { aspectRatio: string; generateAudio: boolean; resolution: string };
  references: { publicUrl: string }[];
}) {
  if (params.happyhorse) {
    return {
      body: {
        duration: params.duration,
        images: params.references.map((reference) => reference.publicUrl),
        metadata: { ratio: params.project.aspectRatio },
        model: "happyhorse-1.0-r2v",
        prompt: params.finalPrompt,
        size: "720P",
      },
      model: "happyhorse-1.0-r2v",
    };
  }

  return {
    body: {
      metadata: {
        content: params.references.map((reference) => ({
          image_url: { url: reference.publicUrl },
          role: "reference_image",
          type: "image_url",
        })),
        duration: params.duration,
        generate_audio: params.project.generateAudio,
        ratio: params.project.aspectRatio,
        resolution: params.project.resolution,
      },
      model: "doubao-seedance-2-0-260128",
      prompt: params.finalPrompt,
    },
    model: "doubao-seedance-2-0-260128",
  };
}

export async function generateProjectVideo(input: GenerateVideoInput) {
  logGenerationStep("video:start", {
    attachmentCount: input.attachments.length,
    mediaId: input.mediaId,
    projectId: input.projectId,
    storyboardId: input.storyboardId,
    videoOptions: input.videoOptions,
  });
  const { config, project } = await readProjectGenerationConfig(input.projectId);
  const videoModel = await resolveVideoModel(config.videoModel);
  if (!videoModel?.apiKey.trim()) {
    throw new GenerationError("VIDEO_KEY_MISSING", "视频模型 API Key 未配置");
  }
  logGenerationStep("video:model", {
    mediaId: input.mediaId,
    modelId: videoModel.id,
    modelName: videoModel.name,
    projectId: input.projectId,
    providerId: videoModel.providerId,
  });

  const promptUpdate = await updateProjectStoryboardPrompt({
    field: "videoPrompt",
    projectId: input.projectId,
    prompt: input.prompt,
    storyboardId: input.storyboardId,
  });
  if (!promptUpdate.success) throw new GenerationError("VIDEO_PROMPT_SAVE_FAILED", "视频提示词保存失败");
  logGenerationStep("video:prompt-saved", {
    field: "storyboard.videoPrompt",
    mediaId: input.mediaId,
    projectId: input.projectId,
    storyboardId: input.storyboardId,
  });

  const references = await resolveGenerationReferences({
    attachments: input.attachments,
    projectId: input.projectId,
    prompt: input.prompt,
  });
  const happyhorse = isHappyhorseModel(videoModel);
  const prompt = replacePromptMentionsWithLabels(
    input.prompt,
    references,
    (index) => happyhorse ? `[Image ${index + 1}]` : `@图片${index + 1}`,
  );
  const duration = input.videoOptions?.durationSeconds ?? 5;
  const shotText = input.videoOptions?.shotType ? ` Shot type: ${input.videoOptions.shotType}.` : "";
  const finalPrompt = `${prompt}${shotText}`;
  const providerRequest = buildVideoProviderRequest({
    duration,
    finalPrompt,
    happyhorse,
    project,
    references,
  });
  logGenerationStep("video:provider-request", {
    duration,
    mediaId: input.mediaId,
    model: providerRequest.model,
    projectId: input.projectId,
    referenceCount: references.length,
    storyboardId: input.storyboardId,
  });

  const response = await fetch("https://api-direct.sumone.hk/v1/videos", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${videoModel.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(providerRequest.body),
  });
  const text = await response.text();
  const payload = parseProviderJson(text);
  logGenerationStep("video:provider-response", {
    mediaId: input.mediaId,
    projectId: input.projectId,
    responsePreview: response.ok ? undefined : text.slice(0, 500),
    status: response.status,
    storyboardId: input.storyboardId,
  });
  if (!response.ok) {
    throw new GenerationError("VIDEO_PROVIDER_ERROR", readProviderError(payload) || "视频生成接口调用失败");
  }

  const result = parseVideoResult(payload);
  logGenerationStep("video:provider-result", {
    hasTaskId: Boolean(result.taskId),
    hasUrl: Boolean(result.resultUrl),
    mediaId: input.mediaId,
    projectId: input.projectId,
    storyboardId: input.storyboardId,
  });
  if (result.resultUrl) {
    const stored = await storeGeneratedProjectVideo({
      duration: String(duration),
      prompt: input.prompt,
      projectId: input.projectId,
      resultUrl: result.resultUrl,
      source: "generate",
      storyboardId: input.storyboardId,
      videoId: input.mediaId,
    });
    if (!stored.success) throw new GenerationError("VIDEO_STORE_FAILED", "视频保存失败");
    logGenerationStep("video:stored", {
      mediaId: input.mediaId,
      projectId: input.projectId,
      storyboardId: input.storyboardId,
    });
    return { mode: "stored" as const, video: stored.video, videos: stored.videos };
  }

  if (!result.taskId) {
    throw new GenerationError("VIDEO_RESULT_EMPTY", "视频生成接口未返回任务 ID 或视频 URL");
  }

  const task = await createAsyncTask({
    duration: String(duration),
    mediaId: input.mediaId,
    mediaType: "video",
    prompt: input.prompt,
    projectId: input.projectId,
    source: "generate",
    storyboardId: input.storyboardId,
    poll: {
      headers: { Authorization: `Bearer ${videoModel.apiKey}` },
      method: "GET",
      url: `https://api-direct.sumone.hk/v1/videos/${encodeURIComponent(result.taskId)}`,
    },
    responseSchema: {
      failureValues: ["failed", "error", "cancelled", "canceled", "timeout"],
      statusPath: "task.status",
      successValues: ["completed", "succeeded", "success", "done"],
      urlPath: "metadata.url",
    },
  });
  if (!task.success) throw new GenerationError("VIDEO_TASK_FAILED", "视频异步任务注册失败");
  logGenerationStep("video:task-registered", {
    mediaId: input.mediaId,
    projectId: input.projectId,
    providerTaskId: result.taskId,
    storyboardId: input.storyboardId,
    taskId: task.task.id,
  });

  return { mode: "task" as const, task: task.task };
}
