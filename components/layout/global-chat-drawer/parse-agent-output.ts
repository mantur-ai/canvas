import type { AgentStreamKind } from "./resolve-agent-command";

type ParsedAgentOutput = {
  final: string;
  process: string;
  threadId: string | null;
};

type JsonObject = Record<string, unknown>;

const ANSI_ESCAPE = String.fromCharCode(27);
const ANSI_BELL = String.fromCharCode(7);
const ANSI_PATTERN = new RegExp(
  `${ANSI_ESCAPE}\\[[0-9;]*[mGKHFABCDJM]|${ANSI_ESCAPE}\\][^${ANSI_BELL}]*${ANSI_BELL}`,
  "g",
);
const AGENT_BANNER_PATTERN = /^\[[^\]]+]\s*(?:🚀\s*)?(?:启动任务|Starting task):[^\n]*\n+/i;
const THINKING_BLOCK_PATTERN = /<thinking>([\s\S]*?)<\/thinking>/gi;
const REDACTED_THINKING_BLOCK_PATTERN =
  /`<redacted_thinking>`([\s\S]*?)`<\/redacted_thinking>`/gi;

function stripAnsi(text: string) {
  return text.replace(ANSI_PATTERN, "");
}

export function normalizeAgentStreamPreview(raw: string) {
  return stripAnsi(raw).replace(AGENT_BANNER_PATTERN, "").replace(/\r\n/g, "\n");
}

function formatCodexProcessItem(item: {
  aggregated_output?: string;
  command?: string;
  exit_code?: number | null;
  name?: string;
  text?: string;
  type?: string;
}) {
  const type = item.type ?? "item";
  if (typeof item.text === "string" && item.text.trim()) {
    return `**${type}**\n${item.text.trim()}\n\n`;
  }

  const title = [type, item.name, item.command].filter(Boolean).join(" - ");
  if (typeof item.aggregated_output === "string" && item.aggregated_output.trim()) {
    const exit = item.exit_code === undefined || item.exit_code === null ? "" : `\n(exit ${item.exit_code})`;
    return `**${title}**\n${item.aggregated_output.trim()}${exit}\n\n`;
  }

  return title ? `**${title}**\n\n` : "";
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringifyProcessValue(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function collectTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (!isJsonObject(item)) return "";

        if (typeof item.text === "string") return item.text;
        if (typeof item.content === "string") return item.content;
        if (typeof item.result === "string") return item.result;
        return "";
      })
      .filter(Boolean)
      .join("");
  }

  if (isJsonObject(content)) {
    if (typeof content.text === "string") return content.text;
    if (typeof content.content === "string") return content.content;
    if (typeof content.result === "string") return content.result;
  }

  return "";
}

