"use client";

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { v4 as createUuid } from "uuid";
import { create } from "zustand";
import { initialFlowState, type FlowOpenState } from "@/lib/flow-schema";
import type { ProjectCanvasData, ProjectCommandStatus } from "@/lib/project-api";
import type { ProjectDetail, ProjectListItem } from "@/lib/project-types";
import type { ProjectImageAsset, ProjectStoryboard, ProjectVideoAsset } from "@/lib/project-types";

const STORYBOARD_LIST_MAX_HEIGHT = 420;
const STORYBOARD_MEDIA_NODE_WIDTH = 250;
const STORYBOARD_MEDIA_NODE_HEIGHT = 300;
const STORYBOARD_MEDIA_NODE_HORIZONTAL_GAP = 70;
const STORYBOARD_NODE_VERTICAL_GAP = 360;
const SELECTED_STORYBOARD_LIMIT = 3;
const EPISODE_NODE_VERTICAL_GAP = Math.max(
  STORYBOARD_LIST_MAX_HEIGHT + 100,
  SELECTED_STORYBOARD_LIMIT * STORYBOARD_NODE_VERTICAL_GAP + 160,
);

export type MediaItem = {
  assetType: string;
  id: string;
  name: string;
  prompt: string;
  url: string;
  cover: string;
  coverUrl: string;
  poster: string;
  type: "image" | "video";
  status: string;
};

export type StoryboardListNodeData = Record<string, unknown> & {
  episodeId: string;
  episodeName: string;
  storyboards: ProjectStoryboard[];
};

export type StoryboardMediaNodeData = Record<string, unknown> & {
  sceneId: string;
  selectedVideoId?: string;
  title: string;
  prompt: string;
  items: MediaItem[];
  mediaType: "image" | "video";
  selected: boolean;
};

export type SelectedMediaGridItem = {
  nodeId: string;
  sceneId: string;
  scenePrompt: string;
  sceneTitle: string;
  item: MediaItem;
  anchorRect: {
    height: number;
    left: number;
    top: number;
    width: number;
  };
};

type CanvasNodeData = Record<string, unknown>;
type CanvasNode = Node<CanvasNodeData>;
type CanvasEdge = Edge;
type CanvasPosition = {
  x: number;
  y: number;
};
type CanvasRect = CanvasPosition & {
  height: number;
  width: number;
};
type CurrentCanvasData = {
  projectId: string;
  episodeId: string;
  data: ProjectCanvasData;
};
type CanvasDataByEpisode = Record<string, CurrentCanvasData>;

type CanvasState = {
  commandStatuses: Record<string, ProjectCommandStatus>;
  currentProject: ProjectDetail | null;
  projectImageRevision: number;
  projects: ProjectListItem[];
  currentCanvasData: CurrentCanvasData | null;
  currentCanvasDataByEpisode: CanvasDataByEpisode;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedEpisodeIds: string[];
  activeEpisodeId: string;
  activeStoryboardId: string;
  selectedStoryboardIds: string[];
  selectedMediaGridItem: SelectedMediaGridItem | null;
  addImageToStoryboard: (storyboardId: string, image: ProjectImageAsset) => void;
  addVideoToStoryboard: (storyboardId: string, video: ProjectVideoAsset) => void;
  removeMediaFromStoryboard: (
    storyboardId: string,
    mediaId: string,
    mediaType: "image" | "video",
  ) => void;
  setStoryboardSelectedVideo: (storyboardId: string, videoId: string) => void;
  clearStoryboardSelectedVideo: (storyboardId: string, videoId: string) => void;
  updateImageAsset: (image: ProjectImageAsset) => void;
  updateVideoAsset: (video: ProjectVideoAsset) => void;
  addNode: (label: string) => void;
  addStoryboard: (episodeId: string, afterStoryboardId?: string) => string | undefined;
  applyProjectOpenState: (openState: FlowOpenState) => void;
  clearSelectedMediaGridItem: () => void;
  clearCommandStatus: (gridId: string) => void;
  clearCurrentProject: () => void;
  deleteStoryboard: (storyboardId: string) => void;
  moveStoryboard: (storyboardId: string, direction: -1 | 1) => void;
  selectMediaGridItem: (selection: SelectedMediaGridItem) => void;
  setCommandStatus: (gridId: string, status: ProjectCommandStatus) => void;
  setCommandStatuses: (statuses: Record<string, ProjectCommandStatus>) => void;
  setActiveEpisodeId: (episodeId: string) => void;
  setActiveStoryboardId: (storyboardId: string) => void;
  mergeProjectCanvasData: (projectId: string, episodeId: string, data: ProjectCanvasData) => void;
  setProjectCanvasData: (projectId: string, episodeId: string, data: ProjectCanvasData) => void;
  setProjectCanvasDataBatch: (
    projectId: string,
    dataByEpisode: Record<string, ProjectCanvasData>,
  ) => void;
  syncProjectImages: (images: ProjectImageAsset[]) => void;
  setCurrentProject: (project: ProjectDetail) => void;
  setProjects: (projects: ProjectListItem[]) => void;
  setSelectedEpisodeIds: (episodeIds: string[]) => void;
  toggleStoryboardSelection: (storyboardId: string) => void;
  updateStoryboard: (
    storyboardId: string,
    updates: Pick<ProjectStoryboard, "description" | "name" | "prompt" | "videoPrompt">,
  ) => void;
  onConnect: (connection: Connection) => void;
  onEdgesChange: (changes: EdgeChange<CanvasEdge>[]) => void;
  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  reset: () => void;
};

const toNode = (node: (typeof initialFlowState.nodes)[number]): CanvasNode => ({
  ...node,
  data: node.data ?? {},
  type: node.type ?? "default",
});

const toEdge = (edge: (typeof initialFlowState.edges)[number]): CanvasEdge => edge;

const buildInitialState = () => ({
  nodes: initialFlowState.nodes.map(toNode),
  edges: initialFlowState.edges.map(toEdge),
});

const findMediaItems = (
  ids: string[],
  assets: Array<ProjectImageAsset | ProjectVideoAsset>,
  mediaType: "image" | "video",
  commandStatuses: Record<string, ProjectCommandStatus>,
): MediaItem[] =>
  ids.flatMap((id) => {
    const asset = assets.find((item) => item.id === id);
    if (!asset) return [];
    const persistedStatus = "status" in asset ? asset.status : "";
    const commandStatus = commandStatuses[asset.id];
    const status =
      asset.url && commandStatus === "error"
        ? persistedStatus || "success"
        : (commandStatus ?? persistedStatus);

    return [
      {
        id: asset.id,
        assetType: "type" in asset ? asset.type : "",
        name: asset.name,
        prompt: asset.prompt,
        url: asset.url,
        cover: "cover" in asset ? asset.cover : "",
        coverUrl: "coverUrl" in asset ? asset.coverUrl : "",
        poster: "poster" in asset ? asset.poster : "",
        type: mediaType,
        status,
      },
    ];
  });

const getStoryboardDisplayName = (storyboard: ProjectStoryboard, index: number) =>
  storyboard.name.trim() || `S${index + 1}`;

