// Backend-managed async task polling. Skills register the provider's poll spec
// after kicking off generation; this service drives the loop in-process so the
// agent can exit immediately. Persisted to projects/{projectId}/async-tasks.json
// so restarts don't strand in-flight tasks.
import "server-only";

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { v4 as createUuid } from "uuid";

import {
  PROJECTS_DIR,
  UUID_PATTERN,
  assertSafeProjectPath,
  getProjectDir,
  isRecord,
  readString,
  readStringArray,
} from "@/lib/services/project/shared";
import { storeGeneratedProjectImage } from "@/lib/services/project/image-service";
import { storeGeneratedProjectVideo } from "@/lib/services/project/video-service";

export type AsyncTaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "timed_out"
  | "cancelled";

export type AsyncTaskMediaType = "video" | "image";

export type AsyncTaskPollSpec = {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
};

export type AsyncTaskResponseSchema = {
  statusPath?: string;
  successValues?: string[];
  failureValues?: string[];
  urlPath: string;
  errorPath?: string;
};

export type AsyncTaskRecord = {
  id: string;
  projectId: string;
  mediaId: string;
  mediaType: AsyncTaskMediaType;
  name?: string;
  source?: string;
  cover?: string;
  duration?: string;
  category?: string;
  parentId?: string;
  storyboardId?: string;
  poll: AsyncTaskPollSpec;
  responseSchema: AsyncTaskResponseSchema;
  intervalMs: number;
  maxDurationMs: number;
  status: AsyncTaskStatus;
  resultUrl?: string;
  error?: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
};

export type AsyncTaskEvent = {
  taskId: string;
  projectId: string;
  mediaId: string;
  mediaType: AsyncTaskMediaType;
  status: AsyncTaskStatus;
  error?: string;
  resultUrl?: string;
  storyboardId?: string;
};

const TASKS_FILE_NAME = "async-tasks.json";
const MAX_ACTIVE_TASKS_PER_PROJECT = 50;
const DEFAULT_INTERVAL_MS = 10_000;
const MIN_INTERVAL_MS = 1_000;
const MAX_INTERVAL_MS = 60_000;
const DEFAULT_MAX_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MAX_MAX_DURATION_MS = 60 * 60 * 1000; // 1 hour upper bound
const TERMINAL_STATUSES: ReadonlySet<AsyncTaskStatus> = new Set([
  "succeeded",
  "failed",
  "timed_out",
  "cancelled",
]);
const FALLBACK_URL_PATHS = [
  "content.video_url",
  "content.url",
  "data.video_url",
  "data.url",
  "data.output_url",
  "data.outputs.0.url",
  "output.video_url",
  "output.url",
  "result.video_url",
  "result.url",
  "video.url",
  "url",
  "video_url",
] as const;
const URL_FIELD_NAMES = new Set([
  "video_url",
  "videoUrl",
  "resultUrl",
  "output_url",
  "url",
]);

const activeTimers = new Map<string, NodeJS.Timeout>();
const projectFileLocks = new Map<string, Promise<void>>();
const projectSubscribers = new Map<
  string,
  Set<(event: AsyncTaskEvent) => void>
>();
let recoveryStarted = false;
let recoveryDone: Promise<void> | null = null;

function getTasksFilePath(projectId: string) {
  const file = path.resolve(getProjectDir(projectId), TASKS_FILE_NAME);
  assertSafeProjectPath(file);
  return file;
}

function isTerminal(status: AsyncTaskStatus) {
  return TERMINAL_STATUSES.has(status);
}

function clampInterval(value: unknown) {
  const num =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : DEFAULT_INTERVAL_MS;
  return Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, Math.floor(num)));
}

function clampMaxDuration(value: unknown) {
  const num =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : DEFAULT_MAX_DURATION_MS;
  return Math.max(
    MIN_INTERVAL_MS,
    Math.min(MAX_MAX_DURATION_MS, Math.floor(num)),
  );
}

