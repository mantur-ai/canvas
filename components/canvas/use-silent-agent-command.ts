"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { v4 as createUuid } from "uuid";
import type { ChatWindowSubmitPayload } from "@/components/canvas/chat-window";
import { resolveGlobalAgentCommand } from "@/components/layout/global-chat-drawer/resolve-agent-command";
import type { AgentRecord } from "@/lib/agent-schema";
import {
  PROJECT_ROOT_PROMPT_TOKEN,
  type ChatFeatureSkill,
} from "@/lib/chat-prompts";
import { fetchAgentsCached, fetchConfigCached } from "@/lib/client-data-cache";
import {
  DEFAULT_WORKFLOW_SKILLS,
  type AppConfig,
  type WorkflowSkillRoute,
} from "@/lib/config-schema";
import {
  createProjectSkillContext,
  deleteProjectSkillContext,
  fetchProjectImages,
  fetchProjectVideos,
  normalizeProjectStoryboardAssets,
} from "@/lib/project-api";
import { useAgentStore } from "@/store/use-agent-store";
import { useCanvasStore } from "@/store/use-canvas-store";
import {
  useLayoutStore,
  type SidebarLoadingKey,
} from "@/store/use-layout-store";

type SilentAgentContext = {
  mediaId?: string;
  mediaName?: string;
  mediaType?: string;
  scope: "asset-grid" | "canvas-grid" | "storyboard-list";
  featureSkill: ChatFeatureSkill;
};

type RunningCommand = {
  abortController: AbortController;
  contextDir?: string;
  executionId: string;
  mediaId?: string;
  projectId: string;
};

type AsyncTaskEventPayload = {
  mediaId?: string;
  mediaType?: "image" | "video";
  status?: string;
};

type AsyncTaskEventSubscription = {
  closeTimer: ReturnType<typeof setTimeout> | null;
  refCount: number;
  source: EventSource;
};

const asyncTaskEventSubscriptions = new Map<
  string,
  AsyncTaskEventSubscription
>();
const ASYNC_TASK_EVENT_CLOSE_DELAY_MS = 500;

async function handleAsyncTaskEvent(
  projectId: string,
  payload: AsyncTaskEventPayload,
) {
  if (!payload.mediaId || !payload.mediaType) return;

  const { setCommandStatus, updateImageAsset, updateVideoAsset } =
    useCanvasStore.getState();

  if (payload.status !== "succeeded") {
    setCommandStatus(payload.mediaId, "error");
    return;
  }

  if (payload.mediaType === "video") {
    const videos = await fetchProjectVideos(projectId).catch(() => []);
    const video = videos.find((item) => item.id === payload.mediaId);
    if (video) updateVideoAsset(video);
    setCommandStatus(payload.mediaId, video?.url.trim() ? "success" : "error");
    return;
  }

  const images = await fetchProjectImages(projectId).catch(() => []);
  const image = images.find((item) => item.id === payload.mediaId);
  if (image) updateImageAsset(image);
  setCommandStatus(payload.mediaId, image?.url.trim() ? "success" : "error");
}

function retainAsyncTaskEventSource(projectId: string) {
  const existing = asyncTaskEventSubscriptions.get(projectId);
  if (existing) {
    if (existing.closeTimer) {
      clearTimeout(existing.closeTimer);
      existing.closeTimer = null;
    }
    existing.refCount += 1;
    return () => releaseAsyncTaskEventSource(projectId);
  }

  const source = new EventSource(
    `/api/projects/${encodeURIComponent(projectId)}/async-tasks/events`,
  );
  const handleMessage = (event: Event) => {
    void (async () => {
      const messageEvent = event as MessageEvent<string>;
      let payload: AsyncTaskEventPayload;
      try {
        payload = JSON.parse(messageEvent.data) as AsyncTaskEventPayload;
      } catch {
        return;
      }

      await handleAsyncTaskEvent(projectId, payload);
    })();
  };

  source.addEventListener("async-task", handleMessage);
  asyncTaskEventSubscriptions.set(projectId, {
    closeTimer: null,
    refCount: 1,
    source,
  });

  return () => releaseAsyncTaskEventSource(projectId);
}

function releaseAsyncTaskEventSource(projectId: string) {
  const subscription = asyncTaskEventSubscriptions.get(projectId);
  if (!subscription) return;

  subscription.refCount -= 1;
  if (subscription.refCount > 0 || subscription.closeTimer) return;

  subscription.closeTimer = setTimeout(() => {
    const latest = asyncTaskEventSubscriptions.get(projectId);
    if (!latest || latest.refCount > 0) return;
    latest.source.close();
    asyncTaskEventSubscriptions.delete(projectId);
  }, ASYNC_TASK_EVENT_CLOSE_DELAY_MS);
}