const resolveNodePosition = (data: ProjectCanvasData, nodeId: string, fallback: CanvasPosition) =>
  data.flow.nodes.find((flowNode) => flowNode.id === nodeId)?.position ?? fallback;

const toMediaNodeRect = (position: CanvasPosition): CanvasRect => ({
  ...position,
  height: STORYBOARD_MEDIA_NODE_HEIGHT,
  width: STORYBOARD_MEDIA_NODE_WIDTH,
});

const rectsOverlap = (first: CanvasRect, second: CanvasRect) =>
  first.x < second.x + second.width &&
  first.x + first.width > second.x &&
  first.y < second.y + second.height &&
  first.y + first.height > second.y;

function collidesWithMediaNode(position: CanvasPosition, occupiedRects: CanvasRect[]) {
  const rect = toMediaNodeRect(position);
  return occupiedRects.some((occupiedRect) => rectsOverlap(rect, occupiedRect));
}

function findOpenMediaNodePosition(
  preferred: CanvasPosition,
  fallback: CanvasPosition,
  occupiedRects: CanvasRect[],
) {
  let adjusted = collidesWithMediaNode(preferred, occupiedRects);
  let candidate = adjusted ? fallback : preferred;

  // Legacy or manually dragged flow data can put media nodes on top of each other.
  // Nudge only colliding nodes so valid user layouts stay intact.
  while (collidesWithMediaNode(candidate, occupiedRects)) {
    adjusted = true;
    candidate = {
      x: fallback.x,
      y: candidate.y + STORYBOARD_NODE_VERTICAL_GAP,
    };
  }

  occupiedRects.push(toMediaNodeRect(candidate));
  return { adjusted, position: candidate };
}

const findEpisodeIdByStoryboard = (
  canvasDataByEpisode: CanvasDataByEpisode,
  storyboardId: string,
) =>
  Object.entries(canvasDataByEpisode).find(([, canvasData]) =>
    canvasData.data.storyboards.some((storyboard) => storyboard.id === storyboardId),
  )?.[0] ?? "";

const updateFlowFromCanvasNodes = (
  canvasDataByEpisode: CanvasDataByEpisode,
  nodes: CanvasNode[],
): CanvasDataByEpisode => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return Object.fromEntries(
    Object.entries(canvasDataByEpisode).map(([episodeId, canvasData]) => {
      const allowedNodeIds = new Set([
        `storyboard-list-${episodeId}`,
        ...canvasData.data.storyboards.flatMap((storyboard) => [
          `storyboard-image-${storyboard.id}`,
          `storyboard-video-${storyboard.id}`,
        ]),
      ]);
      const nextFlowNodes = Array.from(allowedNodeIds).flatMap((nodeId) => {
        const node = nodeById.get(nodeId);
        if (!node) return [];

        return [
          {
            id: node.id,
            type: node.type,
            position: node.position,
            hidden: node.hidden,
          },
        ];
      });

      return [
        episodeId,
        {
          ...canvasData,
          data: {
            ...canvasData.data,
            flow: {
              nodes: nextFlowNodes,
              edges: canvasData.data.flow.edges,
              openState: canvasData.data.flow.openState,
            },
          },
        },
      ];
    }),
  );
};

const buildStoryboardCanvas = (
  episodeId: string,
  episodeName: string,
  data: ProjectCanvasData,
  selectedStoryboardIds: string[],
  commandStatuses: Record<string, ProjectCommandStatus>,
  listFallbackPosition = { x: 80, y: 80 },
) => {
  const availableStoryboardIds = new Set(data.storyboards.map((storyboard) => storyboard.id));
  // Keep the expansion limit scoped to this storyboard list so sibling lists do not collapse each other.
  const selectedIds = selectedStoryboardIds
    .filter((id) => availableStoryboardIds.has(id))
    .slice(-SELECTED_STORYBOARD_LIMIT);
  const listNodeId = `storyboard-list-${episodeId}`;
  const listPosition = resolveNodePosition(data, listNodeId, listFallbackPosition);
  const nodes: CanvasNode[] = [
    {
      id: listNodeId,
      type: "storyboard-list-node",
      position: listPosition,
      data: {
        episodeId,
        episodeName,
        storyboards: data.storyboards,
      } satisfies StoryboardListNodeData,
    },
  ];
  const edges: CanvasEdge[] = [];
  const occupiedMediaRects: CanvasRect[] = [];

  // Only selected storyboards expand into media nodes, keeping the canvas focused.
  data.storyboards
    .filter((storyboard) => selectedIds.includes(storyboard.id))
    .slice(0, SELECTED_STORYBOARD_LIMIT)
    .forEach((storyboard, index) => {
      const imageNodeId = `storyboard-image-${storyboard.id}`;
      const videoNodeId = `storyboard-video-${storyboard.id}`;
      const storyboardIndex = data.storyboards.findIndex((item) => item.id === storyboard.id);
      const storyboardName = getStoryboardDisplayName(
        storyboard,
        storyboardIndex >= 0 ? storyboardIndex : index,
      );
      const laneY = listPosition.y + index * STORYBOARD_NODE_VERTICAL_GAP;
      const imageFallbackPosition = { x: listPosition.x + 320, y: laneY };
      const imageResult = findOpenMediaNodePosition(
        resolveNodePosition(data, imageNodeId, imageFallbackPosition),
        imageFallbackPosition,
        occupiedMediaRects,
      );
      const imagePosition = imageResult.position;
      const videoFallbackPosition = {
        x: imagePosition.x + STORYBOARD_MEDIA_NODE_WIDTH + STORYBOARD_MEDIA_NODE_HORIZONTAL_GAP,
        y: imagePosition.y,
      };
      const videoResult = findOpenMediaNodePosition(
        imageResult.adjusted
          ? videoFallbackPosition
          : resolveNodePosition(data, videoNodeId, videoFallbackPosition),
        videoFallbackPosition,
        occupiedMediaRects,
      );
      const videoPosition = videoResult.position;

      nodes.push(
        {
          id: imageNodeId,
          type: "storyboard-image-node",
          position: imagePosition,
          data: {
            sceneId: storyboard.id,
            title: storyboardName,
            prompt: storyboard.prompt || storyboard.description,
            mediaType: "image",
            selected: selectedIds.includes(storyboard.id),
            items: findMediaItems(storyboard.images, data.images, "image", commandStatuses),
          } satisfies StoryboardMediaNodeData,
        },
        {
          id: videoNodeId,
          type: "storyboard-video-node",
          position: videoPosition,
          data: {
            sceneId: storyboard.id,
            title: storyboardName,
            prompt: storyboard.videoPrompt || storyboard.prompt || storyboard.description,
            mediaType: "video",
            selected: selectedIds.includes(storyboard.id),
            items: findMediaItems(storyboard.videos, data.videos, "video", commandStatuses),
            selectedVideoId: storyboard.selectedVideo,
          } satisfies StoryboardMediaNodeData,
        },
      );

      edges.push(
        {
          id: `edge-${listNodeId}-${imageNodeId}`,
          source: listNodeId,
          target: imageNodeId,
          animated: true,
        },
        {
          id: `edge-${imageNodeId}-${videoNodeId}`,
          source: imageNodeId,
          target: videoNodeId,
          animated: true,
        },
      );
    });

  return { nodes, edges, selectedStoryboardIds: selectedIds };
};