function collectTextFromPayloads(payloads: unknown): string {
  if (!Array.isArray(payloads)) return "";

  return payloads
    .map((payload) => {
      if (!isJsonObject(payload)) return "";
      return typeof payload.text === "string" ? payload.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function readKnownFinalField(value: JsonObject) {
  const directKeys = [
    "result",
    "final",
    "final_message",
    "finalMessage",
    "message",
    "response",
    "output",
    "text",
  ];

  for (const key of directKeys) {
    const fieldValue = value[key];
    if (typeof fieldValue === "string" && fieldValue.trim()) return fieldValue;
  }

  const contentText = collectTextFromContent(value.content);
  if (contentText.trim()) return contentText;

  if (isJsonObject(value.message)) {
    const messageText = collectTextFromContent(value.message.content);
    if (messageText.trim()) return messageText;
  }

  const payloadText = collectTextFromPayloads(value.payloads);
  if (payloadText.trim()) return payloadText;

  return "";
}

function parseJsonLines(stdout: string) {
  const objects: JsonObject[] = [];
  const nonJsonLines: string[] = [];

  stdout.split(/\r?\n/).forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return;

    try {
      const parsed = JSON.parse(trimmedLine) as unknown;
      if (isJsonObject(parsed)) {
        objects.push(parsed);
        return;
      }
    } catch {
      // Fall through to text fallback.
    }

    nonJsonLines.push(line);
  });

  return { nonJsonLines, objects };
}

export function extractAgentSessionId(kind: AgentStreamKind, stdout: string) {
  const normalizedOutput = normalizeAgentStreamPreview(stdout);
  const { objects } = parseJsonLines(normalizedOutput);
  let sessionId: string | null = null;

  objects.forEach((event) => {
    if (typeof event.session_id === "string") sessionId = event.session_id;
    if (typeof event.sessionId === "string") sessionId = event.sessionId;
    if (typeof event.sessionID === "string") sessionId = event.sessionID;
    if (typeof event.thread_id === "string") sessionId = event.thread_id;
    if (typeof event.threadId === "string") sessionId = event.threadId;
    if (typeof event.threadID === "string") sessionId = event.threadID;

    const meta = isJsonObject(event.meta) ? event.meta : null;
    const agentMeta = meta && isJsonObject(meta.agentMeta) ? meta.agentMeta : null;
    if (typeof agentMeta?.sessionId === "string") sessionId = agentMeta.sessionId;
    if (typeof agentMeta?.session_id === "string") sessionId = agentMeta.session_id;
  });

  if (sessionId) return sessionId;

  if (kind === "hermes") {
    const hermesResumeMatch =
      normalizedOutput.match(/--?-?resume\s+([^\s]+)/i) ??
      normalizedOutput.match(/\bsession_id\s*:\s*([^\s]+)/i) ??
      normalizedOutput.match(/\bSession:\s*([^\s]+)(?:\s+Duration:|\s*$)/i);
    if (hermesResumeMatch?.[1]) return hermesResumeMatch[1].trim();

    const standaloneHermesSessionMatch = normalizedOutput.match(
      /^\s*(\d{8}_\d{6}_[a-z0-9]{4,})\s*$/im,
    );
    if (standaloneHermesSessionMatch?.[1]) return standaloneHermesSessionMatch[1].trim();
  }

  if (kind === "openclaw") {
    const openclawSessionMatch =
      normalizedOutput.match(/--session-id\s+([^\s]+)/i) ??
      normalizedOutput.match(/\bsession[_ -]?id\s*[:=]\s*([^\s]+)/i);
    if (openclawSessionMatch?.[1]) return openclawSessionMatch[1].trim();
  }

  return null;
}

function parseGenericJsonEvents(stdout: string, kind: AgentStreamKind): ParsedAgentOutput | null {
  const { nonJsonLines, objects } = parseJsonLines(normalizeAgentStreamPreview(stdout));
  if (objects.length === 0) return null;

  let final = "";
  const process: string[] = [];
  let threadId: string | null = null;

  objects.forEach((event) => {
    if (typeof event.session_id === "string") threadId = event.session_id;
    if (typeof event.sessionId === "string") threadId = event.sessionId;
    if (typeof event.sessionID === "string") threadId = event.sessionID;
    if (typeof event.thread_id === "string") threadId = event.thread_id;
    if (typeof event.threadId === "string") threadId = event.threadId;
    if (typeof event.threadID === "string") threadId = event.threadID;

    const meta = isJsonObject(event.meta) ? event.meta : null;
    const agentMeta = meta && isJsonObject(meta.agentMeta) ? meta.agentMeta : null;
    if (typeof agentMeta?.sessionId === "string") threadId = agentMeta.sessionId;
    if (typeof agentMeta?.session_id === "string") threadId = agentMeta.session_id;

    const eventType = typeof event.type === "string" ? event.type : "";
    const subtype = typeof event.subtype === "string" ? event.subtype : "";
    const eventText = readKnownFinalField(event);

    if (eventText.trim() && (eventType === "text" || Array.isArray(event.payloads))) {
      final = eventText;
      return;
    }

    if (kind === "claude") {
      if (eventType === "result") {
        if (eventText.trim()) final = eventText;
        return;
      }

      if (eventType === "assistant") {
        const assistantText = isJsonObject(event.message)
          ? collectTextFromContent(event.message.content)
          : eventText;
        if (assistantText.trim()) process.push(assistantText);
        return;
      }

      if (eventType === "stream_event" && isJsonObject(event.event)) {
        const streamEvent = event.event;
        const delta = isJsonObject(streamEvent.delta) ? streamEvent.delta : null;
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          process.push(delta.text);
          return;
        }
      }

      process.push(stringifyProcessValue(event));
      return;
    }

    if (
      eventType === "message" ||
      eventType === "assistant" ||
      eventType === "assistant_message" ||
      eventType === "agent_message" ||
      eventType === "result" ||
      subtype === "success"
    ) {
      if (eventText.trim()) final = eventText;
      else process.push(stringifyProcessValue(event));
      return;
    }

    const nestedText =
      isJsonObject(event.part) ? readKnownFinalField(event.part) : "";
    if (nestedText.trim() && /assistant|message|text|result|complete|finish/i.test(eventType)) {
      final = nestedText;
      return;
    }

    process.push(stringifyProcessValue(event));
  });

  if (nonJsonLines.length > 0) process.unshift(nonJsonLines.join("\n"));

  return {
    final: final.trim(),
    process: process.join("\n\n").trim(),
    threadId,
  };
}

