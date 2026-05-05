import { NextResponse } from "next/server";
import { listProjects } from "@/lib/services/project-service";

function toErrorResponse() {
  return NextResponse.json({ message: "projects:error" }, { status: 400 });
}

export async function GET() {
  try {
    const result = await listProjects();
    if (!result.success) return toErrorResponse();

    return NextResponse.json({ projects: result.projects });
  } catch {
    return toErrorResponse();
  }
}
