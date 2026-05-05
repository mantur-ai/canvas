import { NextResponse } from "next/server";
import { mergeProjectVideos } from "@/lib/services/project-service";

function toErrorResponse(message = "project-videos-merge:error") {
  return NextResponse.json({ message }, { status: 400 });
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as { videoIds?: unknown };
    const videoIds = Array.isArray(body.videoIds)
      ? body.videoIds.filter((videoId): videoId is string => typeof videoId === "string")
      : [];

    const result = await mergeProjectVideos({ projectId, videoIds });
    if (!result.success) {
      console.error("[videos/merge] merge failed:", result.error);
      return toErrorResponse(result.error);
    }

    // Stream the merged file back as a one-shot binary response; the client writes
    // it straight to the user-picked folder; nothing is persisted on the server.
    return new Response(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(result.buffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[videos/merge] route error:", err);
    return toErrorResponse();
  }
}