export function parseCodexOutput(stdout: string): ParsedAgentOutput {
  let final = "";
  let process = "";
  let threadId: string | null = null;

  stdout.split(/\r?\n/).forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return;

    try {
      const event = JSON.parse(trimmedLine) as {
        item?: {
          aggregated_output?: string;
          command?: string;
          exit_code?: number | null;
          name?: string;
          text?: string;
          type?: string;
        };
        message?: string;
        thread_id?: string;
        type?: string;
      };

      if (event.type === "thread.started" && typeof event.thread_id === "string") {
        threadId = event.thread_id;
      }

      if (event.type === "error") {
        process += `**error**\n${event.message ?? trimmedLine}\n\n`;
        return;
      }

      if (event.type === "turn.failed") {
        process += `**turn.failed**\n${event.message ?? trimmedLine}\n\n`;
        return;
      }

      if (event.type === "item.completed" && event.item) {
        if (event.item.type === "agent_message" && typeof event.item.text === "string") {
          final += event.item.text;
          return;
        }

        process += formatCodexProcessItem(event.item);
      }
    } catch {
      process += `${line}\n`;
    }
  });

  return {
    final: final.trim(),
    process: normalizeAgentStreamPreview(process).trim(),
    threadId,
  };
}

function extractBlocks(text: string, pattern: RegExp) {
  const blocks: string[] = [];
  const nextText = text.replace(pattern, (_match, body: string) => {
    if (body.trim()) blocks.push(body.trim());
    return "";
  });

  return { blocks, text: nextText };
}

