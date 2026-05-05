import { spawn } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { PROJECT_ROOT_PROMPT_TOKEN } from "@/lib/chat-prompts";
import enMessages from "@/messages/en.json";
import zhMessages from "@/messages/zh.json";

export const dynamic = "force-dynamic";
// Video providers commonly take 1–8 minutes per task and the agent polls until a
// final URL is returned. The 300 s default was killing the agent mid-poll
// (SIGKILL via stopChildProcess), surfacing as "stopped on running state".
export const maxDuration = 1800;

type ExecuteAgentRequest = {
  agentName?: unknown;
  args?: unknown;
  cwd?: unknown;
  executionId?: unknown;
  locale?: unknown;
};

type AgentExecuteMessages = typeof zhMessages.AgentExecute;
type AgentChildProcess = ReturnType<typeof spawn>;

const AGENT_EXECUTE_MESSAGES: Record<string, AgentExecuteMessages> = {
  en: enMessages.AgentExecute,
  zh: zhMessages.AgentExecute,
};
const RUNNING_AGENT_PROCESSES = new Map<string, AgentChildProcess>();
const REPLACEMENT_CHARACTER = "\uFFFD";

const formatMessage = (template: string, values: Record<string, string>) =>
  Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, value),
    template,
  );

const splitExecutable = (raw: string) => {
  const parts = Array.from(raw.matchAll(/"([^"]*)"|'([^']*)'|[^\s]+/g)).map((match) => {
    if (match[1] !== undefined) return match[1];
    if (match[2] !== undefined) return match[2];
    return match[0];
  });

  return {
    executable: parts[0] ?? "",
    prependArgs: parts.slice(1),
  };
};

const isClaudeCommand = (executable: string) =>
  /(^|[\\/])claude(?:\.(cmd|exe|bat))?$/i.test(executable.trim());

const resolveClaudePromptToStdin = (executable: string, args: string[], cwd: string) => {
  if (!isClaudeCommand(executable)) {
    const printFlagIndex = args.findIndex((arg) => arg === "-p" || arg === "--print");
    if (printFlagIndex < 0) {
      return { args, stdinText: null, tempFilePath: null };
    }

    const promptArg = args[printFlagIndex + 1];
    if (typeof promptArg !== "string") {
      return { args, stdinText: null, tempFilePath: null };
    }

    return { args, stdinText: promptArg, tempFilePath: null };
  }

  const printFlagIndex = args.findIndex((arg) => arg === "-p" || arg === "--print");
  if (printFlagIndex < 0) {
    return { args, stdinText: null, tempFilePath: null };
  }

  const promptArg = args[printFlagIndex + 1];
  if (typeof promptArg !== "string") {
    return { args, stdinText: null, tempFilePath: null };
  }

  const tempDir = path.join(cwd, ".claude_tmp");
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });

  const tempFileName = `claude_input_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`;
  const tempFilePath = path.join(tempDir, tempFileName);

  try {
    writeFileSync(tempFilePath, promptArg, "utf8");
  } catch {
    return { args, stdinText: promptArg, tempFilePath: null };
  }

  const relativeFilePath = `.claude_tmp/${tempFileName}`;
  const argsWithoutPrompt = [
    ...args.slice(0, printFlagIndex),
    "--permission-mode",
    "acceptEdits",
    args[printFlagIndex],
    `@${relativeFilePath}`,
    ...args.slice(printFlagIndex + 2),
  ];

  return {
    args: argsWithoutPrompt,
    stdinText: null,
    tempFilePath,
  };
};

const logAgentExecute = (label: string, payload: Record<string, unknown>) => {
  process.stdout.write(`[agent-execute:${label}] ${JSON.stringify(payload, null, 2)}\n`);
};

