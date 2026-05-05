import { NextResponse } from "next/server";
import { saveProjectEpisodeStoryboards } from "@/lib/services/project-service";

function toErrorResponse() {
  return NextResponse.json({ message: "project-episode:error" }, { status: 400 });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string; episodeId: string }> },
) {
  try {
    const { projectId, episodeId } = await context.params;
    const body = (await request.json()) as { storyboards?: unknown };
    if (!Array.isArray(body.storyboards)) return toErrorResponse();

    const result = await saveProjectEpisodeStoryboards({
      episodeId,
      projectId,
      storyboards: body.storyboards,
    });
    if (!result.success) return toErrorResponse();

    return NextResponse.json({ storyboards: result.storyboards });
  } catch {
    return toErrorResponse();
  }
}
