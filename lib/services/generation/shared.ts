import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { readConfig } from "@/lib/services/config-service";
import type { ProjectConfig } from "@/lib/project-types";
import {
  getProjectImageFileNameFromUrl,
  getProjectImagesDir,
  getProjectTempDir,
  getTempFileContentType,
  normalizeProjectImageAssets,
  readProjectConfig,
  readProjectDetail,
  TEMP_FILE_PATTERN,
} from "@/lib/services/project/shared";
import { storeProjectImagePublicUrl } from "@/lib/services/project/image-service";

export type GenerationAttachment = {
  fileName?: string;
  id?: string;
  label?: string;
  name?: string;
  url?: string;
};

export type ResolvedReference = {
  id: string;
  label: string;
  publicUrl: string;
};

const MENTION_ID_PATTERN = /@\{([^}]+)\}/g;
const LOG_PREFIX = "[code-generation]";

export class GenerationError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function logGenerationStep(step: string, payload: Record<string, unknown>) {
  console.log(`${LOG_PREFIX}:${step}`, payload);
}

function getMentionIds(prompt: string) {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of prompt.matchAll(MENTION_ID_PATTERN)) {
    const id = match[1]?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function getAttachmentIds(attachments: GenerationAttachment[]) {
  return attachments.flatMap((attachment) => {
    const id = attachment.id?.trim();
    return id ? [id] : [];
  });
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getOrderedReferenceIds(prompt: string, attachments: GenerationAttachment[]) {
  const seen = new Set<string>();
  return [...getMentionIds(prompt), ...getAttachmentIds(attachments)].filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function getImageBedApiKey(projectId: string) {
  const projectConfigPath = path.resolve(getProjectTempDir(projectId), "..", "config.json");
  const projectConfig = await readFile(projectConfigPath, "utf8")
    .then((content) => readProjectConfig(JSON.parse(content)))
    .catch((): ProjectConfig => ({}));
  const projectKey = projectConfig.imageBed?.apiKey?.trim();
  if (projectKey) {
    logGenerationStep("image-bed-key", { projectId, source: "project-config" });
    return projectKey;
  }

  const appConfig = await readConfig();
  const imageBed = appConfig.imageBeds.find((item) => item.isDefault) ?? appConfig.imageBeds[0];
  logGenerationStep("image-bed-key", {
    imageBedId: imageBed?.id,
    imageBedName: imageBed?.name,
    projectId,
    source: "app-config",
  });
  return imageBed?.apiKey.trim() ?? "";
}

async function uploadToImageBed(projectId: string, params: { buffer: Buffer; name: string }) {
  const apiKey = await getImageBedApiKey(projectId);
  if (!apiKey) throw new GenerationError("IMAGE_BED_KEY_MISSING", "图床 API Key 未配置");

  logGenerationStep("image-bed-upload:start", {
    bytes: params.buffer.length,
    name: params.name,
    projectId,
  });

  const formData = new FormData();
  formData.set("image", params.buffer.toString("base64"));
  formData.set("name", params.name);

  const response = await fetch(
    `https://api.imgbb.com/1/upload?expiration=0&key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      body: formData,
    },
  );
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  const publicUrl =
    typeof payload === "object" && payload !== null
      ? ((payload as Record<string, unknown>).data as Record<string, unknown> | undefined)?.url
      : "";
  if (!response.ok || typeof publicUrl !== "string" || !publicUrl.trim()) {
    logGenerationStep("image-bed-upload:error", {
      name: params.name,
      projectId,
      responsePreview: text.slice(0, 300),
      status: response.status,
    });
    throw new GenerationError("IMAGE_BED_UPLOAD_FAILED", "图床上传失败");
  }

  logGenerationStep("image-bed-upload:success", {
    name: params.name,
    projectId,
    status: response.status,
  });
  return publicUrl.trim();
}

async function resolveProjectImageReference(projectId: string, imageId: string) {
  const images = await normalizeProjectImageAssets(projectId);
  const image = images.find((item) => item.id === imageId);
  if (!image) {
    logGenerationStep("reference:missing-project-image", { imageId, projectId });
    return null;
  }

  const label = image.name.trim() || image.id;
  if (image.publicUrl.trim()) {
    logGenerationStep("reference:reuse-public-url", { imageId: image.id, label, projectId });
    return { id: image.id, label, publicUrl: image.publicUrl.trim() };
  }

  const fileName = getProjectImageFileNameFromUrl(projectId, image.url);
  if (!fileName) {
    logGenerationStep("reference:no-local-file", { imageId: image.id, label, projectId });
    return { id: image.id, label, publicUrl: "" };
  }

  logGenerationStep("reference:upload-project-image", { fileName, imageId: image.id, label, projectId });
  const buffer = await readFile(path.resolve(getProjectImagesDir(projectId), fileName));
  const publicUrl = await uploadToImageBed(projectId, { buffer, name: label });
  await storeProjectImagePublicUrl({ imageId: image.id, projectId, publicUrl });
  logGenerationStep("reference:stored-public-url", { imageId: image.id, label, projectId });

  return { id: image.id, label, publicUrl };
}

async function resolveTempReference(projectId: string, attachment: GenerationAttachment) {
  if (!attachment.id) {
    return null;
  }

  const label = attachment.label || attachment.name || attachment.id;
  const url = attachment.url?.trim() ?? "";
  if (url && isHttpUrl(url)) {
    logGenerationStep("reference:use-attachment-url", {
      attachmentId: attachment.id,
      label,
      projectId,
    });
    return { id: attachment.id, label, publicUrl: url };
  }

  if (!attachment.fileName || !TEMP_FILE_PATTERN.test(attachment.fileName)) {
    logGenerationStep("reference:skip-temp", {
      attachmentId: attachment.id,
      fileName: attachment.fileName,
      projectId,
    });
    return null;
  }

  logGenerationStep("reference:upload-temp", {
    attachmentId: attachment.id,
    fileName: attachment.fileName,
    label,
    projectId,
  });
  const buffer = await readFile(path.resolve(getProjectTempDir(projectId), attachment.fileName));
  const publicUrl = await uploadToImageBed(projectId, {
    buffer,
    name: `${label}.${getTempFileContentType(attachment.fileName).split("/")[1] ?? "png"}`,
  });

  return { id: attachment.id, label, publicUrl };
}

export async function resolveGenerationReferences(params: {
  attachments: GenerationAttachment[];
  projectId: string;
  prompt: string;
}) {
  const attachmentsById = new Map(
    params.attachments.flatMap((attachment) => (attachment.id ? [[attachment.id, attachment]] : [])),
  );
  const references: ResolvedReference[] = [];
  const orderedIds = getOrderedReferenceIds(params.prompt, params.attachments);
  logGenerationStep("references:start", {
    attachmentCount: params.attachments.length,
    orderedIds,
    projectId: params.projectId,
  });

  for (const id of orderedIds) {
    const attachment = attachmentsById.get(id);
    const tempReference = attachment ? await resolveTempReference(params.projectId, attachment) : null;
    const projectReference = tempReference ?? (await resolveProjectImageReference(params.projectId, id));
    if (projectReference?.publicUrl) references.push(projectReference);
  }

  logGenerationStep("references:done", {
    projectId: params.projectId,
    resolvedCount: references.length,
    resolvedIds: references.map((reference) => reference.id),
  });
  return references;
}

export function replacePromptMentionsWithLabels(
  prompt: string,
  references: ResolvedReference[],
  labelForIndex: (index: number) => string,
) {
  const labelById = new Map(references.map((reference, index) => [reference.id, labelForIndex(index)]));
  return prompt.replaceAll(MENTION_ID_PATTERN, (match, id: string) => labelById.get(id) ?? match);
}

export async function readProjectGenerationConfig(projectId: string) {
  const project = await readProjectDetail(projectId);
  if (!project) throw new GenerationError("PROJECT_NOT_FOUND", "项目不存在");
  const config = await readFile(path.resolve(getProjectTempDir(projectId), "..", "config.json"), "utf8")
    .then((content) => readProjectConfig(JSON.parse(content)))
    .catch((): ProjectConfig => ({}));
  return { config, project };
}
