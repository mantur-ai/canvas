import type { AgentRecord } from "@/lib/agent-schema";

export type AgentStreamKind = "claude" | "codex" | "generic" | "hermes" | "openclaw" | "opencode";

type ResolveAgentCommandOptions = {
  ephemeral?: boolean;
  isFirstMessage: boolean;
  sessionId?: string;
};

type ResolvedAgentCommand = {
  args: string[];
  executable: string;
  streamKind: AgentStreamKind;
};

export function getGlobalAgentStreamKind(agent: AgentRecord): AgentStreamKind {
  const normalizedCommand = (agent.instructions || agent.name).trim().toLowerCase();

  if (normalizedCommand.includes("opencode")) return "opencode";
  if (normalizedCommand.includes("claude")) return "claude";
  if (normalizedCommand.includes("codex")) return "codex";
  if (normalizedCommand.includes("openclaw")) return "openclaw";
  if (normalizedCommand.includes("hermes")) return "hermes";
  return "generic";
}

export function resolveGlobalAgentCommand(
  agent: AgentRecord,
  commandText: string,
  options: ResolveAgentCommandOptions,
): ResolvedAgentCommand {
  const executable = (agent.instructions || agent.name).trim();
  const streamKind = getGlobalAgentStreamKind(agent);
  const flatText = `"${commandText.replace(/\r?\n/g, " ").trim()}"`;

  if (streamKind === "opencode") {
    const args = ["run", flatText];
    if (!options.ephemeral && !options.isFirstMessage) {
      args.push("--continue");
    }
    return { args, executable, streamKind };
  }

  if (streamKind === "claude") {
    const args = ["-p", commandText, "--verbose", "--effort", "high"];
    if (!options.ephemeral && !options.isFirstMessage) {
      args.push("--continue");
    }
    return { args, executable, streamKind };
  }

  if (streamKind === "codex") {
    const args = ["exec", "--json", "--full-auto"];
    const sessionId = options.sessionId?.trim();

    if (!options.ephemeral && sessionId) {
      args.push("resume", sessionId, flatText);
    } else {
      args.push(flatText);
    }

    return { args, executable, streamKind };
  }

  if (streamKind === "openclaw") {
    const args = ["agent"];
    if (!options.ephemeral && options.sessionId) args.push("--session-id", options.sessionId);
    args.push("--message", flatText);
    return { args, executable, streamKind };
  }

  if (streamKind === "hermes") {
    const args = ["chat", "-q", commandText];
    if (!options.ephemeral && options.sessionId) args.push("--resume", options.sessionId);
    return { args, executable, streamKind };
  }

  return { args: [flatText], executable, streamKind };
}
