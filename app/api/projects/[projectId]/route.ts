import { NextResponse } from "next/server";
import { getProject } from "@/lib/services/project-service";

function toErrorResponse() {
  return NextResponse.json({ message: "project:error" }, { status: 400 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const result = await getProject(projectId);
    if (!result.success) return toErrorResponse();

    return NextResponse.json({ project: result.project });
  } catch {
    return toErrorResponse();
  }
}
