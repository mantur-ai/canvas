"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import { useTranslations } from "next-intl";
import {
  ChatWindow,
  type ChatWindowModelOption,
  type ChatWindowReferenceImage,
} from "@/components/canvas/chat-window";
import { StoryboardImageNode } from "@/components/canvas/nodes/storyboard-image-node";
import { StoryboardListNode } from "@/components/canvas/nodes/storyboard-list-node";
import { StoryboardVideoNode } from "@/components/canvas/nodes/storyboard-video-node";
import { useSilentAgentCommand } from "@/components/canvas/use-silent-agent-command";
import { fetchConfigCached, subscribeConfigCache } from "@/lib/client-data-cache";
import { DEFAULT_WORKFLOW_SKILLS, type AppConfig } from "@/lib/config-schema";
import { flowStateSchema, type FlowState } from "@/lib/flow-schema";
import {
  clearProjectImageFile,
  fetchProjectCanvasData,
  fetchProjectImages,
  fetchProjectVideos,
  saveProjectFlow,
  saveProjectConfigSelection,
  saveProjectSelectedModel,
} from "@/lib/project-api";
import type { ProjectDetail } from "@/lib/project-types";
import { useCanvasStore } from "@/store/use-canvas-store";
import { useLayoutStore } from "@/store/use-layout-store";

const FLOW_SAVE_DELAY_MS = 500;
const EMPTY_CONFIG: AppConfig = {
  imageBeds: [],
  imageModels: [],
  videoModels: [],
  workflowSkills: DEFAULT_WORKFLOW_SKILLS,
};
const EMPTY_CHAT_REFERENCE_IMAGES: ChatWindowReferenceImage[] = [];

function isReferenceImageType(assetType: string) {
  return assetType === "reference" || assetType === "references";
}

function isProjectAssetImage(project: ProjectDetail | null, imageId: string) {
  if (!project) return false;

  return Object.values(project.assets).some((assets) =>
    assets.some((asset) => asset.id === imageId || asset.children.includes(imageId)),
  );
}

function toSerializableFlow(nodes: Node[], edges: Edge[], baseFlow: FlowState): FlowState | null {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  const baseNodeIds = new Set(baseFlow.nodes.map((node) => node.id));
  const baseEdgeIds = new Set(baseFlow.edges.map((edge) => edge.id));
  const parsedFlow = flowStateSchema.safeParse({
    nodes: [
      ...baseFlow.nodes.map((baseNode) => {
        const currentNode = nodeById.get(baseNode.id);

        return currentNode
          ? {
              ...baseNode,
              data: currentNode.data,
              hidden: currentNode.hidden,
              position: currentNode.position,
              type: currentNode.type ?? baseNode.type,
            }
          : baseNode;
      }),
      ...nodes
        .filter((node) => !baseNodeIds.has(node.id))
        .map((node) => ({
          id: node.id,
          data: node.data,
          hidden: node.hidden,
          position: node.position,
          type: node.type,
        })),
    ],
    edges: [
      ...baseFlow.edges.map((baseEdge) => {
        const currentEdge = edgeById.get(baseEdge.id);

        return currentEdge
          ? {
              ...baseEdge,
              animated: currentEdge.animated,
              hidden: currentEdge.hidden,
              source: currentEdge.source,
              sourceHandle: currentEdge.sourceHandle ?? undefined,
              target: currentEdge.target,
              targetHandle: currentEdge.targetHandle ?? undefined,
            }
          : baseEdge;
      }),
      ...edges
        .filter((edge) => !baseEdgeIds.has(edge.id))
        .map((edge) => ({
          animated: edge.animated,
          hidden: edge.hidden,
          id: edge.id,
          source: edge.source,
          sourceHandle: edge.sourceHandle ?? undefined,
          target: edge.target,
          targetHandle: edge.targetHandle ?? undefined,
        })),
    ],
  });

  return parsedFlow.success ? parsedFlow.data : null;
}