function readResponseSchema(value: unknown): AsyncTaskResponseSchema | null {
  if (!isRecord(value)) return null;
  const urlPath = readString(value.urlPath);
  if (!urlPath) return null;
  return {
    statusPath: readString(value.statusPath) || undefined,
    successValues: readStringArray(value.successValues),
    failureValues: readStringArray(value.failureValues),
    urlPath,
    errorPath: readString(value.errorPath) || undefined,
  };
}

function readPollSpec(value: unknown): AsyncTaskPollSpec | null {
  if (!isRecord(value)) return null;
  const url = readString(value.url);
  const rawMethod = readString(value.method).toUpperCase();
  const method: "GET" | "POST" = rawMethod === "POST" ? "POST" : "GET";
  if (!url) return null;

  const headers: Record<string, string> = {};
  if (isRecord(value.headers)) {
    for (const [headerName, headerValue] of Object.entries(value.headers)) {
      if (typeof headerName === "string" && typeof headerValue === "string") {
        headers[headerName] = headerValue;
      }
    }
  }

  return {
    url,
    method,
    headers,
    body: readString(value.body) || undefined,
  };
}

function readMediaType(value: unknown): AsyncTaskMediaType | null {
  const text = readString(value);
  if (text === "video" || text === "image") return text;
  return null;
}

function readStatus(value: unknown): AsyncTaskStatus {
  const text = readString(value);
  if (
    text === "queued" ||
    text === "running" ||
    text === "succeeded" ||
    text === "failed" ||
    text === "timed_out" ||
    text === "cancelled"
  ) {
    return text;
  }
  return "queued";
}

function readTaskRecord(
  value: unknown,
  projectId: string,
): AsyncTaskRecord | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const mediaId = readString(value.mediaId);
  const mediaType = readMediaType(value.mediaType);
  const poll = readPollSpec(value.poll);
  const responseSchema = readResponseSchema(value.responseSchema);
  if (!id || !mediaId || !mediaType || !poll || !responseSchema) return null;

  return {
    id,
    projectId,
    mediaId,
    mediaType,
    name: readString(value.name) || undefined,
    source: readString(value.source) || undefined,
    cover: readString(value.cover) || undefined,
    duration: readString(value.duration) || undefined,
    category: readString(value.category) || undefined,
    parentId: readString(value.parentId) || undefined,
    storyboardId: readString(value.storyboardId) || undefined,
    poll,
    responseSchema,
    intervalMs: clampInterval(value.intervalMs),
    maxDurationMs: clampMaxDuration(value.maxDurationMs),
    status: readStatus(value.status),
    resultUrl: readString(value.resultUrl) || undefined,
    error: readString(value.error) || undefined,
    attempts:
      typeof value.attempts === "number" && Number.isFinite(value.attempts)
        ? Math.max(0, Math.floor(value.attempts))
        : 0,
    createdAt: readString(value.createdAt) || new Date().toISOString(),
    updatedAt: readString(value.updatedAt) || new Date().toISOString(),
    startedAt: readString(value.startedAt) || undefined,
    finishedAt: readString(value.finishedAt) || undefined,
  };
}

async function withProjectLock<T>(
  projectId: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = projectFileLocks.get(projectId) ?? Promise.resolve();
  let releaseFn: () => void = () => undefined;
  const next = new Promise<void>((resolve) => {
    releaseFn = resolve;
  });
  projectFileLocks.set(
    projectId,
    previous.then(() => next),
  );

  try {
    await previous;
    return await work();
  } finally {
    releaseFn();
  }
}

async function readProjectTasks(projectId: string): Promise<AsyncTaskRecord[]> {
  const filePath = getTasksFilePath(projectId);
  try {
    const content = await readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => readTaskRecord(entry, projectId))
      .filter((task): task is AsyncTaskRecord => Boolean(task));
  } catch {
    return [];
  }
}

async function writeProjectTasks(projectId: string, tasks: AsyncTaskRecord[]) {
  const projectDir = getProjectDir(projectId);
  await mkdir(projectDir, { recursive: true });
  const filePath = getTasksFilePath(projectId);
  await writeFile(filePath, JSON.stringify(tasks, null, 2), "utf8");
}

