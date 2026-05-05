import { NextResponse } from "next/server";
import { readProjectTempImage } from "@/lib/services/project-service";

function toErrorResponse() {
  return NextResponse.json({ message: "project-temp-file:error" }, { status: 400 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; fileName: string }> },
) {
  try {
    const { projectId, fileName } = await context.params;
    const result = await readProjectTempImage({ projectId, fileName });
    if (!result.success) return toErrorResponse();

    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": result.contentType,
      },
    });
  } catch {
    return toErrorResponse();
  }
}
