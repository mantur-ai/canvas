import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { v4 as createUuid } from "uuid";
import {
  agentDbSchema,
  createAgentInputSchema,
  updateAgentInputSchema,
  type AgentDb,
  type AgentRecord,
  type CreateAgentInput,
  type UpdateAgentInput,
} from "@/lib/agent-schema";

const PROJECT_ROOT = process.cwd();
const AGENT_DB_DIR = path.resolve(PROJECT_ROOT, "db");
const AGENT_DB_PATH = path.resolve(AGENT_DB_DIR, "agent.json");
const EMPTY_AGENT_DB: AgentDb = { agents: [] };

function assertSafeProjectPath(targetPath: string) {
  if (!targetPath.startsWith(PROJECT_ROOT)) {
    throw new Error("Invalid agent database path.");
  }
}

async function ensureAgentDbFile() {
  assertSafeProjectPath(AGENT_DB_DIR);
  assertSafeProjectPath(AGENT_DB_PATH);

  await mkdir(AGENT_DB_DIR, { recursive: true });

  try {
    await readFile(AGENT_DB_PATH, "utf8");
  } catch {
    await writeFile(
      AGENT_DB_PATH,
      JSON.stringify(EMPTY_AGENT_DB, null, 2),
      "utf8",
    );
  }
}

async function readAgentDb(): Promise<AgentDb> {
  await ensureAgentDbFile();

  try {
    const raw = await readFile(AGENT_DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    return agentDbSchema.parse(parsed);
  } catch {
    await writeAgentDb(EMPTY_AGENT_DB);
    return EMPTY_AGENT_DB;
  }
}

async function writeAgentDb(data: AgentDb) {
  await ensureAgentDbFile();
  await writeFile(AGENT_DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

export async function listAgents(): Promise<AgentRecord[]> {
  const db = await readAgentDb();
  return db.agents;
}

export async function createAgent(input: CreateAgentInput): Promise<AgentRecord> {
  try {
    const validated = createAgentInputSchema.parse(input);
    const db = await readAgentDb();

    const agent: AgentRecord = {
      id: createUuid(),
      ...validated,
    };

    await writeAgentDb({
      agents: [...db.agents, agent],
    });

    return agent;
  } catch (err) {
    console.error("createAgent error:", err);
    throw err;
  }
}

export async function updateAgent(input: UpdateAgentInput): Promise<AgentRecord> {
  const validated = updateAgentInputSchema.parse(input);
  const db = await readAgentDb();
  const index = db.agents.findIndex((agent) => agent.id === validated.id);

  if (index === -1) {
    throw new Error("Agent not found.");
  }

  const nextAgents = [...db.agents];
  nextAgents[index] = validated;

  await writeAgentDb({
    agents: nextAgents,
  });

  return validated;
}

export async function deleteAgent(agentId: string): Promise<void> {
  const db = await readAgentDb();
  const nextAgents = db.agents.filter((agent) => agent.id !== agentId);

  if (nextAgents.length === db.agents.length) {
    throw new Error("Agent not found.");
  }

  await writeAgentDb({
    agents: nextAgents,
  });
}
