import { NextResponse } from "next/server";
import { appConfigSchema, type AppConfig } from "@/lib/config-schema";
import { readConfig, writeConfig } from "@/lib/services/config-service";

function toErrorResponse() {
  return NextResponse.json({ message: "config:error" }, { status: 400 });
}

export async function GET() {
  try {
    const config = await readConfig();
    return NextResponse.json({ config });
  } catch {
    return toErrorResponse();
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { config?: AppConfig };
    const config = appConfigSchema.parse(body.config);
    const savedConfig = await writeConfig(config);

    return NextResponse.json({ config: savedConfig });
  } catch {
    return toErrorResponse();
  }
}
