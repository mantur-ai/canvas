import { NextResponse } from "next/server";
import { readProjectVideoFile } from "@/lib/services/project-service";

function toErrorResponse() {
  return NextResponse.json({ message: "project-video-file:error" }, { status: 404 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; fileName: string }> },
) {
  try {
    const { fileName, projectId } = await context.params;
    const result = await readProjectVideoFile({ fileName, projectId });
    if (!result.success) return toErrorResponse();
    const body = Uint8Array.from(result.buffer).buffer;

    return new NextResponse(body, {
      headers: {
        "Content-Type": result.contentType,
      },
    });
  } catch {
    return toErrorResponse();
  }
}
