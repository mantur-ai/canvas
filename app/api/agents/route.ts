import { NextResponse } from "next/server";
import {
  createAgent,
  deleteAgent,
  listAgents,
  updateAgent,
} from "@/lib/services/agent-service";
import type { CreateAgentInput, UpdateAgentInput } from "@/lib/agent-schema";

function toErrorResponse() {
  return NextResponse.json(
    { message: "agent:error" },
    { status: 400 },
  );
}

export async function GET() {
  try {
    const agents = await listAgents();
    return NextResponse.json({ agents });
  } catch {
    return toErrorResponse();
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateAgentInput;
    console.log("POST /api/agents body:", JSON.stringify(body));
    const agent = await createAgent(body);

    return NextResponse.json({ agent });
  } catch (err) {
    console.error("POST /api/agents error:", err);
    return toErrorResponse();
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as UpdateAgentInput;
    const agent = await updateAgent(body);

    return NextResponse.json({ agent });
  } catch {
    return toErrorResponse();
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { id?: string };

    if (!body.id) {
      return toErrorResponse();
    }

    await deleteAgent(body.id);
    return NextResponse.json({ ok: true });
  } catch {
    return toErrorResponse();
  }
}
