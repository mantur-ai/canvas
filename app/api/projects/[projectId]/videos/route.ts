import { NextResponse } from "next/server";
import {
  addProjectVideoToStoryboard,
  clearProjectStoryboardSelectedVideo,
  createProjectVideo,
  deleteProjectVideo,
  getProjectVideos,
  setProjectStoryboardSelectedVideo,
  storeGeneratedProjectVideo,
  updateProjectVideoFile,
} from "@/lib/services/project-service";

function toErrorResponse() {
  return NextResponse.json({ message: "project-videos:error" }, { status: 400 });
}

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await context.params;
    const result = await getProjectVideos(projectId);
    if (!result.success) return toErrorResponse();

    return NextResponse.json({ videos: result.videos });
  } catch {
    return toErrorResponse();
  }
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      name?: unknown;
      prompt?: unknown;
      source?: unknown;
    };
    const result = await createProjectVideo({
      projectId,
      video: {
        name: typeof body.name === "string" ? body.name : "",
        prompt: typeof body.prompt === "string" ? body.prompt : "",
        source: typeof body.source === "string" ? body.source : "manual",
      },
    });
    if (!result.success) return toErrorResponse();

    return NextResponse.json({ video: result.video, videos: result.videos });
  } catch {
    return toErrorResponse();
  }
}

export async function PUT(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await context.params;
    const formData = await request.formData();
    const videoId = formData.get("videoId");
    const file = formData.get("file");
    if (typeof videoId !== "string" || !(file instanceof File) || file.size === 0) {
      return toErrorResponse();
    }

    const result = await updateProjectVideoFile({
      projectId,
      videoId,
      file: {
        buffer: Buffer.from(await file.arrayBuffer()),
        contentType: file.type,
        name: file.name,
      },
    });
    if (!result.success) return toErrorResponse();

    return NextResponse.json({ video: result.video, videos: result.videos });
  } catch {
    return toErrorResponse();
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      action?: unknown;
      cover?: unknown;
      duration?: unknown;
      name?: unknown;
      resultUrl?: unknown;
      source?: unknown;
      status?: unknown;
      storyboardId?: unknown;
      videoId?: unknown;
    };
    if (
      body.action === "store-generated" &&
      typeof body.videoId === "string" &&
      typeof body.resultUrl === "string"
    ) {
      const result = await storeGeneratedProjectVideo({
        cover: typeof body.cover === "string" ? body.cover : undefined,
        duration: typeof body.duration === "string" ? body.duration : undefined,
        name: typeof body.name === "string" ? body.name : undefined,
        projectId,
        resultUrl: body.resultUrl,
        source: typeof body.source === "string" ? body.source : undefined,
        status: typeof body.status === "string" ? body.status : undefined,
        storyboardId: typeof body.storyboardId === "string" ? body.storyboardId : undefined,
        videoId: body.videoId,
      });
      if (!result.success) return toErrorResponse();

      return NextResponse.json({
        video: result.video,
        videos: result.videos,
      });
    }

    const storyboardId = typeof body.storyboardId === "string" ? body.storyboardId : "";
    const videoId = typeof body.videoId === "string" ? body.videoId : "";
    if (!storyboardId || !videoId) return toErrorResponse();

    const result =
      body.action === "clear-selection"
        ? await clearProjectStoryboardSelectedVideo({ projectId, storyboardId, videoId })
        : body.action === "select"
        ? await setProjectStoryboardSelectedVideo({ projectId, storyboardId, videoId })
        : await addProjectVideoToStoryboard({ projectId, storyboardId, videoId });
    if (!result.success) return toErrorResponse();

    return NextResponse.json({
      episodeId: result.episodeId,
      storyboards: result.storyboards,
    });
  } catch {
    return toErrorResponse();
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("videoId");
    if (!videoId) return toErrorResponse();

    const result = await deleteProjectVideo({ projectId, videoId });
    if (!result.success) return toErrorResponse();

    return NextResponse.json({ videos: result.videos });
  } catch {
    return toErrorResponse();
  }
}