const createProcessOutputDecoder = () => {
  const utf8Decoder = new TextDecoder("utf-8");
  const windowsDecoder = process.platform === "win32" ? new TextDecoder("gb18030") : null;
  let useWindowsFallback = false;

  const decode = (data: Buffer) => {
    if (!windowsDecoder) return utf8Decoder.decode(data, { stream: true });
    if (useWindowsFallback) return windowsDecoder.decode(data, { stream: true });

    const decoded = utf8Decoder.decode(data, { stream: true });
    if (!decoded.includes(REPLACEMENT_CHARACTER)) return decoded;

    useWindowsFallback = true;
    return windowsDecoder.decode(data, { stream: true });
  };

  const flush = () => {
    if (!windowsDecoder || !useWindowsFallback) return utf8Decoder.decode();
    return windowsDecoder.decode();
  };

  return { decode, flush };
};

function stopChildProcess(child: AgentChildProcess) {
  try {
    if (child.stdin?.writable) {
      child.stdin.write("stop\n");
      child.stdin.end();
    }
  } catch {
    // Some commands close stdin early; in that case there is nothing else to send.
  }

  const killChild = (signal: NodeJS.Signals) => {
    if (!child.pid || child.killed) return;

    try {
      if (process.platform === "win32") {
        child.kill(signal);
        return;
      }

      process.kill(-child.pid, signal);
    } catch {
      try {
        child.kill(signal);
      } catch {
        // The process may already have exited between the signal checks.
      }
    }
  };

  const terminateTimer = setTimeout(() => killChild("SIGTERM"), 500);
  const killTimer = setTimeout(() => killChild("SIGKILL"), 2500);
  child.once("close", () => {
    clearTimeout(terminateTimer);
    clearTimeout(killTimer);
  });
}

function cancelAgentExecution(executionId: string) {
  const child = RUNNING_AGENT_PROCESSES.get(executionId);
  if (!child) return false;

  stopChildProcess(child);
  RUNNING_AGENT_PROCESSES.delete(executionId);
  return true;
}