async function persistTask(
  task: AsyncTaskRecord,
  mode: "upsert" | "delete" = "upsert",
) {
  await withProjectLock(task.projectId, async () => {
    const tasks = await readProjectTasks(task.projectId);
    const filtered = tasks.filter((existing) => existing.id !== task.id);
    if (mode === "upsert") filtered.push(task);
    await writeProjectTasks(task.projectId, filtered);
  });
}

function readJsonByPath(value: unknown, dotPath: string): unknown {
  if (!dotPath) return undefined;
  const segments = dotPath.split(".").filter(Boolean);
  let cursor: unknown = value;
  for (const segment of segments) {
    if (cursor === null || cursor === undefined) return undefined;
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      cursor = cursor[index];
      continue;
    }
    if (typeof cursor === "object") {
      cursor = (cursor as Record<string, unknown>)[segment];
      continue;
    }
    return undefined;
  }
  return cursor;
}

function isLikelyRemoteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function findUrlByKnownKeys(value: unknown, depth = 0): string {
  if (depth > 8) return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUrlByKnownKeys(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (!isRecord(value)) return "";

  for (const [key, entry] of Object.entries(value)) {
    if (
      typeof entry === "string" &&
      URL_FIELD_NAMES.has(key) &&
      isLikelyRemoteUrl(entry)
    ) {
      return entry;
    }
  }

  for (const entry of Object.values(value)) {
    const found = findUrlByKnownKeys(entry, depth + 1);
    if (found) return found;
  }

  return "";
}

function extractResultUrl(payload: unknown, schema: AsyncTaskResponseSchema) {
  const schemaUrl = readString(readJsonByPath(payload, schema.urlPath));
  if (isLikelyRemoteUrl(schemaUrl)) return schemaUrl;

  for (const pathName of FALLBACK_URL_PATHS) {
    const value = readString(readJsonByPath(payload, pathName));
    if (isLikelyRemoteUrl(value)) return value;
  }

  return findUrlByKnownKeys(payload);
}

function decideOutcome(
  payload: unknown,
  schema: AsyncTaskResponseSchema,
): "success" | "failure" | "pending" {
  const urlValue = extractResultUrl(payload, schema);
  if (urlValue) return "success";

  if (schema.statusPath) {
    const statusRaw = readJsonByPath(payload, schema.statusPath);
    const status = typeof statusRaw === "string" ? statusRaw.toLowerCase() : "";
    if (status) {
      const successSet = new Set(
        (
          schema.successValues ?? ["succeeded", "success", "completed", "done"]
        ).map((value) => value.toLowerCase()),
      );
      const failureSet = new Set(
        (
          schema.failureValues ?? [
            "failed",
            "error",
            "cancelled",
            "canceled",
            "timeout",
          ]
        ).map((value) => value.toLowerCase()),
      );
      if (successSet.has(status)) return "success";
      if (failureSet.has(status)) return "failure";
    }
  }

  return "pending";
}

function extractProviderError(
  payload: unknown,
  schema: AsyncTaskResponseSchema,
) {
  if (schema.errorPath) {
    const value = readJsonByPath(payload, schema.errorPath);
    if (typeof value === "string" && value) return value;
    if (isRecord(value) && typeof value.message === "string")
      return value.message;
  }
  if (isRecord(payload) && typeof payload.error === "string")
    return payload.error;
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return "PROVIDER_FAILURE";
}

async function callProviderPoll(task: AsyncTaskRecord) {
  const init: RequestInit = {
    method: task.poll.method,
    headers: task.poll.headers,
  };
  if (task.poll.method === "POST" && task.poll.body) {
    init.body = task.poll.body;
  }

  const response = await fetch(task.poll.url, init);
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  return { ok: response.ok, status: response.status, payload, raw: text };
}

async function persistGeneratedMedia(task: AsyncTaskRecord, resultUrl: string) {
  if (task.mediaType === "video") {
    return storeGeneratedProjectVideo({
      cover: task.cover,
      duration: task.duration,
      name: task.name,
      projectId: task.projectId,
      resultUrl,
      source: task.source,
      storyboardId: task.storyboardId,
      videoId: task.mediaId,
    });
  }

  return storeGeneratedProjectImage({
    category: task.category,
    imageId: task.mediaId,
    name: task.name,
    parentId: task.parentId,
    projectId: task.projectId,
    resultUrl,
    source: task.source,
  });
}

function clearTimer(taskId: string) {
  const timer = activeTimers.get(taskId);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(taskId);
  }
}