function stripHermesPanelDecorations(text: string) {
  return text
    .split("\n")
    .flatMap((line) => {
      const trimmedLine = line.trim();
      if (/^╭.*╮$/.test(trimmedLine) || /^╰.*╯$/.test(trimmedLine)) return [];

      const unicodePanel = line.match(/^(\s*)[│┃]\s?(.*)$/);
      if (unicodePanel) return `${unicodePanel[1] ?? ""}${unicodePanel[2] ?? ""}`;

      const asciiPanel = line.match(/^(\s*)\|\s+(\S.*)$/);
      const isMarkdownTable = (trimmedLine.match(/\|/g) ?? []).length >= 2;
      if (asciiPanel && !isMarkdownTable) return `${asciiPanel[1] ?? ""}${asciiPanel[2] ?? ""}`;

      return line;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isHermesHeaderLine(line: string) {
  return /Hermes/i.test(line) && /^[\s╭┌|─━═╴╶]*[^\n]*Hermes/i.test(line);
}

function isDecorativeLine(line: string) {
  const trimmedLine = line.trim();
  if (!trimmedLine) return true;
  if (/^[╭╰┌└][\s─━═╴╶╷╵┐┘╮╯]*$/.test(trimmedLine)) return true;
  if (/^[─━═╴╶\-_]{3,}$/.test(trimmedLine)) return true;
  return false;
}

function stripPanelLine(line: string) {
  const unicodePanel = line.match(/^(\s*)[│┃]\s?(.*)$/);
  if (unicodePanel) return `${unicodePanel[1] ?? ""}${unicodePanel[2] ?? ""}`;

  const asciiPanel = line.match(/^(\s*)\|\s+(\S.*)$/);
  const pipeCount = (line.trim().match(/\|/g) ?? []).length;
  if (asciiPanel && pipeCount < 2) return `${asciiPanel[1] ?? ""}${asciiPanel[2] ?? ""}`;

  return line;
}

function extractHermesTranscript(raw: string) {
  const lines = normalizeAgentStreamPreview(raw).split("\n");
  const blocks: Array<{ content: string; end: number; start: number }> = [];

  lines.forEach((line, index) => {
    if (!isHermesHeaderLine(line)) return;

    let cursor = index + 1;
    while (cursor < lines.length && isDecorativeLine(lines[cursor])) cursor += 1;

    const contentLines: string[] = [];
    let end = cursor;

    while (end < lines.length) {
      const currentLine = lines[end];
      const normalizedLine = stripPanelLine(currentLine);
      const trimmedLine = normalizedLine.trim();

      if (isHermesHeaderLine(currentLine)) break;

      if (contentLines.length > 0 && (isDecorativeLine(currentLine) || isToolLine(trimmedLine, "hermes"))) {
        break;
      }

      if (trimmedLine || contentLines.length > 0) {
        contentLines.push(normalizedLine);
      }

      end += 1;
    }

    const content = contentLines.join("\n").trim();
    if (content) {
      blocks.push({
        content,
        end,
        start: index,
      });
    }
  });

  if (blocks.length === 0) return null;

  const finalBlock = blocks[blocks.length - 1];
  const process = [
    ...lines.slice(0, finalBlock.start),
    ...lines.slice(finalBlock.end),
  ]
    .join("\n")
    .trim();

  return {
    final: stripHermesPanelDecorations(finalBlock.content).trim(),
    process: normalizeAgentStreamPreview(process).trim(),
  };
}

function isToolLine(line: string, kind: AgentStreamKind) {
  const trimmedLine = line.trim();
  if (!trimmedLine) return false;

  if (/^\[[^\]]+]\s*(?:🚀\s*)?(?:启动任务|Starting task):/i.test(trimmedLine)) return true;
  if (/^Query:\s*/i.test(trimmedLine)) return true;
  if (/^Initializing agent/i.test(trimmedLine)) return true;
  if (/^\[plugins\]/i.test(trimmedLine)) return true;
  if (/^(\$|#)\s/.test(trimmedLine)) return true;
  if (/^(read_file|write_file|edit_file|delete_file|apply_patch|search_replace)\b/i.test(trimmedLine)) return true;
  if (/^(reading|read|listing|preparing|running|executing|tool|command|shell|bash)\b/i.test(trimmedLine)) return true;
  if (/^(git|npm|pnpm|yarn|npx|bun|node|python|python3|curl|wget|ls|cat|grep|find|sed|awk)\b/i.test(trimmedLine)) return true;
  if (/^(Session|session_id|Duration|Messages|Tokens?|Cost|Model):\s*/i.test(trimmedLine)) return true;
  if (/^\d{8}_\d{6}_[a-f0-9]{4,}$/i.test(trimmedLine)) return true;
  if (/^⏺\s/u.test(trimmedLine) || trimmedLine.startsWith("⎿")) return true;
  if (/^[dl-][rwx-]{9}\+?@?\s+\d+\s/.test(trimmedLine) || /^total\s+\d+$/i.test(trimmedLine)) return true;
  if (/^>\s*build\b/i.test(trimmedLine)) return true;
  if (/^https?:\/\/\S+$/.test(trimmedLine)) return true;
  if (/^\s*"[^"]+"\s*:/.test(trimmedLine)) return true;
  if (/^\s*[[{]\s*$/.test(trimmedLine) || /^[}\]],?\s*$/.test(trimmedLine)) return true;

  if (kind !== "hermes" && /^\|\s+\S/.test(trimmedLine)) {
    const pipeCount = (trimmedLine.match(/\|/g) ?? []).length;
    if (pipeCount <= 2 && !/\|\s*[-:]{3,}\s*\|/.test(trimmedLine)) return true;
  }

  return false;
}

function splitLeadingProcess(text: string, kind: AgentStreamKind) {
  const lines = text.split("\n");
  const processLines: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim() && processLines.length > 0) {
      processLines.push(line);
      index += 1;
      continue;
    }

    if (!isToolLine(line, kind)) break;

    processLines.push(line);
    index += 1;
  }

  return {
    final: lines.slice(index).join("\n").trim(),
    process: processLines.join("\n").trim(),
  };
}

function splitTrailingMetrics(text: string) {
  const lines = text.split("\n");
  const metrics: string[] = [];
  let index = lines.length - 1;

  while (index >= 0) {
    const line = lines[index];
    const trimmedLine = line.trim();
    if (!trimmedLine && metrics.length === 0) {
      index -= 1;
      continue;
    }

    if (!isToolLine(trimmedLine, "generic")) break;
    metrics.unshift(line);
    index -= 1;
  }

  return {
    final: lines.slice(0, index + 1).join("\n").trim(),
    process: metrics.join("\n").trim(),
  };
}

export function parsePlainAgentOutput(kind: AgentStreamKind, stdout: string): ParsedAgentOutput {
  if (kind === "claude" || kind === "opencode" || kind === "openclaw") {
    const parsedJsonEvents = parseGenericJsonEvents(stdout, kind);
    if (parsedJsonEvents) return parsedJsonEvents;
  }

  if (kind === "hermes") {
    const hermesTranscript = extractHermesTranscript(stdout);
    if (hermesTranscript) {
      return {
        final: hermesTranscript.final,
        process: hermesTranscript.process,
        threadId: extractAgentSessionId(kind, stdout),
      };
    }
  }

  let text = normalizeAgentStreamPreview(stdout).trim();
  const collectedProcess: string[] = [];

  const thinking = extractBlocks(text, THINKING_BLOCK_PATTERN);
  text = thinking.text;
  collectedProcess.push(...thinking.blocks);

  const redactedThinking = extractBlocks(text, REDACTED_THINKING_BLOCK_PATTERN);
  text = redactedThinking.text;
  collectedProcess.push(...redactedThinking.blocks);

  if (kind === "hermes") {
    text = stripHermesPanelDecorations(text);
  }

  const leading = splitLeadingProcess(text, kind);
  text = leading.final;
  if (leading.process) collectedProcess.push(leading.process);

  const trailing = splitTrailingMetrics(text);
  text = trailing.final;
  if (trailing.process) collectedProcess.push(trailing.process);

  return {
    final: text.trim(),
    process: collectedProcess.filter(Boolean).join("\n\n").trim(),
    threadId: extractAgentSessionId(kind, stdout),
  };
}

export function parseAgentOutput(kind: AgentStreamKind, stdout: string): ParsedAgentOutput {
  if (kind === "codex") return parseCodexOutput(stdout);
  return parsePlainAgentOutput(kind, stdout);
}
