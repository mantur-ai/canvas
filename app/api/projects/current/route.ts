import { NextResponse } from "next/server";
import {
  clearCurrentProject,
  getCurrentProject,
  setCurrentProject,
} from "@/lib/services/project-service";

function toErrorResponse() {
  return NextResponse.json({ message: "current-project:error" }, { status: 400 });
}

export async function GET() {
  try {
    const result = await getCurrentProject();
    if (!result.success) return toErrorResponse();

    return NextResponse.json({ project: result.project });
  } catch {
    return toErrorResponse();
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { projectId?: string };
    if (!body.projectId) return toErrorResponse();

    const result = await setCurrentProject(body.projectId);
    if (!result.success) return toErrorResponse();

    return NextResponse.json({ project: result.project });
  } catch {
    return toErrorResponse();
  }
}

export async function DELETE() {
  try {
    const result = await clearCurrentProject();
    if (!result.success) return toErrorResponse();

    return NextResponse.json({ ok: true });
  } catch {
    return toErrorResponse();
  }
}