function formatAttachmentContext(
  projectId: string,
  payload: ChatWindowSubmitPayload,
) {
  return payload.attachments
    .map((attachment, index) => {
      const filePath =
        "fileName" in attachment
          ? `projects/${projectId}/temp/${attachment.fileName}`
          : attachment.url;

      return `${index + 1}. ${attachment.label} (${attachment.name}): ${filePath}`;
    })
    .join("\n");
}

// Generation features always need a skill-context so the skill has a context.json
// to read for `publicUrl` and reference metadata, even when the user didn't type
// any @-mentions or attach files explicitly.
const FEATURE_SKILLS_REQUIRING_CONTEXT: ReadonlySet<ChatFeatureSkill> = new Set(
  [
    "asset-generate",
    "asset-panel-generate",
    "storyboard-image-generate",
    "video-generate",
  ],
);
const buildSkillContextCleanupInstruction = (contextDir: string) =>
  `Before your final response, run \`rm -rf -- "${contextDir}"\` and delete only this exact temporary context directory. Do not delete the parent skill-context directory or any sibling context directories.`;

function needsSkillContext(
  payload: ChatWindowSubmitPayload,
  featureSkill: ChatFeatureSkill,
) {
  if (FEATURE_SKILLS_REQUIRING_CONTEXT.has(featureSkill)) return true;
  return payload.attachments.length > 0 || /@\{[^}]+}/.test(payload.text);
}

function getExecutionKey(context: SilentAgentContext) {
  return context.mediaId ?? `${context.scope}:${context.featureSkill}`;
}

function getWorkflowSkillRoute(
  featureSkill: ChatFeatureSkill,
  workflowSkills: AppConfig["workflowSkills"],
): WorkflowSkillRoute | null {
  if (featureSkill === "general-chat") return null;
  return workflowSkills[featureSkill] ?? DEFAULT_WORKFLOW_SKILLS[featureSkill];
}