const buildSelectedEpisodesCanvas = (
  project: ProjectDetail | null,
  selectedEpisodeIds: string[],
  canvasDataByEpisode: CanvasDataByEpisode,
  selectedStoryboardIds: string[],
  commandStatuses: Record<string, ProjectCommandStatus>,
) => {
  const projectEpisodeIds = new Set(project?.episodes.map((episode) => episode.id) ?? []);
  const episodeIds = selectedEpisodeIds.filter(
    (episodeId) => projectEpisodeIds.has(episodeId) && canvasDataByEpisode[episodeId],
  );
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];
  const selectedStoryboardIdsByEpisode = new Map<string, string[]>();

  episodeIds.forEach((episodeId, index) => {
    const canvasData = canvasDataByEpisode[episodeId];
    if (!canvasData) return;

    const episodeName = project?.episodes.find((episode) => episode.id === episodeId)?.name ?? "";
    const nextCanvas = buildStoryboardCanvas(
      episodeId,
      episodeName,
      canvasData.data,
      selectedStoryboardIds,
      commandStatuses,
      { x: 80, y: 80 + index * EPISODE_NODE_VERTICAL_GAP },
    );

    nodes.push(...nextCanvas.nodes);
    edges.push(...nextCanvas.edges);
    selectedStoryboardIdsByEpisode.set(episodeId, nextCanvas.selectedStoryboardIds);
  });

  return {
    currentCanvasData: episodeIds[0] ? (canvasDataByEpisode[episodeIds[0]] ?? null) : null,
    edges,
    nodes,
    selectedStoryboardIds: episodeIds.flatMap(
      (episodeId) => selectedStoryboardIdsByEpisode.get(episodeId) ?? [],
    ),
  };
};

const getDefaultStoryboardSelection = (
  selectedEpisodeIds: string[],
  canvasDataByEpisode: CanvasDataByEpisode,
) => {
  const firstEpisodeId = selectedEpisodeIds.find((episodeId) => canvasDataByEpisode[episodeId]);
  if (!firstEpisodeId) return [];

  return canvasDataByEpisode[firstEpisodeId].data.storyboards
    .slice(0, SELECTED_STORYBOARD_LIMIT)
    .map((storyboard) => storyboard.id);
};

const resolveStoryboardSelection = (
  selectedEpisodeIds: string[],
  canvasDataByEpisode: CanvasDataByEpisode,
  selectedStoryboardIds: string[],
) => {
  const visibleSelectedIds = selectedEpisodeIds.flatMap((episodeId) => {
    const availableStoryboardIds = new Set(
      canvasDataByEpisode[episodeId]?.data.storyboards.map((storyboard) => storyboard.id) ?? [],
    );

    return selectedStoryboardIds
      .filter((storyboardId) => availableStoryboardIds.has(storyboardId))
      .slice(-SELECTED_STORYBOARD_LIMIT);
  });

  return visibleSelectedIds.length > 0
    ? visibleSelectedIds
    : getDefaultStoryboardSelection(selectedEpisodeIds, canvasDataByEpisode);
};

function resolveEpisodeSelection(project: ProjectDetail | null, selectedEpisodeIds: string[]) {
  const availableEpisodeIds = new Set(project?.episodes.map((episode) => episode.id) ?? []);
  const visibleEpisodeIds = selectedEpisodeIds.filter((episodeId) =>
    availableEpisodeIds.has(episodeId),
  );

  return visibleEpisodeIds.length > 0
    ? visibleEpisodeIds
    : (project?.episodes.slice(0, 3).map((episode) => episode.id) ?? []);
}