function hasActiveTimer(taskId: string) {
  return activeTimers.has(taskId);
}

function scheduleNextPoll(task: AsyncTaskRecord, delayMs: number) {
  clearTimer(task.id);
  const timer = setTimeout(() => {
    void runOnePollCycle(task.id, task.projectId);
  }, delayMs);
  activeTimers.set(task.id, timer);
}

async function runOnePollCycle(taskId: string, projectId: string) {
  const tasks = await readProjectTasks(projectId);
  const task = tasks.find((entry) => entry.id === taskId);
  if (!task || isTerminal(task.status)) {
    clearTimer(taskId);
    return;
  }

  const startedAt = task.startedAt ?? task.createdAt;
  const elapsedMs = Date.now() - new Date(startedAt).getTime();
  if (elapsedMs > task.maxDurationMs) {
    logTask("timeout", task, { elapsedMs });
    await finalizeTask(task, {
      status: "timed_out",
      error: "POLL_TIMEOUT",
    });
    return;
  }

  let outcome: "success" | "failure" | "pending" = "pending";
  let resultUrl: string | undefined;
  let providerError: string | undefined;
  let httpStatus = 0;

  try {
    const response = await callProviderPoll(task);
    httpStatus = response.status;
    task.attempts += 1;
    task.updatedAt = new Date().toISOString();

    if (!response.ok) {
      // 4xx/5xx: keep polling on transient (5xx, 408, 429); fail on hard 4xx.
      const transient =
        response.status >= 500 ||
        response.status === 408 ||
        response.status === 425 ||
        response.status === 429;
      if (!transient) {
        outcome = "failure";
        providerError = `HTTP_${response.status}: ${
          extractProviderError(response.payload, task.responseSchema) ||
          response.raw.slice(0, 200)
        }`;
      }
    } else {
      outcome = decideOutcome(response.payload, task.responseSchema);
      if (outcome === "success") {
        resultUrl = extractResultUrl(response.payload, task.responseSchema);
        if (!resultUrl) {
          outcome = "failure";
          providerError = "RESULT_URL_NOT_FOUND";
        }
      } else if (outcome === "failure") {
        providerError = extractProviderError(
          response.payload,
          task.responseSchema,
        );
      }
    }

    await persistTask({ ...task, status: "running" });
    logTask("poll", task, { httpStatus, outcome, elapsedMs });
  } catch (err) {
    // Network failure: stay pending and retry next cycle.
    task.attempts += 1;
    task.updatedAt = new Date().toISOString();
    task.error = err instanceof Error ? err.message : "POLL_NETWORK_ERROR";
    await persistTask({ ...task, status: "running" });
    logTask("poll-error", task, { error: task.error, elapsedMs });
    scheduleNextPoll(task, task.intervalMs);
    return;
  }

  if (outcome === "success" && resultUrl) {
    const stored = await persistGeneratedMedia(task, resultUrl);
    if (stored.success) {
      await finalizeTask(task, { status: "succeeded", resultUrl });
    } else {
      await finalizeTask(task, {
        status: "failed",
        error: stored.error || "STORE_GENERATED_FAILED",
        resultUrl,
      });
    }
    return;
  }

  if (outcome === "failure") {
    await finalizeTask(task, {
      status: "failed",
      error: providerError ?? "PROVIDER_FAILURE",
    });
    return;
  }

  scheduleNextPoll(task, task.intervalMs);
}

async function ensureProjectTasksContinue(projectId: string) {
  const tasks = await readProjectTasks(projectId);
  for (const task of tasks) {
    if (isTerminal(task.status) || hasActiveTimer(task.id)) continue;
    scheduleNextPoll(task, 0);
  }
}