function formatDirectSkillContext(route: WorkflowSkillRoute | null) {
  if (!route) return "";

  return [
    `[Direct Skill]`,
    `Skill file: ${PROJECT_ROOT_PROMPT_TOKEN}/skills/${route.primarySkill}/SKILL.md`,
    "Open and follow the primary skill file directly.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildInlineGridCommand(params: {
  context: SilentAgentContext;
  locale: string;
  payload: ChatWindowSubmitPayload;
  projectId: string;
  recipePack: string;
  skillRoute: WorkflowSkillRoute | null;
  skillContext?: {
    contextDir: string;
    manifestPath: string;
  };
}) {
  const attachmentContext = formatAttachmentContext(
    params.projectId,
    params.payload,
  );
  const videoOptions = params.payload.videoOptions
    ? Object.entries(params.payload.videoOptions)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n")
    : "";

  return [
    formatDirectSkillContext(params.skillRoute),
    `[Project]`,
    `ID: ${params.projectId}`,
    `[Page Language]\n${params.locale}`,
    `[Target]`,
    params.context.mediaId ? `Media ID: ${params.context.mediaId}` : "",
    params.context.mediaName ? `Media Name: ${params.context.mediaName}` : "",
    params.context.mediaType ? `Media Type: ${params.context.mediaType}` : "",
    videoOptions ? `[Video Options]\n${videoOptions}` : "",
    params.recipePack ? `[Project Recipe Pack]\n${params.recipePack}` : "",
    attachmentContext ? `[Attached Files]\n${attachmentContext}` : "",
    params.skillContext
      ? `[Skill Temporary Context]\nDirectory: ${params.skillContext.contextDir}\nManifest: ${params.skillContext.manifestPath}\nRead the manifest's files and references for @-mentioned assets, reference images, and temporary images. Each send gets a unique directory; do not read other temp context directories.\n${buildSkillContextCleanupInstruction(params.skillContext.contextDir)}`
      : "",
    `[Command]\n${params.payload.text}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function getSidebarLoadingKey(context: SilentAgentContext): SidebarLoadingKey {
  if (context.scope === "asset-grid") return "assets";
  return "episodes";
}

function shouldVerifyStoredTargetMedia(context: SilentAgentContext) {
  return (
    context.featureSkill === "asset-generate" ||
    context.featureSkill === "asset-panel-generate" ||
    context.featureSkill === "storyboard-image-generate" ||
    context.featureSkill === "video-generate"
  );
}

function logAgentStreamSend(params: {
  argCount: number;
  context: SilentAgentContext;
  executable: string;
  isFirstContextMessage: boolean;
  projectId: string;
}) {
  console.log("[agent-stream:send]", {
    argCount: params.argCount,
    context: params.context,
    executable: params.executable,
    isFirstContextMessage: params.isFirstContextMessage,
    projectId: params.projectId,
  });
}

function logAgentStreamReceive(featureSkill: ChatFeatureSkill) {
  console.log("[agent-stream:receive]", {
    featureSkill,
  });
}

async function hasStoredTargetMedia(
  projectId: string,
  context: SilentAgentContext,
) {
  if (!context.mediaId) return false;

  try {
    if (
      context.mediaType === "video" ||
      context.featureSkill === "video-generate"
    ) {
      const videos = await fetchProjectVideos(projectId);
      return videos.some(
        (video) => video.id === context.mediaId && video.url.trim().length > 0,
      );
    }

    const images = await fetchProjectImages(projectId);
    return images.some(
      (image) => image.id === context.mediaId && image.url.trim().length > 0,
    );
  } catch {
    return false;
  }
}

export function useSilentAgentCommand() {
  const locale = useLocale();
  const currentProject = useCanvasStore((state) => state.currentProject);
  const clearCommandStatus = useCanvasStore(
    (state) => state.clearCommandStatus,
  );
  const setCommandStatus = useCanvasStore((state) => state.setCommandStatus);
  const finishSidebarLoading = useLayoutStore(
    (state) => state.finishSidebarLoading,
  );
  const startSidebarLoading = useLayoutStore(
    (state) => state.startSidebarLoading,
  );
  const selectedAgentId = useAgentStore((state) => state.selectedAgentId);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [workflowSkills, setWorkflowSkills] = useState<
    AppConfig["workflowSkills"]
  >(DEFAULT_WORKFLOW_SKILLS);
  const [runningCount, setRunningCount] = useState(0);
  const runningCommandsRef = useRef<Map<string, RunningCommand>>(new Map());
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId),
    [agents, selectedAgentId],
  );

  useEffect(() => {
    let active = true;

    async function loadAgents() {
      try {
        const payload = await fetchAgentsCached();
        if (active) setAgents(payload);
      } catch {
        // Inline grid chat silently waits until agents are available.
      }
    }

    void loadAgents();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!currentProject) return undefined;

    return retainAsyncTaskEventSource(currentProject.id);
  }, [currentProject?.id]);

  useEffect(() => {
    let active = true;

    async function loadConfig() {
      try {
        const payload = await fetchConfigCached();
        if (active && payload) setWorkflowSkills(payload.workflowSkills);
      } catch {
        // Inline commands can still route through the built-in skill mapping.
      }
    }

    void loadConfig();

    return () => {
      active = false;
    };
  }, []);

  const execute = useCallback(
    async (payload: ChatWindowSubmitPayload, context: SilentAgentContext) => {
      if (!selectedAgent || !currentProject) return;

      const executionKey = getExecutionKey(context);
      if (runningCommandsRef.current.has(executionKey)) return;

      const skillContext = needsSkillContext(payload, context.featureSkill)
        ? await createProjectSkillContext(currentProject.id, {
            attachments: payload.attachments,
            text: payload.text,
          }).catch(() => null)
        : null;
      const commandText = buildInlineGridCommand({
        context,
        locale,
        payload,
        projectId: currentProject.id,
        recipePack: currentProject.description.trim(),
        skillRoute: getWorkflowSkillRoute(context.featureSkill, workflowSkills),
        skillContext: skillContext
          ? {
              contextDir: skillContext.contextDir,
              manifestPath: skillContext.manifestPath,
            }
          : undefined,
      });
      // Non-global chats must run as fresh commands so they never inherit the global chat session.
      const resolvedCommand = resolveGlobalAgentCommand(
        selectedAgent,
        commandText,
        {
          ephemeral: true,
          isFirstMessage: true,
        },
      );

      logAgentStreamSend({
        argCount: resolvedCommand.args.length,
        context,
        executable: resolvedCommand.executable,
        isFirstContextMessage: true,
        projectId: currentProject.id,
      });
      const sidebarLoadingKey = getSidebarLoadingKey(context);
      const abortController = new AbortController();
      const executionId = createUuid();
      runningCommandsRef.current.set(executionKey, {
        abortController,
        contextDir: skillContext?.contextDir,
        executionId,
        mediaId: context.mediaId,
        projectId: currentProject.id,
      });
      setRunningCount(runningCommandsRef.current.size);
      startSidebarLoading(sidebarLoadingKey);

      try {
        if (context.mediaId) {
          setCommandStatus(context.mediaId, "loading");
        }

        const response = await fetch("/api/agents/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentName: resolvedCommand.executable,
            args: resolvedCommand.args,
            cwd: "",
            executionId,
            locale,
          }),
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          if (context.mediaId) {
            const stored = await hasStoredTargetMedia(
              currentProject.id,
              context,
            );
            setCommandStatus(context.mediaId, stored ? "success" : "error");
          }
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            if (chunk) {
              logAgentStreamReceive(context.featureSkill);
            }
          }

          const tailChunk = decoder.decode();
          if (tailChunk) {
            logAgentStreamReceive(context.featureSkill);
          }
        } finally {
          reader.releaseLock();
        }

        if (abortController.signal.aborted) {
          if (context.mediaId) {
            clearCommandStatus(context.mediaId);
          }
          return;
        }

        if (context.featureSkill === "storyboard-parse" && context.mediaId) {
          await normalizeProjectStoryboardAssets(
            currentProject.id,
            context.mediaId,
          );
        }

        if (context.mediaId) {
          if (shouldVerifyStoredTargetMedia(context)) {
            const stored = await hasStoredTargetMedia(
              currentProject.id,
              context,
            );
            if (context.featureSkill === "video-generate" && !stored) return;
            setCommandStatus(context.mediaId, stored ? "success" : "error");
          } else {
            setCommandStatus(context.mediaId, "success");
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          if (context.mediaId) {
            clearCommandStatus(context.mediaId);
          }
          return;
        }

        if (context.mediaId) {
          const stored = await hasStoredTargetMedia(currentProject.id, context);
          setCommandStatus(context.mediaId, stored ? "success" : "error");
        }
        // Inline grid chat intentionally does not render execution output.
      } finally {
        if (skillContext) {
          await deleteProjectSkillContext(
            currentProject.id,
            skillContext.contextDir,
          ).catch(() => {
            // Skill context cleanup is best-effort after the agent process exits.
          });
        }
        const runningCommand = runningCommandsRef.current.get(executionKey);
        if (runningCommand?.executionId === executionId) {
          runningCommandsRef.current.delete(executionKey);
          setRunningCount(runningCommandsRef.current.size);
        }
        finishSidebarLoading(sidebarLoadingKey);
      }
    },
    [
      currentProject,
      clearCommandStatus,
      finishSidebarLoading,
      locale,
      selectedAgent,
      setCommandStatus,
      startSidebarLoading,
      workflowSkills,
    ],
  );

  const stop = useCallback(
    (mediaId?: string) => {
      const runningEntries = [...runningCommandsRef.current.entries()].filter(
        ([, command]) => (mediaId ? command.mediaId === mediaId : true),
      );

      runningEntries.forEach(([executionKey, command]) => {
        void fetch(
          `/api/agents/execute?executionId=${encodeURIComponent(command.executionId)}`,
          {
            method: "DELETE",
          },
        ).catch(() => {
          // The local abort below still clears inline UI state if explicit cancel fails.
        });

        command.abortController.abort();
        if (command.contextDir) {
          void deleteProjectSkillContext(
            command.projectId,
            command.contextDir,
          ).catch(() => {
            // The running command may also clean up in its finally block.
          });
        }

        if (command.mediaId) {
          clearCommandStatus(command.mediaId);
        }
        runningCommandsRef.current.delete(executionKey);
      });

      setRunningCount(runningCommandsRef.current.size);
    },
    [clearCommandStatus],
  );

  useEffect(() => {
    const cleanupOnUnload = () => {
      runningCommandsRef.current.forEach((command) => {
        if (!command.contextDir) return;

        void deleteProjectSkillContext(command.projectId, command.contextDir, {
          keepalive: true,
        }).catch(() => {
          // Browser unload cleanup is best-effort.
        });
      });
    };

    window.addEventListener("pagehide", cleanupOnUnload);
    window.addEventListener("beforeunload", cleanupOnUnload);

    return () => {
      cleanupOnUnload();
      window.removeEventListener("pagehide", cleanupOnUnload);
      window.removeEventListener("beforeunload", cleanupOnUnload);
    };
  }, []);

  return {
    execute,
    isExecuting: runningCount > 0,
    stop,
  };
}