function CanvasWorkspaceInner() {
  const t = useTranslations("Canvas");
  const tSidebar = useTranslations("Sidebar");
  const { fitView } = useReactFlow();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const fitViewKeyRef = useRef("");
  const { execute: executeSilentAgentCommand, stop: stopSilentAgentCommand } =
    useSilentAgentCommand();
  const episodeCommandLoading = useLayoutStore((state) => state.sidebarLoading.episodes > 0);
  const [chatWindowPosition, setChatWindowPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [config, setConfig] = useState<AppConfig>(EMPTY_CONFIG);
  const [selectedImageModelId, setSelectedImageModelId] = useState("");
  const [selectedVideoModelId, setSelectedVideoModelId] = useState("");
  const {
    currentCanvasData,
    currentProject,
    edges,
    nodes,
    onConnect,
    onEdgesChange,
    onNodesChange,
    clearSelectedMediaGridItem,
    commandStatuses,
    selectedEpisodeIds,
    selectedMediaGridItem,
    currentCanvasDataByEpisode,
    mergeProjectCanvasData,
    setActiveEpisodeId,
    setCommandStatus,
    setProjectCanvasDataBatch,
    updateImageAsset,
    updateVideoAsset,
  } = useCanvasStore();
  const activeEpisodeIds = useMemo(() => {
    const availableEpisodeIds = new Set(
      currentProject?.episodes.map((episode) => episode.id) ?? [],
    );
    return selectedEpisodeIds.filter((episodeId) => availableEpisodeIds.has(episodeId));
  }, [currentProject?.episodes, selectedEpisodeIds]);
  const activeEpisodeKey = activeEpisodeIds.join(",");
  const currentProjectId = currentProject?.id ?? "";
  const modelOptions = useMemo<ChatWindowModelOption[]>(() => {
    const models =
      selectedMediaGridItem?.item.type === "video" ? config.videoModels : config.imageModels;

    return models.map((model) => ({
      id: model.id,
      name: model.name,
      providerId: model.providerId,
    }));
  }, [config.imageModels, config.videoModels, selectedMediaGridItem?.item.type]);
  const preferredModelId =
    selectedMediaGridItem?.item.type === "video" ? selectedVideoModelId : selectedImageModelId;
  const selectedModelId = modelOptions.some((model) => model.id === preferredModelId)
    ? preferredModelId
    : (modelOptions[0]?.id ?? "");
  const selectedImageModel = config.imageModels.find((model) => model.id === selectedModelId);
  const selectedVideoModel = config.videoModels.find((model) => model.id === selectedModelId);
  const selectedImageBed =
    config.imageBeds.find((imageBed) => imageBed.isDefault) ?? config.imageBeds[0] ?? null;
  const selectedProjectModel =
    selectedMediaGridItem?.item.type === "video" ? selectedVideoModel : selectedImageModel;
  const selectedMediaCommandStatus = selectedMediaGridItem
    ? selectedMediaGridItem.item.url && commandStatuses[selectedMediaGridItem.item.id] === "error"
      ? selectedMediaGridItem.item.status || "success"
      : (commandStatuses[selectedMediaGridItem.item.id] ?? selectedMediaGridItem.item.status)
    : "";
  const commandStatus =
    selectedMediaCommandStatus === "loading" ||
    selectedMediaCommandStatus === "error" ||
    selectedMediaCommandStatus === "success"
      ? selectedMediaCommandStatus
      : undefined;
  const requiresFirstLastFrame =
    selectedMediaGridItem?.item.type === "video" &&
    selectedVideoModel?.videoReferenceMode === "first-last-frame";
  const imageFallbackLabel = useCallback(
    (index: number) => t("chatWindow.imageFallback", { index }),
    [t],
  );
  const getAssetCategoryLabel = useCallback(
    (categoryKey: string) => {
      if (categoryKey === "character" || categoryKey === "characters")
        return tSidebar("assetTabs.character");
      if (categoryKey === "prop" || categoryKey === "props") return tSidebar("assetTabs.prop");
      if (categoryKey === "scene" || categoryKey === "scenes") return tSidebar("assetTabs.scene");
      if (categoryKey === "reference") return t("chatWindow.assetCategories.reference");
      return t("chatWindow.assetCategories.unknown");
    },
    [t, tSidebar],
  );
  const referenceImages = useMemo<ChatWindowReferenceImage[]>(() => {
    if (!selectedMediaGridItem) return [];

    const storyboardCanvasData = Object.values(currentCanvasDataByEpisode).find((canvasData) =>
      canvasData.data.storyboards.some((item) => item.id === selectedMediaGridItem.sceneId),
    );
    const storyboard = storyboardCanvasData?.data.storyboards.find(
      (item) => item.id === selectedMediaGridItem.sceneId,
    );
    if (!storyboardCanvasData || !storyboard) return [];

    const excludeReferenceMentions =
      !isProjectAssetImage(currentProject, selectedMediaGridItem.item.id) &&
      isReferenceImageType(selectedMediaGridItem.item.assetType);

    return storyboard.images.flatMap((imageId, index) => {
      const image = storyboardCanvasData.data.images.find((item) => item.id === imageId);
      if (!image || (excludeReferenceMentions && image.type === "reference")) return [];

      return [
        {
          categoryKey: image.type,
          categoryLabel: getAssetCategoryLabel(image.type),
          id: image.id,
          label: image.name.trim() || imageFallbackLabel(index + 1),
          name: image.name.trim() || imageFallbackLabel(index + 1),
          url: image.url,
        },
      ];
    });
  }, [
    currentCanvasDataByEpisode,
    currentProject,
    getAssetCategoryLabel,
    imageFallbackLabel,
    selectedMediaGridItem,
  ]);
  const selectedStoryboard = useMemo(() => {
    if (!selectedMediaGridItem) return null;

    return (
      Object.values(currentCanvasDataByEpisode)
        .flatMap((canvasData) => canvasData.data.storyboards)
        .find((storyboard) => storyboard.id === selectedMediaGridItem.sceneId) ?? null
    );
  }, [currentCanvasDataByEpisode, selectedMediaGridItem]);
  const selectedMediaIsProjectAsset = selectedMediaGridItem
    ? isProjectAssetImage(currentProject, selectedMediaGridItem.item.id)
    : false;
  const selectedMediaUsesStoryboardImagePrompt =
    Boolean(selectedMediaGridItem) &&
    !selectedMediaIsProjectAsset &&
    isReferenceImageType(selectedMediaGridItem?.item.assetType ?? "");
  const usesStoryboardAssetMentions =
    selectedMediaGridItem?.item.type === "video" || selectedMediaUsesStoryboardImagePrompt;
  const mediaMentionImages = usesStoryboardAssetMentions
    ? referenceImages
    : EMPTY_CHAT_REFERENCE_IMAGES;
  const selectedChatInitialPrompt = selectedMediaGridItem
    ? selectedMediaGridItem.item.type === "video" || selectedMediaUsesStoryboardImagePrompt
      ? selectedMediaGridItem.item.type === "video"
        ? selectedStoryboard?.videoPrompt ||
          selectedStoryboard?.prompt ||
          selectedStoryboard?.description ||
          selectedMediaGridItem.scenePrompt
        : selectedStoryboard?.prompt ||
          selectedStoryboard?.description ||
          selectedMediaGridItem.scenePrompt
      : selectedMediaGridItem.item.prompt
    : "";
  const selectedChatInitialPromptKey = selectedMediaGridItem
    ? `${selectedMediaGridItem.sceneId}:${selectedMediaGridItem.item.id}`
    : "";
  const handleModelChange =
    selectedMediaGridItem?.item.type === "video"
      ? setSelectedVideoModelId
      : setSelectedImageModelId;
  const saveSelectedProjectModel = useCallback(async () => {
    if (!currentProject || !selectedProjectModel || !selectedMediaGridItem) return false;

    if (selectedMediaGridItem.item.type === "video") {
      if (!selectedVideoModel) return false;

      await saveProjectConfigSelection(currentProject.id, {
        ...(selectedImageBed
          ? {
              imageBed: {
                apiKey: selectedImageBed.apiKey,
                example: selectedImageBed.example,
                id: selectedImageBed.id,
                isDefault: selectedImageBed.isDefault,
                name: selectedImageBed.name,
              },
            }
          : {}),
        selectedModel: {
          apiKey: selectedVideoModel.apiKey,
          example: selectedVideoModel.example,
          id: selectedVideoModel.id,
          name: selectedVideoModel.name,
          type: "video",
          videoReferenceMode: selectedVideoModel.videoReferenceMode,
        },
      });

      return true;
    }

    await saveProjectSelectedModel(currentProject.id, {
      apiKey: selectedProjectModel.apiKey,
      example: selectedProjectModel.example,
      id: selectedProjectModel.id,
      name: selectedProjectModel.name,
      type: "image",
    });

    return true;
  }, [
    currentProject,
    selectedImageBed,
    selectedMediaGridItem,
    selectedProjectModel,
    selectedVideoModel,
  ]);
  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      "storyboard-list-node": StoryboardListNode,
      "storyboard-image-node": StoryboardImageNode,
      "storyboard-video-node": StoryboardVideoNode,
    }),
    [],
  );

  const updateChatWindowPosition = useCallback(() => {
    const workspaceElement = workspaceRef.current;
    if (!selectedMediaGridItem || !workspaceElement) {
      setChatWindowPosition(null);
      return;
    }

    const selectedGridElement = workspaceElement.querySelector(
      "[data-selected-media-grid-item='true']",
    );
    const workspaceRect = workspaceElement.getBoundingClientRect();
    const anchorRect =
      selectedGridElement instanceof Element
        ? selectedGridElement.getBoundingClientRect()
        : selectedMediaGridItem.anchorRect;
    const preferredLeft = anchorRect.left - workspaceRect.left + anchorRect.width + 12;
    const preferredTop = anchorRect.top - workspaceRect.top + anchorRect.height / 2;
    const maxTop = Math.max(116, workspaceRect.height - 116);

    setChatWindowPosition({
      left: Math.max(16, preferredLeft),
      top: Math.min(Math.max(116, preferredTop), maxTop),
    });
  }, [selectedMediaGridItem]);

  useEffect(() => {
    updateChatWindowPosition();
  }, [updateChatWindowPosition]);

  useEffect(() => {
    if (!selectedMediaGridItem) return;

    window.addEventListener("resize", updateChatWindowPosition);

    return () => {
      window.removeEventListener("resize", updateChatWindowPosition);
    };
  }, [selectedMediaGridItem, updateChatWindowPosition]);

  useEffect(() => {
    if (!selectedMediaGridItem) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const isSelectedGridClick = Boolean(target.closest("[data-selected-media-grid-item='true']"));
      const isChatWindowClick = Boolean(target.closest("[data-canvas-chat-window='true']"));
      const isChatSelectClick = Boolean(target.closest("[data-slot='select-content']"));

      if (isSelectedGridClick || isChatWindowClick || isChatSelectClick) return;
      clearSelectedMediaGridItem();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [clearSelectedMediaGridItem, selectedMediaGridItem]);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeConfigCache((nextConfig) => {
      if (active) setConfig(nextConfig);
    });

    const loadConfig = async () => {
      try {
        const payload = await fetchConfigCached();
        if (active && payload) setConfig(payload);
      } catch {
        // The model selector can stay empty until settings are available.
      }
    };

    void loadConfig();

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const episodeIds = activeEpisodeKey ? activeEpisodeKey.split(",") : [];

    const loadCanvasData = async () => {
      if (!currentProjectId || episodeIds.length === 0) return;

      try {
        const episodeEntries = await Promise.all(
          episodeIds.map(
            async (episodeId) =>
              [episodeId, await fetchProjectCanvasData(currentProjectId, episodeId)] as const,
          ),
        );
        if (!active) return;
        setProjectCanvasDataBatch(currentProjectId, Object.fromEntries(episodeEntries));
      } catch {
        // Keep the existing canvas visible if project files are temporarily unavailable.
      }
    };

    void loadCanvasData();

    return () => {
      active = false;
    };
  }, [activeEpisodeKey, currentProjectId, setProjectCanvasDataBatch]);

  useEffect(() => {
    if (!currentCanvasData) return;
    if (episodeCommandLoading) return;

    const flow = toSerializableFlow(nodes, edges, currentCanvasData.data.flow);
    if (!flow) return;

    const timeoutId = window.setTimeout(() => {
      saveProjectFlow(currentCanvasData.projectId, flow).catch(() => {
        // Auto-save is best-effort; the next canvas change will retry writing flow.json.
      });
    }, FLOW_SAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentCanvasData, edges, episodeCommandLoading, nodes]);

  useEffect(() => {
    if (!currentProject || nodes.length === 0) return;
    const fitViewKey = `${currentProjectId}:${activeEpisodeKey}`;
    if (fitViewKeyRef.current === fitViewKey) return;
    fitViewKeyRef.current = fitViewKey;

    window.requestAnimationFrame(() => {
      void fitView({ duration: 240, padding: 0.18 });
    });
  }, [activeEpisodeKey, currentProject, currentProjectId, fitView, nodes.length]);

  return (
    <div
      ref={workspaceRef}
      className="relative h-full overflow-visible rounded-xl border border-white/10 bg-black/30"
    >
      {!currentProject ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-zinc-400">
          {t("emptyProject")}
        </div>
      ) : null}

      <ReactFlow
        colorMode="dark"
        edges={edges}
        nodes={nodes}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        onEdgesChange={onEdgesChange}
        onMove={updateChatWindowPosition}
        onNodeClick={(_event, node) => {
          if (node.type !== "storyboard-list-node") return;

          const episodeId = typeof node.data.episodeId === "string" ? node.data.episodeId : "";
          if (episodeId) setActiveEpisodeId(episodeId);
        }}
        minZoom={0.3}
        maxZoom={2}
        onNodesChange={onNodesChange}
        onPaneClick={clearSelectedMediaGridItem}
      >
        <MiniMap pannable zoomable />
        <Controls />
        <Background />
      </ReactFlow>

      {chatWindowPosition ? (
        <div
          data-canvas-chat-window="true"
          className="absolute z-20 w-[min(640px,calc(100%-32px))] -translate-y-1/2"
          style={{
            left: chatWindowPosition.left,
            top: chatWindowPosition.top,
          }}
        >
          <ChatWindow
            commandStatus={commandStatus}
            initialPrompt={selectedChatInitialPrompt || ""}
            initialPromptKey={selectedChatInitialPromptKey}
            initialMentionTags={mediaMentionImages}
            projectId={currentProject?.id ?? ""}
            emptyModelLabel={t("chatWindow.emptyModel")}
            placeholder={t("chatWindow.placeholder")}
            inputLabel={t("chatWindow.inputLabel")}
            addAttachmentLabel={t("chatWindow.addAttachment")}
            attachmentFallbackLabel={(index) => t("chatWindow.imageFallback", { index })}
            attachmentListLabel={t("chatWindow.attachmentList")}
            removeAttachmentLabel={t("chatWindow.removeAttachment")}
            firstFrameLabel={t("chatWindow.firstFrame")}
            lastFrameLabel={t("chatWindow.lastFrame")}
            promptPairSeparator={t("chatWindow.promptPairSeparator")}
            modelSelectLabel={t("chatWindow.modelSelect")}
            modelOptions={modelOptions}
            mediaMentionImages={mediaMentionImages}
            preferMediaMentions={usesStoryboardAssetMentions}
            referenceImages={referenceImages}
            requiresFirstLastFrame={requiresFirstLastFrame}
            selectedModelId={selectedModelId}
            sendLabel={t("chatWindow.send")}
            stopLabel={t("chatWindow.stop")}
            showVideoOptions={selectedMediaGridItem?.item.type === "video"}
            videoDurationLabel={t("chatWindow.videoDuration")}
            videoDurationUnitLabel={t("chatWindow.videoDurationUnit")}
            videoShotLabel={t("chatWindow.videoShot")}
            videoShotLabels={{
              static: t("chatWindow.videoShots.static"),
              "push-in": t("chatWindow.videoShots.pushIn"),
              "pull-out": t("chatWindow.videoShots.pullOut"),
              pan: t("chatWindow.videoShots.pan"),
              tilt: t("chatWindow.videoShots.tilt"),
              tracking: t("chatWindow.videoShots.tracking"),
              orbit: t("chatWindow.videoShots.orbit"),
              handheld: t("chatWindow.videoShots.handheld"),
            }}
            onModelChange={handleModelChange}
            onStop={() => {
              if (selectedMediaGridItem) stopSilentAgentCommand(selectedMediaGridItem.item.id);
            }}
            onSubmit={(payload) => {
              if (!selectedMediaGridItem) return;
              const projectId = currentProject?.id;
              if (!projectId) return;
              const targetSelection = selectedMediaGridItem;
              const targetEpisodeId = Object.entries(currentCanvasDataByEpisode).find(
                ([, canvasData]) =>
                  canvasData.data.storyboards.some(
                    (storyboard) => storyboard.id === targetSelection.sceneId,
                  ),
              )?.[0];

              void (async () => {
                let agentRunCompleted = false;

                try {
                  if (targetSelection.item.type === "image" && targetSelection.item.url) {
                    const result = await clearProjectImageFile(projectId, targetSelection.item.id);
                    updateImageAsset(result.image);
                  }

                  setCommandStatus(targetSelection.item.id, "loading");
                  const saved = await saveSelectedProjectModel();
                  if (!saved) return;

                  await executeSilentAgentCommand(payload, {
                    featureSkill:
                      targetSelection.item.type === "video"
                        ? "video-generate"
                        : isProjectAssetImage(currentProject, targetSelection.item.id)
                          ? "asset-panel-generate"
                          : "storyboard-image-generate",
                    mediaId: targetSelection.item.id,
                    mediaName: targetSelection.item.name,
                    mediaType: targetSelection.item.type,
                    scope: "canvas-grid",
                  });
                  agentRunCompleted = true;

                  if (targetSelection.item.type === "image") {
                    const images = await fetchProjectImages(projectId);
                    const updatedImage = images.find(
                      (image) => image.id === targetSelection.item.id,
                    );
                    if (updatedImage) {
                      updateImageAsset(updatedImage);
                      if (updatedImage.url.trim()) {
                        setCommandStatus(targetSelection.item.id, "success");
                      }
                    }
                  } else {
                    const videos = await fetchProjectVideos(projectId);
                    const updatedVideo = videos.find(
                      (video) => video.id === targetSelection.item.id,
                    );
                    if (updatedVideo) {
                      updateVideoAsset(updatedVideo);
                      if (updatedVideo.url.trim()) {
                        setCommandStatus(targetSelection.item.id, "success");
                      }
                    }
                  }

                  if (targetEpisodeId) {
                    const canvasData = await fetchProjectCanvasData(projectId, targetEpisodeId);
                    mergeProjectCanvasData(projectId, targetEpisodeId, canvasData);
                  }
                } catch {
                  if (!agentRunCompleted) {
                    setCommandStatus(targetSelection.item.id, "error");
                  }
                  // The agent run depends on the project model config being current.
                }
              })();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function CanvasWorkspace() {
  return (
    <ReactFlowProvider>
      <CanvasWorkspaceInner />
    </ReactFlowProvider>
  );
}