export const useCanvasStore = create<CanvasState>((set) => ({
  commandStatuses: {},
  currentProject: null,
  projectImageRevision: 0,
  projects: [],
  currentCanvasData: null,
  currentCanvasDataByEpisode: {},
  selectedEpisodeIds: [],
  activeEpisodeId: "",
  activeStoryboardId: "",
  selectedStoryboardIds: [],
  selectedMediaGridItem: null,
  ...buildInitialState(),
  clearCurrentProject: () =>
    set({
      activeEpisodeId: "",
      activeStoryboardId: "",
      commandStatuses: {},
      currentCanvasData: null,
      currentCanvasDataByEpisode: {},
      currentProject: null,
      edges: [],
      nodes: [],
      selectedEpisodeIds: [],
      selectedMediaGridItem: null,
      selectedStoryboardIds: [],
    }),
  clearCommandStatus: (gridId) =>
    set((state) => {
      const nextStatuses = { ...state.commandStatuses };
      delete nextStatuses[gridId];
      const selectedMediaGridItem =
        state.selectedMediaGridItem?.item.id === gridId
          ? {
              ...state.selectedMediaGridItem,
              item: {
                ...state.selectedMediaGridItem.item,
                status: "",
              },
            }
          : state.selectedMediaGridItem;

      const nextCanvas = buildSelectedEpisodesCanvas(
        state.currentProject,
        state.selectedEpisodeIds,
        state.currentCanvasDataByEpisode,
        state.selectedStoryboardIds,
        nextStatuses,
      );

      return {
        commandStatuses: nextStatuses,
        edges: nextCanvas.edges.length > 0 ? nextCanvas.edges : state.edges,
        nodes: nextCanvas.nodes.length > 0 ? nextCanvas.nodes : state.nodes,
        selectedMediaGridItem,
      };
    }),
  applyProjectOpenState: (openState) =>
    set((state) => {
      const selectedEpisodeIds = resolveEpisodeSelection(
        state.currentProject,
        openState.selectedEpisodeIds,
      );
      const hasLoadedSelectedEpisode = selectedEpisodeIds.some(
        (episodeId) => state.currentCanvasDataByEpisode[episodeId],
      );
      const selectedStoryboardIds = hasLoadedSelectedEpisode
        ? resolveStoryboardSelection(
            selectedEpisodeIds,
            state.currentCanvasDataByEpisode,
            openState.selectedStoryboardIds,
          )
        : openState.selectedStoryboardIds;
      const nextCanvas = buildSelectedEpisodesCanvas(
        state.currentProject,
        selectedEpisodeIds,
        state.currentCanvasDataByEpisode,
        selectedStoryboardIds,
        state.commandStatuses,
      );
      const activeEpisodeId = selectedEpisodeIds.includes(openState.activeEpisodeId)
        ? openState.activeEpisodeId
        : (selectedEpisodeIds[0] ?? "");
      const activeStoryboardId = selectedStoryboardIds.includes(openState.activeStoryboardId)
        ? openState.activeStoryboardId
        : (selectedStoryboardIds[0] ?? "");

      return {
        activeEpisodeId,
        activeStoryboardId,
        currentCanvasData: nextCanvas.currentCanvasData ?? state.currentCanvasData,
        edges: nextCanvas.edges.length > 0 ? nextCanvas.edges : state.edges,
        nodes: nextCanvas.nodes.length > 0 ? nextCanvas.nodes : state.nodes,
        selectedEpisodeIds,
        selectedMediaGridItem: null,
        selectedStoryboardIds,
      };
    }),
  clearSelectedMediaGridItem: () => set({ selectedMediaGridItem: null }),
  selectMediaGridItem: (selection) => set({ selectedMediaGridItem: selection }),
  setActiveEpisodeId: (episodeId) =>
    set((state) => {
      const targetCanvasData = state.currentCanvasDataByEpisode[episodeId];

      return {
        activeEpisodeId: episodeId,
        currentCanvasData: targetCanvasData ?? state.currentCanvasData,
        selectedMediaGridItem: null,
      };
    }),
  setActiveStoryboardId: (storyboardId) => set({ activeStoryboardId: storyboardId }),
  setCurrentProject: (project) =>
    set((state) => {
      const availableEpisodeIds = new Set(project.episodes.map((episode) => episode.id));
      const selectedEpisodeIds =
        state.currentProject?.id === project.id
          ? state.selectedEpisodeIds.filter((episodeId) => availableEpisodeIds.has(episodeId))
          : project.episodes.slice(0, 3).map((episode) => episode.id);
      const activeEpisodeId = selectedEpisodeIds.includes(state.activeEpisodeId)
        ? state.activeEpisodeId
        : (selectedEpisodeIds[0] ?? "");

      return {
        activeEpisodeId,
        currentProject: project,
        selectedEpisodeIds,
        selectedMediaGridItem: null,
      };
    }),
  setProjects: (projects) => set({ projects }),
  setSelectedEpisodeIds: (episodeIds) =>
    set((state) => {
      if (episodeIds.length === 0) {
        return {
          activeEpisodeId: "",
          activeStoryboardId: "",
          currentCanvasData: null,
          edges: [],
          nodes: [],
          selectedEpisodeIds: [],
          selectedMediaGridItem: null,
          selectedStoryboardIds: [],
        };
      }

      const selectedStoryboardIds = resolveStoryboardSelection(
        episodeIds,
        state.currentCanvasDataByEpisode,
        state.selectedStoryboardIds,
      );
      const nextCanvas = buildSelectedEpisodesCanvas(
        state.currentProject,
        episodeIds,
        state.currentCanvasDataByEpisode,
        selectedStoryboardIds,
        state.commandStatuses,
      );

      return {
        currentCanvasData: nextCanvas.currentCanvasData,
        edges: nextCanvas.edges,
        nodes: nextCanvas.nodes,
        selectedEpisodeIds: episodeIds,
        selectedMediaGridItem: null,
        selectedStoryboardIds: nextCanvas.selectedStoryboardIds,
      };
    }),
  setCommandStatus: (gridId, status) =>
    set((state) => {
      const nextStatuses = { ...state.commandStatuses, [gridId]: status };
      const selectedMediaGridItem =
        state.selectedMediaGridItem?.item.id === gridId
          ? {
              ...state.selectedMediaGridItem,
              item: {
                ...state.selectedMediaGridItem.item,
                status,
              },
            }
          : state.selectedMediaGridItem;

      if (!state.currentCanvasData) {
        return {
          commandStatuses: nextStatuses,
          selectedMediaGridItem,
        };
      }

      const nextCanvas = buildSelectedEpisodesCanvas(
        state.currentProject,
        state.selectedEpisodeIds,
        state.currentCanvasDataByEpisode,
        state.selectedStoryboardIds,
        nextStatuses,
      );

      return {
        commandStatuses: nextStatuses,
        edges: nextCanvas.edges,
        nodes: nextCanvas.nodes,
        selectedMediaGridItem,
      };
    }),
  setCommandStatuses: (statuses) =>
    set((state) => {
      if (!state.currentCanvasData) return { commandStatuses: statuses };

      const nextCanvas = buildSelectedEpisodesCanvas(
        state.currentProject,
        state.selectedEpisodeIds,
        state.currentCanvasDataByEpisode,
        state.selectedStoryboardIds,
        statuses,
      );

      return {
        commandStatuses: statuses,
        edges: nextCanvas.edges,
        nodes: nextCanvas.nodes,
        selectedMediaGridItem: null,
      };
    }),
  mergeProjectCanvasData: (projectId, episodeId, data) =>
    set((state) => {
      const nextCanvasData: CurrentCanvasData = {
        projectId,
        episodeId,
        data,
      };
      const nextCanvasDataByEpisode = {
        ...state.currentCanvasDataByEpisode,
        [episodeId]: nextCanvasData,
      };
      const selectedStoryboardIds = resolveStoryboardSelection(
        state.selectedEpisodeIds,
        nextCanvasDataByEpisode,
        state.selectedStoryboardIds,
      );
      const nextCanvas = buildSelectedEpisodesCanvas(
        state.currentProject,
        state.selectedEpisodeIds,
        nextCanvasDataByEpisode,
        selectedStoryboardIds,
        state.commandStatuses,
      );
      const selectedItem = state.selectedMediaGridItem?.item;
      const selectedImage =
        selectedItem?.type === "image"
          ? data.images.find((image) => image.id === selectedItem.id)
          : undefined;
      const selectedVideo =
        selectedItem?.type === "video"
          ? data.videos.find((video) => video.id === selectedItem.id)
          : undefined;
      const selectedMediaGridItem = state.selectedMediaGridItem
        ? selectedImage
          ? {
              ...state.selectedMediaGridItem,
              item: {
                ...state.selectedMediaGridItem.item,
                assetType: selectedImage.type,
                name: selectedImage.name,
                prompt: selectedImage.prompt,
                url: selectedImage.url,
              },
            }
          : selectedVideo
            ? {
                ...state.selectedMediaGridItem,
                item: {
                  ...state.selectedMediaGridItem.item,
                  cover: selectedVideo.cover,
                  coverUrl: selectedVideo.coverUrl,
                  name: selectedVideo.name,
                  poster: selectedVideo.poster,
                  prompt: selectedVideo.prompt,
                  status: state.commandStatuses[selectedVideo.id] ?? selectedVideo.status,
                  url: selectedVideo.url,
                },
              }
            : state.selectedMediaGridItem
        : null;
      const currentSelection = state.selectedStoryboardIds.join(",");
      const nextSelection = nextCanvas.selectedStoryboardIds.join(",");

      return {
        currentCanvasData:
          state.currentCanvasData?.episodeId === episodeId
            ? nextCanvasData
            : (nextCanvas.currentCanvasData ?? state.currentCanvasData),
        currentCanvasDataByEpisode: nextCanvasDataByEpisode,
        edges: nextCanvas.edges,
        nodes: nextCanvas.nodes,
        projectImageRevision: state.projectImageRevision + 1,
        selectedMediaGridItem,
        selectedStoryboardIds:
          currentSelection === nextSelection
            ? state.selectedStoryboardIds
            : nextCanvas.selectedStoryboardIds,
      };
    }),
  setProjectCanvasData: (_projectId, episodeId, data) =>
    set((state) => {
      const currentCanvasData = {
        projectId: _projectId,
        episodeId,
        data,
      };
      const nextCanvasDataByEpisode = {
        ...state.currentCanvasDataByEpisode,
        [episodeId]: currentCanvasData,
      };
      const selectedEpisodeIds = state.selectedEpisodeIds;
      const resolvedStoryboardIds = resolveStoryboardSelection(
        selectedEpisodeIds,
        nextCanvasDataByEpisode,
        state.selectedStoryboardIds,
      );
      const selectedStoryboardIds =
        resolvedStoryboardIds.length > 0 || state.selectedStoryboardIds.length === 0
          ? resolvedStoryboardIds
          : state.selectedStoryboardIds;
      const nextCanvas = buildSelectedEpisodesCanvas(
        state.currentProject,
        selectedEpisodeIds,
        nextCanvasDataByEpisode,
        selectedStoryboardIds,
        state.commandStatuses,
      );
      const currentSelection = state.selectedStoryboardIds.join(",");
      const nextSelection = nextCanvas.selectedStoryboardIds.join(",");

      return {
        currentCanvasData: nextCanvas.currentCanvasData,
        currentCanvasDataByEpisode: nextCanvasDataByEpisode,
        selectedMediaGridItem: null,
        nodes: nextCanvas.nodes,
        edges: nextCanvas.edges,
        selectedStoryboardIds:
          currentSelection === nextSelection
            ? state.selectedStoryboardIds
            : nextCanvas.selectedStoryboardIds,
      };
    }),
  setProjectCanvasDataBatch: (projectId, dataByEpisode) =>
    set((state) => {
      const nextCanvasDataByEpisode = {
        ...state.currentCanvasDataByEpisode,
        ...Object.fromEntries(
          Object.entries(dataByEpisode).map(([episodeId, data]) => [
            episodeId,
            {
              projectId,
              episodeId,
              data,
            } satisfies CurrentCanvasData,
          ]),
        ),
      };
      const resolvedStoryboardIds = resolveStoryboardSelection(
        state.selectedEpisodeIds,
        nextCanvasDataByEpisode,
        state.selectedStoryboardIds,
      );
      const selectedStoryboardIds =
        resolvedStoryboardIds.length > 0 || state.selectedStoryboardIds.length === 0
          ? resolvedStoryboardIds
          : state.selectedStoryboardIds;
      const nextCanvas = buildSelectedEpisodesCanvas(
        state.currentProject,
        state.selectedEpisodeIds,
        nextCanvasDataByEpisode,
        selectedStoryboardIds,
        state.commandStatuses,
      );
      const currentSelection = state.selectedStoryboardIds.join(",");
      const nextSelection = nextCanvas.selectedStoryboardIds.join(",");

      return {
        currentCanvasData: nextCanvas.currentCanvasData,
        currentCanvasDataByEpisode: nextCanvasDataByEpisode,
        edges: nextCanvas.edges,
        nodes: nextCanvas.nodes,
        selectedMediaGridItem: null,
        selectedStoryboardIds:
          currentSelection === nextSelection
            ? state.selectedStoryboardIds
            : nextCanvas.selectedStoryboardIds,
      };
    }),
  syncProjectImages: (images) =>
    set((state) => {
      if (!state.currentCanvasData) return {};

      const imageById = new Map(images.map((image) => [image.id, image]));
      const nextCanvasDataByEpisode = Object.fromEntries(
        Object.entries(state.currentCanvasDataByEpisode).map(([episodeId, canvasData]) => [
          episodeId,
          {
            ...canvasData,
            data: {
              ...canvasData.data,
              images: canvasData.data.images.map((image) => imageById.get(image.id) ?? image),
            },
          } satisfies CurrentCanvasData,
        ]),
      );
      const nextCanvas = buildSelectedEpisodesCanvas(
        state.currentProject,
        state.selectedEpisodeIds,
        nextCanvasDataByEpisode,
        state.selectedStoryboardIds,
        state.commandStatuses,
      );
      const selectedImage = state.selectedMediaGridItem
        ? imageById.get(state.selectedMediaGridItem.item.id)
        : undefined;
      const selectedMediaGridItem =
        selectedImage && state.selectedMediaGridItem
          ? {
              ...state.selectedMediaGridItem,
              item: {
                ...state.selectedMediaGridItem.item,
                name: selectedImage.name,
                prompt: selectedImage.prompt,
                url: selectedImage.url,
              },
            }
          : state.selectedMediaGridItem;

      return {
        currentCanvasData: state.currentCanvasData?.episodeId
          ? (nextCanvasDataByEpisode[state.currentCanvasData.episodeId] ?? state.currentCanvasData)
          : state.currentCanvasData,
        currentCanvasDataByEpisode: nextCanvasDataByEpisode,
        edges: nextCanvas.edges,
        nodes: nextCanvas.nodes,
        selectedMediaGridItem,
      };
    }),
  addImageToStoryboard: (storyboardId, image) =>
    set((state) => {
      const targetEpisodeId = Object.entries(state.currentCanvasDataByEpisode).find(
        ([, canvasData]) =>
          canvasData.data.storyboards.some((storyboard) => storyboard.id === storyboardId),
      )?.[0];
      if (!targetEpisodeId) return {};

      const targetCanvasData = state.currentCanvasDataByEpisode[targetEpisodeId];
      if (!targetCanvasData) return {};

      const currentImages = targetCanvasData.data.images;
      const nextImages = currentImages.some((item) => item.id === image.id)
        ? currentImages.map((item) => (item.id === image.id ? image : item))
        : [image, ...currentImages];
      const nextStoryboards = targetCanvasData.data.storyboards.map((storyboard) => {
        if (storyboard.id !== storyboardId || storyboard.images.includes(image.id)) {
          return storyboard;
        }

        return {
          ...storyboard,
          images: [image.id, ...storyboard.images],
        };
      });
      const nextCanvasData: CurrentCanvasData = {
        ...targetCanvasData,
        data: {
          ...targetCanvasData.data,
          images: nextImages,
          storyboards: nextStoryboards,
        },
      };
      const nextCanvasDataByEpisode = {
        ...state.currentCanvasDataByEpisode,
        [targetEpisodeId]: nextCanvasData,
      };
      const nextCanvas = buildSelectedEpisodesCanvas(
        state.currentProject,
        state.selectedEpisodeIds,
        nextCanvasDataByEpisode,
        state.selectedStoryboardIds,
        state.commandStatuses,
      );

      return {
        currentCanvasData:
          state.currentCanvasData?.episodeId === targetEpisodeId
            ? nextCanvasData
            : nextCanvas.currentCanvasData,
        currentCanvasDataByEpisode: nextCanvasDataByEpisode,
        nodes: nextCanvas.nodes,
        edges: nextCanvas.edges,
        selectedMediaGridItem: null,
      };
    }),
  updateImageAsset: (image) =>
    set((state) => {
      if (!state.currentCanvasData) return {};

      const nextCanvasDataByEpisode = Object.fromEntries(
        Object.entries(state.currentCanvasDataByEpisode).map(([episodeId, canvasData]) => [
          episodeId,
          {
            ...canvasData,
            data: {
              ...canvasData.data,
              images: canvasData.data.images.map((item) => (item.id === image.id ? image : item)),
            },
          } satisfies CurrentCanvasData,
        ]),
      );
      const nextCanvas = buildSelectedEpisodesCanvas(
        state.currentProject,
        state.selectedEpisodeIds,
        nextCanvasDataByEpisode,
        state.selectedStoryboardIds,
        state.commandStatuses,
      );
      const currentCanvasData = state.currentCanvasData?.episodeId
        ? (nextCanvasDataByEpisode[state.currentCanvasData.episodeId] ?? state.currentCanvasData)
        : state.currentCanvasData;

      return {
        currentCanvasData,
        currentCanvasDataByEpisode: nextCanvasDataByEpisode,
        nodes: nextCanvas.nodes,
        edges: nextCanvas.edges,
        projectImageRevision: state.projectImageRevision + 1,
        selectedMediaGridItem:
          state.selectedMediaGridItem?.item.id === image.id
            ? {
                ...state.selectedMediaGridItem,
                item: {
                  ...state.selectedMediaGridItem.item,
                  name: image.name,
                  prompt: image.prompt,
                  url: image.url,
                },
              }
            : state.selectedMediaGridItem,
      };
    }),
  addVideoToStoryboard: (storyboardId, video) =>
    set((state) => {
      const targetEpisodeId = Object.entries(state.currentCanvasDataByEpisode).find(
        ([, canvasData]) =>
          canvasData.data.storyboards.some((storyboard) => storyboard.id === storyboardId),
      )?.[0];
      if (!targetEpisodeId) return {};

      const targetCanvasData = state.currentCanvasDataByEpisode[targetEpisodeId];
      if (!targetCanvasData) return {};

      const currentVideos = targetCanvasData.data.videos;
      const nextVideos = currentVideos.some((item) => item.id === video.id)
        ? currentVideos.map((item) => (item.id === video.id ? video : item))
        : [video, ...currentVideos];
      const nextStoryboards = targetCanvasData.data.storyboards.map((storyboard) => {
        if (storyboard.id !== storyboardId || storyboard.videos.includes(video.id)) {
          return storyboard;
        }

        return {
          ...storyboard,
          videos: [video.id, ...storyboard.videos],
        };
      });
      const nextCanvasData: CurrentCanvasData = {
        ...targetCanvasData,
        data: {
          ...targetCanvasData.data,
          videos: nextVideos,
          storyboards: nextStoryboards,
        },
      };
      const nextCanvasDataByEpisode = {
        ...state.currentCanvasDataByEpisode,
        [targetEpisodeId]: nextCanvasData,
      };
      const nextCanvas = buildSelectedEpisodesCanvas(
        state.currentProject,
        state.selectedEpisodeIds,
        nextCanvasDataByEpisode,
        state.selectedStoryboardIds,
        state.commandStatuses,
      );

      return {
        currentCanvasData:
          state.currentCanvasData?.episodeId === targetEpisodeId
            ? nextCanvasData
            : nextCanvas.currentCanvasData,
        currentCanvasDataByEpisode: nextCanvasDataByEpisode,
        nodes: nextCanvas.nodes,
        edges: nextCanvas.edges,
        selectedMediaGridItem: null,
      };
    }),
  updateVideoAsset: (video) =>
    set((state) => {
      if (!state.currentCanvasData) return {};

      const nextCanvasDataByEpisode = Object.fromEntries(
        Object.entries(state.currentCanvasDataByEpisode).map(([episodeId, canvasData]) => [
          episodeId,
          {
            ...canvasData,
            data: {
              ...canvasData.data,
              videos: canvasData.data.videos.map((item) => (item.id === video.id ? video : item)),
            },
          } satisfies CurrentCanvasData,
        ]),
      );
      const nextCanvas = buildSelectedEpisodesCanvas(
        state.currentProject,
        state.selectedEpisodeIds,
        nextCanvasDataByEpisode,
        state.selectedStoryboardIds,
        state.commandStatuses,
      );
      const currentCanvasData = state.currentCanvasData?.episodeId
        ? (nextCanvasDataByEpisode[state.currentCanvasData.episodeId] ?? state.currentCanvasData)
        : state.currentCanvasData;

      return {
        currentCanvasData,
        currentCanvasDataByEpisode: nextCanvasDataByEpisode,
        nodes: nextCanvas.nodes,
        edges: nextCanvas.edges,
        selectedMediaGridItem:
          state.selectedMediaGridItem?.item.id === video.id
            ? {
                ...state.selectedMediaGridItem,
                item: {
                  ...state.selectedMediaGridItem.item,
                  cover: video.cover,
                  coverUrl: video.coverUrl,
                  poster: video.poster,
                  status: video.status,
                  url: video.url,
                },
              }
            : state.selectedMediaGridItem,
      };
    }),
  removeMediaFromStoryboard: (storyboardId, mediaId, mediaType) =>
    set((state) => {
      const targetEpisodeId = Object.entries(state.currentCanvasDataByEpisode).find(
        ([, canvasData]) =>
          canvasData.data.storyboards.some((storyboard) => storyboard.id === storyboardId),
      )?.[0];
      if (!targetEpisodeId) return {};

      const targetCanvasData = state.currentCanvasDataByEpisode[targetEpisodeId];
      if (!targetCanvasData) return {};
      const nextCanvasData: CurrentCanvasData = {
        ...targetCanvasData,
        data: {
          ...targetCanvasData.data,
          images:
            mediaType === "image"
              ? targetCanvasData.data.images.filter((image) => image.id !== mediaId)
              : targetCanvasData.data.images,
          videos:
            mediaType === "video"
              ? targetCanvasData.data.videos.filter((video) => video.id !== mediaId)
              : targetCanvasData.data.videos,
          storyboards: targetCanvasData.data.storyboards.map((storyboard) => {
            if (storyboard.id !== storyboardId) return storyboard;

            return {
              ...storyboard,
              images:
                mediaType === "image"
                  ? storyboard.images.filter((imageId) => imageId !== mediaId)
                  : storyboard.images,
              selectedVideo:
                mediaType === "video" && storyboard.selectedVideo === mediaId
                  ? ""
                  : storyboard.selectedVideo,
              videos:
                mediaType === "video"
                  ? storyboard.videos.filter((videoId) => videoId !== mediaId)
                  : storyboard.videos,
            };
          }),
        },
      };
      const nextCanvasDataByEpisode = {
        ...state.currentCanvasDataByEpisode,
        [targetEpisodeId]: nextCanvasData,
      };
      const nextCanvas = buildSelectedEpisodesCanvas(
        state.currentProject,
        state.selectedEpisodeIds,
        nextCanvasDataByEpisode,
        state.selectedStoryboardIds,
        state.commandStatuses,
      );

      return {
        currentCanvasData:
          state.currentCanvasData?.episodeId === targetEpisodeId
            ? nextCanvasData
            : nextCanvas.currentCanvasData,
        currentCanvasDataByEpisode: nextCanvasDataByEpisode,
        nodes: nextCanvas.nodes,
        edges: nextCanvas.edges,
        selectedMediaGridItem:
          state.selectedMediaGridItem?.item.id === mediaId ? null : state.selectedMediaGridItem,
      };
    }),
  setStoryboardSelectedVideo: (storyboardId, videoId) =>
    set((state) => {
      const targetEpisodeId = Object.entries(state.currentCanvasDataByEpisode).find(
        ([, canvasData]) =>
          canvasData.data.storyboards.some((storyboard) => storyboard.id === storyboardId),
      )?.[0];
      if (!targetEpisodeId) return {};

      const targetCanvasData = state.currentCanvasDataByEpisode[targetEpisodeId];
      if (!targetCanvasData) return {};

      const nextTargetCanvasData: CurrentCanvasData = {
        ...targetCanvasData,
        data: {
          ...targetCanvasData.data,
          storyboards: targetCanvasData.data.storyboards.map((storyboard) =>
            storyboard.id === storyboardId
              ? {
                  ...storyboard,
                  selectedVideo: videoId,
                }
              : storyboard,
          ),
        },
      };
      const nextCanvasDataByEpisode = {
        ...state.currentCanvasDataByEpisode,
        [targetEpisodeId]: nextTargetCanvasData,
      };
      const nextCanvas = buildSelectedEpisodesCanvas(
        state.currentProject,
        state.selectedEpisodeIds,
        nextCanvasDataByEpisode,
        state.selectedStoryboardIds,
        state.commandStatuses,
      );

      return {
        currentCanvasData: nextCanvas.currentCanvasData,
        currentCanvasDataByEpisode: nextCanvasDataByEpisode,
        nodes: nextCanvas.nodes,
        edges: nextCanvas.edges,
      };
    }),
  clearStoryboardSelectedVideo: (storyboardId, videoId) =>
    set((state) => {
      const targetEpisodeId = Object.entries(state.currentCanvasDataByEpisode).find(
        ([, canvasData]) =>
          canvasData.data.storyboards.some((storyboard) => storyboard.id === storyboardId),
      )?.[0];
      if (!targetEpisodeId) return {};

      const targetCanvasData = state.currentCanvasDataByEpisode[targetEpisodeId];
      if (!targetCanvasData) return {};

      const nextTargetCanvasData: CurrentCanvasData = {
        ...targetCanvasData,
        data: {
          ...targetCanvasData.data,
          storyboards: targetCanvasData.data.storyboards.map((storyboard) =>
            storyboard.id === storyboardId && storyboard.selectedVideo === videoId
              ? {
                  ...storyboard,
                  selectedVideo: "",
                }
              : storyboard,
          ),
        },
      };
      const nextCanvasDataByEpisode = {
        ...state.currentCanvasDataByEpisode,
        [targetEpisodeId]: nextTargetCanvasData,
      };
      const nextCanvas = buildSelectedEpisodesCanvas(
        state.currentProject,
        state.selectedEpisodeIds,
        nextCanvasDataByEpisode,
        state.selectedStoryboardIds,
        state.commandStatuses,
      );

      return {
        currentCanvasData: nextCanvas.currentCanvasData,
        currentCanvasDataByEpisode: nextCanvasDataByEpisode,
        nodes: nextCanvas.nodes,
        edges: nextCanvas.edges,
      };
    }),
  toggleStoryboardSelection: (storyboardId) =>
    set((state) => {
      const targetEpisodeId =
        Object.entries(state.currentCanvasDataByEpisode).find(([, canvasData]) =>
          canvasData.data.storyboards.some((storyboard) => storyboard.id === storyboardId),
        )?.[0] ?? "";
      const targetStoryboardIds = new Set(
        targetEpisodeId
          ? (state.currentCanvasDataByEpisode[targetEpisodeId]?.data.storyboards.map(
              (storyboard) => storyboard.id,
            ) ?? [])
          : [],
      );
      const toCanvasState = (selectedStoryboardIds: string[]) => {
        if (!state.currentCanvasData) return { selectedStoryboardIds };

        const nextCanvas = buildSelectedEpisodesCanvas(
          state.currentProject,
          state.selectedEpisodeIds,
          state.currentCanvasDataByEpisode,
          selectedStoryboardIds,
          state.commandStatuses,
        );

        return {
          nodes: nextCanvas.nodes,
          edges: nextCanvas.edges,
          selectedStoryboardIds: nextCanvas.selectedStoryboardIds,
        };
      };

      if (state.selectedStoryboardIds.includes(storyboardId)) {
        const nextSelectedIds = state.selectedStoryboardIds.filter((id) => id !== storyboardId);

        return {
          ...toCanvasState(nextSelectedIds),
          activeEpisodeId: targetEpisodeId || state.activeEpisodeId,
          activeStoryboardId: storyboardId,
          selectedMediaGridItem: null,
        };
      }

      const nextTargetSelectedIds = [
        ...state.selectedStoryboardIds.filter((id) => targetStoryboardIds.has(id)),
        storyboardId,
      ].slice(-SELECTED_STORYBOARD_LIMIT);
      const nextSelectedIds = [
        ...state.selectedStoryboardIds.filter((id) => !targetStoryboardIds.has(id)),
        ...nextTargetSelectedIds,
      ];

      return {
        ...toCanvasState(nextSelectedIds),
        activeEpisodeId: targetEpisodeId || state.activeEpisodeId,
        activeStoryboardId: storyboardId,
        selectedMediaGridItem: null,
      };
    }),
  addStoryboard: (episodeId, afterStoryboardId) => {
    let createdStoryboardId: string | undefined;
    set((state) => {
      const episodeCanvasData = state.currentCanvasDataByEpisode[episodeId];
      if (!episodeCanvasData) return {};

      createdStoryboardId = createUuid();
      const nextStoryboard: ProjectStoryboard = {
        id: createdStoryboardId,
        name: "",
        description: "",
        prompt: "",
        videoPrompt: "",
        images: [],
        videos: [],
        selectedVideo: "",
      };
      const insertIndex = afterStoryboardId
        ? episodeCanvasData.data.storyboards.findIndex(
            (storyboard) => storyboard.id === afterStoryboardId,
          )
        : -1;
      const nextStoryboards = [...episodeCanvasData.data.storyboards];

      nextStoryboards.splice(
        insertIndex >= 0 ? insertIndex + 1 : nextStoryboards.length,
        0,
        nextStoryboard,
      );

      const nextCanvasData: CurrentCanvasData = {
        ...episodeCanvasData,
        data: {
          ...episodeCanvasData.data,
          storyboards: nextStoryboards,
        },
      };
      const nextCanvasDataByEpisode = {
        ...state.currentCanvasDataByEpisode,
        [episodeId]: nextCanvasData,
      };
      const nextCanvas = buildSelectedEpisodesCanvas(
        state.currentProject,
        state.selectedEpisodeIds,
        nextCanvasDataByEpisode,
        state.selectedStoryboardIds,
        state.commandStatuses,
      );

      return {
        currentCanvasData: nextCanvas.currentCanvasData,
        currentCanvasDataByEpisode: nextCanvasDataByEpisode,
        selectedMediaGridItem: null,
        nodes: nextCanvas.nodes,
        edges: nextCanvas.edges,
        selectedStoryboardIds: nextCanvas.selectedStoryboardIds,
      };
    });
    return createdStoryboardId;
  },
  updateStoryboard: (storyboardId, updates) =>
    set((state) => {
      const targetEpisodeId = findEpisodeIdByStoryboard(
        state.currentCanvasDataByEpisode,
        storyboardId,
      );
      if (!targetEpisodeId) return {};

      const targetCanvasData = state.currentCanvasDataByEpisode[targetEpisodeId];
      if (!targetCanvasData) return {};

      const nextStoryboards = targetCanvasData.data.storyboards.map((storyboard) =>
        storyboard.id === storyboardId
          ? {
              ...storyboard,
              ...updates,
            }
          : storyboard,
      );
      const nextCanvasData: CurrentCanvasData = {
        ...targetCanvasData,
        data: {
          ...targetCanvasData.data,
          storyboards: nextStoryboards,
        },
      };
      const nextCanvasDataByEpisode = {
        ...state.currentCanvasDataByEpisode,
        [targetEpisodeId]: nextCanvasData,
      };
      const nextCanvas = buildSelectedEpisodesCanvas(
        state.currentProject,
        state.selectedEpisodeIds,
        nextCanvasDataByEpisode,
        state.selectedStoryboardIds,
        state.commandStatuses,
      );

      return {
        currentCanvasData:
          state.currentCanvasData?.episodeId === targetEpisodeId
            ? nextCanvasData
            : nextCanvas.currentCanvasData,
        currentCanvasDataByEpisode: nextCanvasDataByEpisode,
        edges: nextCanvas.edges,
        nodes: nextCanvas.nodes,
        selectedMediaGridItem: null,
      };
    }),
  deleteStoryboard: (storyboardId) =>
    set((state) => {
      const targetEpisodeId = findEpisodeIdByStoryboard(
        state.currentCanvasDataByEpisode,
        storyboardId,
      );
      if (!targetEpisodeId) return {};

      const targetCanvasData = state.currentCanvasDataByEpisode[targetEpisodeId];
      if (!targetCanvasData) return {};

      const nextStoryboards = targetCanvasData.data.storyboards.filter(
        (storyboard) => storyboard.id !== storyboardId,
      );
      if (nextStoryboards.length === targetCanvasData.data.storyboards.length) return {};

      const nextCanvasData: CurrentCanvasData = {
        ...targetCanvasData,
        data: {
          ...targetCanvasData.data,
          storyboards: nextStoryboards,
        },
      };
      const nextCanvasDataByEpisode = {
        ...state.currentCanvasDataByEpisode,
        [targetEpisodeId]: nextCanvasData,
      };
      const nextSelectedStoryboardIds = state.selectedStoryboardIds.filter(
        (id) => id !== storyboardId,
      );
      const nextCanvas = buildSelectedEpisodesCanvas(
        state.currentProject,
        state.selectedEpisodeIds,
        nextCanvasDataByEpisode,
        nextSelectedStoryboardIds,
        state.commandStatuses,
      );

      return {
        currentCanvasData:
          state.currentCanvasData?.episodeId === targetEpisodeId
            ? nextCanvasData
            : nextCanvas.currentCanvasData,
        currentCanvasDataByEpisode: nextCanvasDataByEpisode,
        selectedMediaGridItem: null,
        nodes: nextCanvas.nodes,
        edges: nextCanvas.edges,
        selectedStoryboardIds: nextCanvas.selectedStoryboardIds,
      };
    }),
  moveStoryboard: (storyboardId, direction) =>
    set((state) => {
      const targetEpisodeId = findEpisodeIdByStoryboard(
        state.currentCanvasDataByEpisode,
        storyboardId,
      );
      if (!targetEpisodeId) return {};

      const targetCanvasData = state.currentCanvasDataByEpisode[targetEpisodeId];
      if (!targetCanvasData) return {};

      const currentIndex = targetCanvasData.data.storyboards.findIndex(
        (storyboard) => storyboard.id === storyboardId,
      );
      const nextIndex = currentIndex + direction;
      if (
        currentIndex < 0 ||
        nextIndex < 0 ||
        nextIndex >= targetCanvasData.data.storyboards.length
      ) {
        return {};
      }

      const nextStoryboards = [...targetCanvasData.data.storyboards];
      const [movedStoryboard] = nextStoryboards.splice(currentIndex, 1);
      if (!movedStoryboard) return {};

      nextStoryboards.splice(nextIndex, 0, movedStoryboard);

      const nextCanvasData: CurrentCanvasData = {
        ...targetCanvasData,
        data: {
          ...targetCanvasData.data,
          storyboards: nextStoryboards,
        },
      };
      const nextCanvasDataByEpisode = {
        ...state.currentCanvasDataByEpisode,
        [targetEpisodeId]: nextCanvasData,
      };
      const nextCanvas = buildSelectedEpisodesCanvas(
        state.currentProject,
        state.selectedEpisodeIds,
        nextCanvasDataByEpisode,
        state.selectedStoryboardIds,
        state.commandStatuses,
      );

      return {
        currentCanvasData:
          state.currentCanvasData?.episodeId === targetEpisodeId
            ? nextCanvasData
            : nextCanvas.currentCanvasData,
        currentCanvasDataByEpisode: nextCanvasDataByEpisode,
        selectedMediaGridItem: null,
        nodes: nextCanvas.nodes,
        edges: nextCanvas.edges,
        selectedStoryboardIds: nextCanvas.selectedStoryboardIds,
      };
    }),
  addNode: (label) =>
    set((state) => {
      const nextIndex = state.nodes.length + 1;

      return {
        nodes: [
          ...state.nodes,
          {
            id: `node-${nextIndex}`,
            position: {
              x: 120 + (nextIndex % 3) * 220,
              y: 220 + Math.floor(nextIndex / 3) * 120,
            },
            data: { label },
            type: "default",
          },
        ],
      };
    }),
  onConnect: (connection) =>
    set((state) => ({
      edges: addEdge(
        {
          ...connection,
          id: `edge-${connection.source}-${connection.target}`,
          animated: true,
        },
        state.edges,
      ),
    })),
  onEdgesChange: (changes) =>
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    })),
  onNodesChange: (changes) =>
    set((state) => {
      const nextNodes = applyNodeChanges(changes, state.nodes);
      const nextCanvasDataByEpisode = updateFlowFromCanvasNodes(
        state.currentCanvasDataByEpisode,
        nextNodes,
      );
      const currentCanvasData = state.currentCanvasData?.episodeId
        ? (nextCanvasDataByEpisode[state.currentCanvasData.episodeId] ?? state.currentCanvasData)
        : state.currentCanvasData;
      const selectedListNode = nextNodes.find(
        (node) => node.type === "storyboard-list-node" && node.selected,
      );
      const selectedListEpisodeId =
        typeof selectedListNode?.data.episodeId === "string" ? selectedListNode.data.episodeId : "";

      return {
        activeEpisodeId: selectedListEpisodeId || state.activeEpisodeId,
        currentCanvasData,
        currentCanvasDataByEpisode: nextCanvasDataByEpisode,
        nodes: nextNodes,
      };
    }),
  reset: () => set({ ...buildInitialState(), selectedMediaGridItem: null }),
}));
