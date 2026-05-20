import { NextResponse } from "next/server";
import {
  cancelAsyncTask,
  createAsyncTask,
  getAsyncTask,
  listAsyncTasks,
  type AsyncTaskMediaType,
} from "@/lib/services/project/async-task-service";

export const dynamic = "force-dynamic";
// Long enough that the route stays alive while in-process polling runs; the
// actual poll loop uses setTimeout and continues regardless of any one request.
export const maxDuration = 60;

function toErrorResponse(error?: string, status = 400) {
  return NextResponse.json({ message: error ?? "async-tasks:error" }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readMediaType(value: unknown): AsyncTaskMediaType | null {
  const text = readString(value);
  return text === "video" || text === "image" ? text : null;
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const mediaId = readString(body.mediaId);
    const mediaType = readMediaType(body.mediaType);
    if (!mediaId || !mediaType) return toErrorResponse("INVALID_TARGET");
    if (!isRecord(body.poll)) return toErrorResponse("INVALID_POLL");
    if (!isRecord(body.responseSchema)) return toErrorResponse("INVALID_RESPONSE_SCHEMA");

    const result = await createAsyncTask({
      projectId,
      mediaId,
      mediaType,
      name: readString(body.name) || undefined,
      source: readString(body.source) || undefined,
      cover: readString(body.cover) || undefined,
      duration: readString(body.duration) || undefined,
      category: readString(body.category) || undefined,
      parentId: readString(body.parentId) || undefined,
      prompt: readString(body.prompt) || undefined,
      storyboardId: readString(body.storyboardId) || undefined,
      poll: {
        url: readString(body.poll.url),
        method: readString(body.poll.method).toUpperCase() === "POST" ? "POST" : "GET",
        headers:
          isRecord(body.poll.headers)
            ? Object.fromEntries(
                Object.entries(body.poll.headers).filter(
                  ([key, value]) => typeof key === "string" && typeof value === "string",
                ) as [string, string][],
              )
            : {},
        body: readString(body.poll.body) || undefined,
      },
      responseSchema: {
        statusPath: readString(body.responseSchema.statusPath) || undefined,
        successValues: Array.isArray(body.responseSchema.successValues)
          ? (body.responseSchema.successValues.filter((value) => typeof value === "string") as string[])
          : undefined,
        failureValues: Array.isArray(body.responseSchema.failureValues)
          ? (body.responseSchema.failureValues.filter((value) => typeof value === "string") as string[])
          : undefined,
        urlPath: readString(body.responseSchema.urlPath),
        errorPath: readString(body.responseSchema.errorPath) || undefined,
      },
      intervalMs: typeof body.intervalMs === "number" ? body.intervalMs : undefined,
      maxDurationMs: typeof body.maxDurationMs === "number" ? body.maxDurationMs : undefined,
    });

    if (!result.success) return toErrorResponse(result.error);
    return NextResponse.json({ task: result.task });
  } catch (err) {
    return toErrorResponse(err instanceof Error ? err.message : "UNKNOWN_ERROR", 500);
  }
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await context.params;
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId")?.trim() ?? "";
    if (taskId) {
      const result = await getAsyncTask({ projectId, taskId });
      if (!result.success) return toErrorResponse(result.error, 404);
      return NextResponse.json({ task: result.task });
    }

    const mediaId = searchParams.get("mediaId")?.trim() || undefined;
    const result = await listAsyncTasks({ projectId, mediaId });
    if (!result.success) return toErrorResponse(result.error);
    return NextResponse.json({ tasks: result.tasks });
  } catch (err) {
    return toErrorResponse(err instanceof Error ? err.message : "UNKNOWN_ERROR", 500);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await context.params;
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId")?.trim() ?? "";
    if (!taskId) return toErrorResponse("INVALID_TASK_ID");

    const result = await cancelAsyncTask({ projectId, taskId });
    if (!result.success) return toErrorResponse(result.error, 404);
    return NextResponse.json({ task: result.task });
  } catch (err) {
    return toErrorResponse(err instanceof Error ? err.message : "UNKNOWN_ERROR", 500);
  }
}
