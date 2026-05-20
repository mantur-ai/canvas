import "server-only";

import { storeGeneratedProjectImage, updateProjectImagePrompt } from "@/lib/services/project/image-service";
import { updateProjectStoryboardPrompt } from "@/lib/services/project/canvas-service";
import {
  GenerationError,
  type GenerationAttachment,
  logGenerationStep,
  replacePromptMentionsWithLabels,
  resolveGenerationReferences,
  readProjectGenerationConfig,
} from "./shared";
import { readConfig } from "@/lib/services/config-service";

type GenerateImageInput = {
  attachments: GenerationAttachment[];
  mediaId: string;
  projectId: string;
  prompt: string;
  storyboardId?: string;
  target: "asset" | "storyboard";
};

function parseImageResult(payload: unknown) {
  const record = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
  const data = Array.isArray(record.data) ? record.data[0] as Record<string, unknown> | undefined : undefined;
  const resultUrl =
    (typeof data?.url === "string" && data.url) ||
    (typeof record.url === "string" && record.url) ||
    (typeof record.resultUrl === "string" && record.resultUrl) ||
    "";
  const resultBase64 =
    (typeof data?.b64_json === "string" && data.b64_json) ||
    (typeof record.b64_json === "string" && record.b64_json) ||
    (typeof record.resultBase64 === "string" && record.resultBase64) ||
    "";

  return { resultBase64, resultUrl };
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

async function resolveImageModel(projectImageModel: Awaited<ReturnType<typeof readProjectGenerationConfig>>["config"]["imageModel"]) {
  const appConfig = await readConfig();
  const fallback = appConfig.imageModels[0];
  const fixedModel =
    appConfig.imageModels.find((model) => model.id === projectImageModel?.id) ??
    appConfig.imageModels.find((model) => model.name === projectImageModel?.name) ??
    fallback;
  const apiKey = projectImageModel?.apiKey?.trim() || fixedModel?.apiKey?.trim() || "";
  return fixedModel ? { ...fixedModel, apiKey } : null;
}

function isSeedreamModel(model: { id?: string; name?: string; providerId?: string }) {
  return (
    model.providerId === "seedream" ||
    model.id === "fixed-image-seedream-5-lite" ||
    model.name?.toLowerCase().includes("seedream")
  );
}

export async function generateProjectImage(input: GenerateImageInput) {
  logGenerationStep("image:start", {
    attachmentCount: input.attachments.length,
    mediaId: input.mediaId,
    projectId: input.projectId,
    storyboardId: input.storyboardId,
    target: input.target,
  });
  const { config } = await readProjectGenerationConfig(input.projectId);
  const imageModel = await resolveImageModel(config.imageModel);
  if (!imageModel?.apiKey.trim()) {
    throw new GenerationError("IMAGE_KEY_MISSING", "图片模型 API Key 未配置");
  }
  logGenerationStep("image:model", {
    mediaId: input.mediaId,
    modelId: imageModel.id,
    modelName: imageModel.name,
    projectId: input.projectId,
    providerId: imageModel.providerId,
  });

  if (input.target === "storyboard" && input.storyboardId) {
    const promptUpdate = await updateProjectStoryboardPrompt({
      field: "prompt",
      projectId: input.projectId,
      prompt: input.prompt,
      storyboardId: input.storyboardId,
    });
    if (!promptUpdate.success) throw new GenerationError("IMAGE_PROMPT_SAVE_FAILED", "图片提示词保存失败");
    logGenerationStep("image:prompt-saved", {
      field: "storyboard.prompt",
      mediaId: input.mediaId,
      projectId: input.projectId,
      storyboardId: input.storyboardId,
    });
  } else {
    const promptUpdate = await updateProjectImagePrompt({
      imageId: input.mediaId,
      projectId: input.projectId,
      prompt: input.prompt,
    });
    if (!promptUpdate.success) throw new GenerationError("IMAGE_PROMPT_SAVE_FAILED", "图片提示词保存失败");
    logGenerationStep("image:prompt-saved", {
      field: "image.prompt",
      mediaId: input.mediaId,
      projectId: input.projectId,
    });
  }

  const references = await resolveGenerationReferences({
    attachments: input.attachments,
    projectId: input.projectId,
    prompt: input.prompt,
  });
  const prompt = replacePromptMentionsWithLabels(input.prompt, references, (index) => `[Image ${index + 1}]`);
  const body =
    isSeedreamModel(imageModel)
      ? {
          ...(references.length > 0 ? { image: references.map((reference) => reference.publicUrl) } : {}),
          model: "doubao-seedream-5-0-260128",
          output_format: "png",
          prompt,
          sequential_image_generation: "disabled",
          size: "2K",
          watermark: false,
        }
      : {
          ...(references[0]?.publicUrl ? { image_url: references[0].publicUrl } : {}),
          model: "gpt-image-2",
          n: 1,
          prompt,
          quality: "high",
          response_format: "url",
          size: "1024x1024",
        };
  logGenerationStep("image:provider-request", {
    mediaId: input.mediaId,
    model: body.model,
    projectId: input.projectId,
    referenceCount: references.length,
    responseFormat: "response_format" in body ? body.response_format : undefined,
    seedream: isSeedreamModel(imageModel),
  });

  const response = await fetch("https://api-direct.sumone.hk/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${imageModel.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const payload = parseProviderJson(text);
  logGenerationStep("image:provider-response", {
    mediaId: input.mediaId,
    projectId: input.projectId,
    responsePreview: response.ok ? undefined : text.slice(0, 500),
    status: response.status,
  });
  if (!response.ok) {
    throw new GenerationError("IMAGE_PROVIDER_ERROR", readProviderError(payload) || "图片生成接口调用失败");
  }

  const result = parseImageResult(payload);
  logGenerationStep("image:provider-result", {
    hasBase64: Boolean(result.resultBase64),
    hasUrl: Boolean(result.resultUrl),
    mediaId: input.mediaId,
    projectId: input.projectId,
  });
  if (!result.resultUrl && !result.resultBase64) {
    throw new GenerationError("IMAGE_RESULT_EMPTY", "图片生成接口未返回可用图片");
  }

  const stored = await storeGeneratedProjectImage({
    imageId: input.mediaId,
    prompt: input.prompt,
    projectId: input.projectId,
    ...(result.resultBase64 ? { resultBase64: result.resultBase64 } : { resultUrl: result.resultUrl }),
  });
  if (!stored.success) throw new GenerationError("IMAGE_STORE_FAILED", "图片保存失败");
  logGenerationStep("image:stored", {
    hasUrl: Boolean(stored.image.url?.trim()),
    mediaId: input.mediaId,
    projectId: input.projectId,
  });

  return stored;
}
