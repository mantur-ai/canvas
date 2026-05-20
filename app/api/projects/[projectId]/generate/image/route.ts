import { NextResponse } from "next/server";
import { generateProjectImage } from "@/lib/services/generation/image-generation-service";
import type { GenerationAttachment } from "@/lib/services/generation/shared";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
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

function toErrorResponse(error: unknown, status = 400) {
  return NextResponse.json(
    { message: error instanceof Error ? error.message : typeof error === "string" ? error : "image-generation:error" },
    { status },
  );
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const mediaId = readString(body.mediaId);
    const prompt = readString(body.prompt);
    const target = readString(body.target);
    console.log("[code-generation-route:image] request", {
      attachmentCount: Array.isArray(body.attachments) ? body.attachments.length : 0,
      mediaId,
      projectId,
      storyboardId: readString(body.storyboardId) || undefined,
      target,
    });
    if (!mediaId || !prompt) return toErrorResponse("INVALID_IMAGE_GENERATION_INPUT");

    const result = await generateProjectImage({
      attachments: readAttachments(body.attachments),
      mediaId,
      projectId,
      prompt,
      storyboardId: readString(body.storyboardId) || undefined,
      target: target === "storyboard" ? "storyboard" : "asset",
    });

    console.log("[code-generation-route:image] success", {
      hasUrl: Boolean(result.image.url?.trim()),
      mediaId,
      projectId,
    });
    return NextResponse.json({ image: result.image, images: result.images });
  } catch (err) {
    console.error("[code-generation-route:image] error", {
      message: err instanceof Error ? err.message : String(err),
    });
    return toErrorResponse(err, 500);
  }
}