async function finalizeTask(
  task: AsyncTaskRecord,
  result: { status: AsyncTaskStatus; error?: string; resultUrl?: string },
) {
  clearTimer(task.id);
  const finished: AsyncTaskRecord = {
    ...task,
    status: result.status,
    error: result.error,
    resultUrl: result.resultUrl ?? task.resultUrl,
    finishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await persistTask(finished);
  logTask("finalize", finished, {
    error: result.error,
    resultUrl: result.resultUrl,
  });
  emitTaskEvent(finished);
}

async function startTaskPolling(task: AsyncTaskRecord) {
  if (isTerminal(task.status)) return;
  const startedAt = task.startedAt ?? new Date().toISOString();
  const next: AsyncTaskRecord = {
    ...task,
    status: "running",
    startedAt,
    updatedAt: new Date().toISOString(),
  };
  await persistTask(next);
  logTask("start", next, {
    intervalMs: next.intervalMs,
    maxDurationMs: next.maxDurationMs,
  });
  // Run the first poll in the current request. A zero-delay timer can be lost
  // when a route handler finishes before the event loop turns, leaving the task
  // registered but never polled.
  await runOnePollCycle(next.id, next.projectId);
}

function logTask(
  event: string,
  task: AsyncTaskRecord,
  extra?: Record<string, unknown>,
) {
  process.stdout.write(
    `[async-task:${event}] ${JSON.stringify({
      id: task.id,
      mediaId: task.mediaId,
      mediaType: task.mediaType,
      status: task.status,
      attempts: task.attempts,
      ...extra,
    })}\n`,
  );
}

function emitTaskEvent(task: AsyncTaskRecord) {
  const subscribers = projectSubscribers.get(task.projectId);
  if (!subscribers || subscribers.size === 0) return;

  const event: AsyncTaskEvent = {
    taskId: task.id,
    projectId: task.projectId,
    mediaId: task.mediaId,
    mediaType: task.mediaType,
    status: task.status,
    error: task.error,
    resultUrl: task.resultUrl,
    storyboardId: task.storyboardId,
  };

  subscribers.forEach((subscriber) => {
    try {
      subscriber(event);
    } catch {
      // One broken stream must not block other browser clients.
    }
  });
}

export function subscribeAsyncTaskEvents(
  projectId: string,
  subscriber: (event: AsyncTaskEvent) => void,
) {
  const subscribers =
    projectSubscribers.get(projectId) ??
    new Set<(event: AsyncTaskEvent) => void>();
  subscribers.add(subscriber);
  projectSubscribers.set(projectId, subscribers);

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) projectSubscribers.delete(projectId);
  };
}

async function recoverPendingTasksOnce() {
  if (recoveryStarted) {
    if (recoveryDone) await recoveryDone;
    return;
  }
  recoveryStarted = true;
  recoveryDone = (async () => {
    let entries: string[] = [];
    try {
      entries = await readdir(PROJECTS_DIR);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!UUID_PATTERN.test(entry)) continue;
      const tasks = await readProjectTasks(entry).catch(
        (): AsyncTaskRecord[] => [],
      );
      for (const task of tasks) {
        if (isTerminal(task.status)) continue;
        // Re-check timeout window before resuming.
        const startedAt = task.startedAt ?? task.createdAt;
        const elapsedMs = Date.now() - new Date(startedAt).getTime();
        if (elapsedMs > task.maxDurationMs) {
          await finalizeTask(task, {
            status: "timed_out",
            error: "POLL_TIMEOUT_RESUME",
          });
          continue;
        }
        scheduleNextPoll(task, 0);
      }
    }
  })();
  await recoveryDone;
}

export async function ensureAsyncTaskRecovery() {
  await recoverPendingTasksOnce();
}

