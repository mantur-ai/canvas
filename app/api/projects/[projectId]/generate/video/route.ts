import { NextResponse } from "next/server";
import { generateProjectVideo } from "@/lib/services/generation/video-generation-service";
import type { GenerationAttachment } from "@/lib/services/generation/shared";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readAttachments(value: unknown): GenerationAttachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      fileName: readString(item.fileName) || undefined,
      id: readString(item.id) || undefined,
      label: readString(item.label) || undefined,
      name: readString(item.name) || undefined,
      url: readString(item.url) || undefined,
    }));
}

function readVideoOptions(value: unknown) {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  return {
    durationSeconds: readNumber(record.durationSeconds),
    shotType: readString(record.shotType) || undefined,
  };
}

function toErrorResponse(error: unknown, status = 400) {
  return NextResponse.json(
    { message: error instanceof Error ? error.message : typeof error === "string" ? error : "video-generation:error" },
    { status },
  );
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const mediaId = readString(body.mediaId);
    const prompt = readString(body.prompt);
    const storyboardId = readString(body.storyboardId);
    console.log("[code-generation-route:video] request", {
      attachmentCount: Array.isArray(body.attachments) ? body.attachments.length : 0,
      mediaId,
      projectId,
      storyboardId,
      videoOptions: readVideoOptions(body.videoOptions),
    });
    if (!mediaId || !prompt || !storyboardId) return toErrorResponse("INVALID_VIDEO_GENERATION_INPUT");

    const result = await generateProjectVideo({
      attachments: readAttachments(body.attachments),
      mediaId,
      projectId,
      prompt,
      storyboardId,
      videoOptions: readVideoOptions(body.videoOptions),
    });

    console.log("[code-generation-route:video] success", {
      mediaId,
      mode: result.mode,
      projectId,
      storyboardId,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[code-generation-route:video] error", {
      message: err instanceof Error ? err.message : String(err),
    });
    return toErrorResponse(err, 500);
  }
}
