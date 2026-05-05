import { NextResponse } from "next/server";
import { saveProjectTempFiles } from "@/lib/services/project-service";

function toErrorResponse() {
  return NextResponse.json({ message: "project-temp:error" }, { status: 400 });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const formData = await request.formData();
    const files = formData
      .getAll("files")
      .filter((file): file is File => file instanceof File && file.size > 0);

    if (files.length === 0) return toErrorResponse();

    const images = await Promise.all(
      files.map(async (file) => ({
        buffer: Buffer.from(await file.arrayBuffer()),
        contentType: file.type || "application/octet-stream",
        name: file.name,
      })),
    );
    const result = await saveProjectTempFiles({ projectId, files: images });
    if (!result.success) return toErrorResponse();

    return NextResponse.json({ images: result.images });
  } catch {
    return toErrorResponse();
  }
}
