import { NextResponse } from "next/server";
import {
  deleteSkillFolder,
  listSkillFolders,
  uploadSkillFolder,
} from "@/lib/services/skill-service";

function toErrorResponse() {
  return NextResponse.json({ message: "skills:error" }, { status: 400 });
}

export async function GET() {
  try {
    const skills = await listSkillFolders();
    return NextResponse.json({ skills });
  } catch {
    return toErrorResponse();
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files");
    const paths = formData.getAll("paths");
    const category = formData.get("category");

    const uploadFiles = await Promise.all(
      files.map(async (file, index) => {
        if (!(file instanceof File)) throw new Error("Invalid upload file.");
        const relativePath = paths[index];
        if (typeof relativePath !== "string") throw new Error("Invalid upload path.");

        return {
          relativePath,
          content: await file.arrayBuffer(),
        };
      }),
    );
    const skill = await uploadSkillFolder(
      uploadFiles,
      typeof category === "string" ? category : undefined,
    );

    return NextResponse.json({ skill });
  } catch {
    return toErrorResponse();
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { name?: string };
    if (!body.name) return toErrorResponse();

    await deleteSkillFolder(body.name);
    return NextResponse.json({ ok: true });
  } catch {
    return toErrorResponse();
  }
}
