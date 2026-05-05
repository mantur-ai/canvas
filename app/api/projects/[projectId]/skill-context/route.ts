import { NextResponse } from "next/server";
import { createProjectSkillContext, deleteProjectSkillContext } from "@/lib/services/project-service";

function toErrorResponse() {
  return NextResponse.json({ message: "project-skill-context:error" }, { status: 400 });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      attachments?: unknown;
      text?: unknown;
    };
    const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];
    const attachments = rawAttachments.flatMap((attachment) => {
      if (typeof attachment !== "object" || attachment === null) return [];
      const record = attachment as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : "";
      if (!id) return [];

      return [
        {
          fileName: typeof record.fileName === "string" ? record.fileName : undefined,
          id,
          kind: typeof record.kind === "string" ? record.kind : undefined,
          label: typeof record.label === "string" ? record.label : undefined,
          name: typeof record.name === "string" ? record.name : undefined,
          type: typeof record.type === "string" ? record.type : undefined,
          url: typeof record.url === "string" ? record.url : undefined,
        },
      ];
    });

    const result = await createProjectSkillContext({
      attachments,
      projectId,
      text: typeof body.text === "string" ? body.text : "",
    });
    if (!result.success) return toErrorResponse();

    return NextResponse.json({
      contextDir: result.contextDir,
      files: result.files,
      manifestPath: result.manifestPath,
      references: result.references,
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
    const contextDir = searchParams.get("contextDir");
    if (!contextDir) return toErrorResponse();

    const result = await deleteProjectSkillContext({ contextDir, projectId });
    if (!result.success) return toErrorResponse();

    return NextResponse.json({ success: true });
  } catch {
    return toErrorResponse();
  }
}