export async function createAsyncTask(input: {
  projectId: string;
  mediaId: string;
  mediaType: AsyncTaskMediaType;
  name?: string;
  source?: string;
  cover?: string;
    duration?: string;
    category?: string;
    parentId?: string;
    storyboardId?: string;
    poll: AsyncTaskPollSpec;
  responseSchema: AsyncTaskResponseSchema;
  intervalMs?: number;
  maxDurationMs?: number;
}): Promise<
  { success: true; task: AsyncTaskRecord } | { success: false; error: string }
> {
  try {
    await recoverPendingTasksOnce();

    const tasks = await readProjectTasks(input.projectId);
    const activeCount = tasks.filter((task) => !isTerminal(task.status)).length;
    if (activeCount >= MAX_ACTIVE_TASKS_PER_PROJECT) {
      return { success: false, error: "TOO_MANY_ACTIVE_TASKS" };
    }

    // Cancel any existing in-flight task targeting the same media id so the latest
    // generation supersedes a stale one (typical "regenerate" flow).
    for (const existing of tasks) {
      if (existing.mediaId === input.mediaId && !isTerminal(existing.status)) {
        await finalizeTask(existing, {
          status: "cancelled",
          error: "SUPERSEDED",
        });
      }
    }

    const now = new Date().toISOString();
    const task: AsyncTaskRecord = {
      id: createUuid(),
      projectId: input.projectId,
      mediaId: input.mediaId,
      mediaType: input.mediaType,
      name: input.name,
      source: input.source,
      cover: input.cover,
      duration: input.duration,
      category: input.category,
      parentId: input.parentId,
      storyboardId: input.storyboardId,
      poll: input.poll,
      responseSchema: input.responseSchema,
      intervalMs: clampInterval(input.intervalMs),
      maxDurationMs: clampMaxDuration(input.maxDurationMs),
      status: "queued",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };

    await persistTask(task);
    logTask("register", task, {
      pollUrl: task.poll.url,
      pollMethod: task.poll.method,
      urlPath: task.responseSchema.urlPath,
    });
    await startTaskPolling(task);
    const refreshed = await readProjectTasks(input.projectId);
    return {
      success: true,
      task: refreshed.find((entry) => entry.id === task.id) ?? task,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "UNKNOWN_ERROR",
    };
  }
}

export async function getAsyncTask(input: {
  projectId: string;
  taskId: string;
}): Promise<
  { success: true; task: AsyncTaskRecord } | { success: false; error: string }
> {
  try {
    await recoverPendingTasksOnce();
    await ensureProjectTasksContinue(input.projectId);
    const tasks = await readProjectTasks(input.projectId);
    const task = tasks.find((entry) => entry.id === input.taskId);
    if (!task) return { success: false, error: "TASK_NOT_FOUND" };
    return { success: true, task };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "UNKNOWN_ERROR",
    };
  }
}

export async function listAsyncTasks(input: {
  projectId: string;
  mediaId?: string;
}): Promise<
  | { success: true; tasks: AsyncTaskRecord[] }
  | { success: false; error: string }
> {
  try {
    await recoverPendingTasksOnce();
    await ensureProjectTasksContinue(input.projectId);
    const tasks = await readProjectTasks(input.projectId);
    const filtered = input.mediaId
      ? tasks.filter((task) => task.mediaId === input.mediaId)
      : tasks;
    return { success: true, tasks: filtered };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "UNKNOWN_ERROR",
    };
  }
}

export async function cancelAsyncTask(input: {
  projectId: string;
  taskId: string;
}): Promise<
  { success: true; task: AsyncTaskRecord } | { success: false; error: string }
> {
  try {
    await recoverPendingTasksOnce();
    const tasks = await readProjectTasks(input.projectId);
    const task = tasks.find((entry) => entry.id === input.taskId);
    if (!task) return { success: false, error: "TASK_NOT_FOUND" };
    if (isTerminal(task.status)) return { success: true, task };
    await finalizeTask(task, { status: "cancelled", error: "USER_CANCELLED" });
    const refreshed = await readProjectTasks(input.projectId);
    const updated = refreshed.find((entry) => entry.id === input.taskId);
    return { success: true, task: updated ?? task };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "UNKNOWN_ERROR",
    };
  }
}