export async function POST(request: Request) {
  let tempFilePathToCleanup: string | null = null;
  let messages = AGENT_EXECUTE_MESSAGES.zh;

  try {
    const body = (await request.json()) as ExecuteAgentRequest;
    const rawLocale = typeof body.locale === "string" ? body.locale : "zh";
    messages = AGENT_EXECUTE_MESSAGES[rawLocale] ?? AGENT_EXECUTE_MESSAGES.zh;
    const targetCwd = typeof body.cwd === "string" && body.cwd ? body.cwd : process.cwd();
    const rawAgentName = typeof body.agentName === "string" ? body.agentName : "";
    const executionId =
      typeof body.executionId === "string" && body.executionId.trim()
        ? body.executionId.trim()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const rawArgs = Array.isArray(body.args) ? body.args : [];
    const finalArgs = rawArgs.map((arg) =>
      String(arg).replaceAll(PROJECT_ROOT_PROMPT_TOKEN, targetCwd),
    );
    const { executable, prependArgs } = splitExecutable(rawAgentName);

    if (!executable) {
      return NextResponse.json(
        { success: false, error: messages.invalidAgentCommand },
        { status: 400 },
      );
    }

    const rawSpawnArgs = [...prependArgs, ...finalArgs];
    const {
      args: spawnArgs,
      stdinText,
      tempFilePath,
    } = resolveClaudePromptToStdin(executable, rawSpawnArgs, targetCwd);
    tempFilePathToCleanup = tempFilePath;
    const encoder = new TextEncoder();
    let childProcess: AgentChildProcess | null = null;

    const stream = new ReadableStream({
      start(controller) {
        let closed = false;

        const safeEnqueue = (data: string) => {
          if (closed) return;

          try {
            controller.enqueue(encoder.encode(data));
          } catch {
            closed = true;
          }
        };

        safeEnqueue(formatMessage(messages.systemStart, { executable }));

        const isWindows = process.platform === "win32";
        let useShell = isWindows;

        if (isWindows && !/[\\/]/.test(executable)) {
          useShell = true;
        }

        logAgentExecute("spawn", {
          args: spawnArgs,
          command: [executable, ...spawnArgs],
          cwd: targetCwd,
          executable,
          executionId,
          shell: useShell,
        });

        const child = spawn(executable, spawnArgs, {
          cwd: targetCwd,
          env: process.env,
          shell: useShell,
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        });
        childProcess = child;
        RUNNING_AGENT_PROCESSES.set(executionId, child);
        if (stdinText !== null && child.stdin) {
          child.stdin.end(stdinText);
        } else {
          child.stdin?.end();
        }
        const stdoutDecoder = createProcessOutputDecoder();
        const stderrDecoder = createProcessOutputDecoder();

        const cleanupRunningProcess = () => {
          if (RUNNING_AGENT_PROCESSES.get(executionId) === child) {
            RUNNING_AGENT_PROCESSES.delete(executionId);
          }
        };

        child.stdout.on("data", (data: Buffer) => {
          const chunk = stdoutDecoder.decode(data);
          logAgentExecute("stdout", { chunk, executionId });
          safeEnqueue(chunk);
        });

        child.stderr.on("data", (data: Buffer) => {
          const chunk = stderrDecoder.decode(data);
          logAgentExecute("stderr", { chunk, executionId });
          safeEnqueue(chunk);
        });

        child.on("close", (code) => {
          if (tempFilePathToCleanup && existsSync(tempFilePathToCleanup)) {
            try {
              unlinkSync(tempFilePathToCleanup);
              tempFilePathToCleanup = null;
            } catch {
              // Temporary Claude prompt cleanup is best-effort.
            }
          }

          if (closed) return;

          logAgentExecute("close", { code, executionId });

          const stdoutTail = stdoutDecoder.flush();
          if (stdoutTail) safeEnqueue(stdoutTail);
          const stderrTail = stderrDecoder.flush();
          if (stderrTail) safeEnqueue(stderrTail);

          if (code !== 0) {
            safeEnqueue(formatMessage(messages.processExitCode, { code: String(code) }));
          }

          cleanupRunningProcess();
          closed = true;
          controller.close();
        });

        child.on("error", (error) => {
          if (closed) return;

          logAgentExecute("error", { executionId, message: error.message });
          safeEnqueue(formatMessage(messages.errorMessage, { message: error.message }));
          cleanupRunningProcess();
          closed = true;
          controller.close();
        });

        request.signal.addEventListener("abort", () => {
          if (closed) return;

          closed = true;
          logAgentExecute("abort", { executionId });
          stopChildProcess(child);
          if (tempFilePathToCleanup && existsSync(tempFilePathToCleanup)) {
            try {
              unlinkSync(tempFilePathToCleanup);
              tempFilePathToCleanup = null;
            } catch {
              // Temporary Claude prompt cleanup is best-effort.
            }
          }
          cleanupRunningProcess();
          controller.close();
        });
      },
      cancel() {
        logAgentExecute("cancel", { executionId });
        if (childProcess) {
          stopChildProcess(childProcess);
          if (RUNNING_AGENT_PROCESSES.get(executionId) === childProcess) {
            RUNNING_AGENT_PROCESSES.delete(executionId);
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    if (tempFilePathToCleanup && existsSync(tempFilePathToCleanup)) {
      try {
        unlinkSync(tempFilePathToCleanup);
      } catch {
        // Temporary Claude prompt cleanup is best-effort.
      }
    }

    return NextResponse.json({ success: false, error: messages.internalServerError }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const requestLocale = request.headers.get("accept-language")?.split(",")[0]?.split("-")[0] ?? "zh";
  const messages = AGENT_EXECUTE_MESSAGES[requestLocale] ?? AGENT_EXECUTE_MESSAGES.zh;

  try {
    const { searchParams } = new URL(request.url);
    const executionId = searchParams.get("executionId")?.trim() ?? "";
    if (!executionId) {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    const stopped = cancelAgentExecution(executionId);
    logAgentExecute("delete", { executionId, stopped });
    return NextResponse.json({ success: true, stopped });
  } catch {
    return NextResponse.json({ success: false, error: messages.internalServerError }, { status: 500 });
  }
}
