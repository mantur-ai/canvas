import { NextResponse } from "next/server";
import type {
  ProjectSelectedImageBedInfo,
  ProjectSelectedModelInfo,
  ProjectSelectedModelType,
} from "@/lib/project-types";
import {
  getProjectConfig,
  saveProjectConfig,
} from "@/lib/services/project-service";

function toErrorResponse() {
  return NextResponse.json({ message: "project-config:error" }, { status: 400 });
}

function readModelType(value: unknown): ProjectSelectedModelType | null {
  return value === "image" || value === "video" ? value : null;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseSelectedModel(value: unknown): ProjectSelectedModelInfo | null {
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  const id = readOptionalString(record.id);
  const name = readOptionalString(record.name);
  const apiKey = readOptionalString(record.apiKey);
  const example = readOptionalString(record.example);
  const type = readModelType(record.type);

  if (!id || !name || !apiKey || !example || !type) return null;

  return {
    apiKey,
    example,
    id,
    name,
    selectedAt: new Date().toISOString(),
    type,
    ...(type === "video"
      ? { videoReferenceMode: readOptionalString(record.videoReferenceMode) ?? "all-purpose" }
      : {}),
  };
}

function parseSelectedImageBed(value: unknown): ProjectSelectedImageBedInfo | null {
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  const id = readOptionalString(record.id);
  const name = readOptionalString(record.name);
  const apiKey = readOptionalString(record.apiKey);
  const example = readOptionalString(record.example);

  if (!id || !name || !apiKey || !example) return null;

  return {
    apiKey,
    example,
    id,
    isDefault: typeof record.isDefault === "boolean" ? record.isDefault : false,
    name,
    selectedAt: new Date().toISOString(),
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const result = await getProjectConfig(projectId);
    if (!result.success) return toErrorResponse();

    return NextResponse.json({ config: result.config });
  } catch {
    return toErrorResponse();
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      imageBed?: unknown;
      selectedModel?: unknown;
    };
    const imageBed = parseSelectedImageBed(body.imageBed);
    const selectedModel = parseSelectedModel(body.selectedModel);
    if (!imageBed && !selectedModel) return toErrorResponse();

    const configResult = await saveProjectConfig({
      projectId,
      ...(selectedModel ? { model: selectedModel } : {}),
      ...(imageBed ? { imageBed } : {}),
    });
    if (!configResult.success) return toErrorResponse();

    return NextResponse.json({ config: configResult.config });
  } catch {
    return toErrorResponse();
  }
}
