"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, ImageIcon, Info, ListTree, Loader2, Plus, Search, Trash2 } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { AssetCreateDialog } from "@/components/assets/asset-create-dialog";
import {
  ChatWindow,
  type ChatWindowModelOption,
  type ChatWindowReferenceImage,
} from "@/components/canvas/chat-window";
import { MediaPreviewDialog } from "@/components/canvas/media-preview-dialog";
import { MediaPreviewPopover } from "@/components/canvas/media-preview-popover";
import { useSilentAgentCommand } from "@/components/canvas/use-silent-agent-command";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchConfigCached, subscribeConfigCache } from "@/lib/client-data-cache";
import { DEFAULT_WORKFLOW_SKILLS, type AppConfig } from "@/lib/config-schema";
import { getSafeMediaSource } from "@/lib/media-src";
import {
  deleteProjectImage,
  fetchProject,
  fetchProjectImages,
  saveProjectSelectedModel,
} from "@/lib/project-api";
import { ASSET_PARSE_USER_PROMPT } from "@/lib/chat-prompts";
import type { ProjectAssets, ProjectImageAsset } from "@/lib/project-types";
import type { ProjectDetail } from "@/lib/project-types";
import { cn } from "@/lib/utils";
import { useCanvasStore, type MediaItem } from "@/store/use-canvas-store";
import { useLayoutStore } from "@/store/use-layout-store";

import { AssetDetailCard } from "./components/asset-detail-card";

type AssetTabKey = "all" | "character" | "scene" | "prop" | "voice" | "video";
type AssetCategoryKey = Exclude<AssetTabKey, "all">;
type ConfirmAction = "parse" | null;
type ProjectAssetCategory = keyof ProjectAssets;
type AssetDetailPosition = {
  left: number;
  top: number;
};
type AssetPreviewAnchor = {
  assetId: string;
  rect: DOMRect;
};

const ASSET_TAB_CATEGORY: Record<AssetCategoryKey, ProjectAssetCategory> = {
  character: "characters",
  scene: "scenes",
  prop: "props",
  voice: "voices",
  video: "videos",
};

const ASSET_DETAIL_CARD_WIDTH = 356;
const ASSET_DETAIL_GAP = 10;
const ASSET_DETAIL_VIEWPORT_MARGIN = 12;
const ASSET_DETAIL_CLOSE_SELECTOR =
  "[data-asset-detail-card], [data-asset-detail-trigger], [data-asset-chat-window], [data-slot='select-content']";
const EMPTY_CONFIG: AppConfig = {
  imageBeds: [],
  imageModels: [],
  videoModels: [],
  workflowSkills: DEFAULT_WORKFLOW_SKILLS,
};

function getAssetChildIds(projectAssets: ProjectAssets | undefined, assetId: string) {
  if (!projectAssets) return [];

  const assetGroups = Object.values(projectAssets);
  const matchedAsset = assetGroups.flat().find((assetItem) => assetItem.id === assetId);
  return matchedAsset?.children ?? [];
}

function getProjectAssetIds(projectAssets: ProjectAssets | undefined, activeTab: AssetTabKey) {
  if (!projectAssets) return [];

  const assetGroups =
    activeTab === "all"
      ? Object.values(projectAssets)
      : [projectAssets[ASSET_TAB_CATEGORY[activeTab]]];

  const seenAssetIds = new Set<string>();
  return assetGroups
    .flatMap((assetGroup) => assetGroup.map((asset) => asset.id))
    .filter((assetId) => {
      if (seenAssetIds.has(assetId)) return false;

      seenAssetIds.add(assetId);
      return true;
    });
}

function getProjectSyncSignature(project: ProjectDetail) {
  return JSON.stringify({
    assets: project.assets,
    assetsParsed: project.assetsParsed,
    description: project.description,
    episodes: project.episodes,
    id: project.id,
    name: project.name,
  });
}

function toMediaItem(asset: ProjectImageAsset, status: string | undefined): MediaItem {
  return {
    assetType: asset.type,
    cover: "",
    coverUrl: "",
    id: asset.id,
    name: asset.name,
    poster: "",
    prompt: asset.prompt,
    status: status ?? (asset.url ? "success" : "pending"),
    type: "image",
    url: asset.url,
  };
}

function getAssetMentionCategoryLabel(t: ReturnType<typeof useTranslations>, categoryKey: string) {
  if (categoryKey === "characters") return t("assetTabs.character");
  if (categoryKey === "scenes") return t("assetTabs.scene");
  if (categoryKey === "props") return t("assetTabs.prop");
  if (categoryKey === "voices") return t("assetTabs.voice");
  if (categoryKey === "videos") return t("assetTabs.video");
  return t("assetTabs.all");
}

export function AssetsPanel() {
  const t = useTranslations("Sidebar");
  const tCanvas = useTranslations("Canvas");
  const { execute: executeSilentAgentCommand, stop: stopSilentAgentCommand } =
    useSilentAgentCommand();
  const currentProject = useCanvasStore((state) => state.currentProject);
  const projectImageRevision = useCanvasStore((state) => state.projectImageRevision);
  const currentProjectRef = useRef<ProjectDetail | null>(currentProject);
  const assetTileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const setCurrentProject = useCanvasStore((state) => state.setCurrentProject);
  const syncProjectImages = useCanvasStore((state) => state.syncProjectImages);
  const commandStatuses = useCanvasStore((state) => state.commandStatuses);
  const assetLoadingAction = useLayoutStore((state) => state.assetLoadingAction);
  const assetCommandLoading = useLayoutStore((state) => state.sidebarLoading.assets > 0);
  const setAssetLoadingAction = useLayoutStore((state) => state.setAssetLoadingAction);
  const [activeTab, setActiveTab] = useState<AssetTabKey>("all");
  const [searchValue, setSearchValue] = useState("");
  const [config, setConfig] = useState<AppConfig>(EMPTY_CONFIG);
  const [projectImages, setProjectImages] = useState<ProjectImageAsset[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(() => new Set());
  const [deletingAsset, setDeletingAsset] = useState<ProjectImageAsset | null>(null);
  const [deletingImage, setDeletingImage] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [assetDetailPosition, setAssetDetailPosition] = useState<AssetDetailPosition | null>(null);
  const [selectedChatAssetId, setSelectedChatAssetId] = useState<string | null>(null);
  const [assetChatPosition, setAssetChatPosition] = useState<{ left: number; top: number } | null>(
    null,
  );
  const [hoveredAssetPreview, setHoveredAssetPreview] = useState<AssetPreviewAnchor | null>(null);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [selectedImageModelId, setSelectedImageModelId] = useState("");
  const tabs: { key: AssetTabKey; label: string }[] = [
    { key: "all", label: t("assetTabs.all") },
    { key: "character", label: t("assetTabs.character") },
    { key: "scene", label: t("assetTabs.scene") },
    { key: "prop", label: t("assetTabs.prop") },
    { key: "voice", label: t("assetTabs.voice") },
    { key: "video", label: t("assetTabs.video") },
  ];

  useEffect(() => {
    currentProjectRef.current = currentProject;
  }, [currentProject]);

  const setAssetTileRef = useCallback(
    (assetId: string) => (node: HTMLDivElement | null) => {
      if (node) {
        assetTileRefs.current.set(assetId, node);
        return;
      }

      assetTileRefs.current.delete(assetId);
    },
    [],
  );

  const updateAssetDetailPosition = useCallback((assetId: string | null) => {
    if (!assetId) {
      setAssetDetailPosition(null);
      return;
    }

    const anchorElement = assetTileRefs.current.get(assetId);
    if (!anchorElement) {
      setAssetDetailPosition(null);
      return;
    }

    const anchorRect = anchorElement.getBoundingClientRect();
    const rightSideLeft = anchorRect.right + ASSET_DETAIL_GAP;
    const leftSideLeft = anchorRect.left - ASSET_DETAIL_CARD_WIDTH - ASSET_DETAIL_GAP;
    const hasRightSpace =
      rightSideLeft + ASSET_DETAIL_CARD_WIDTH + ASSET_DETAIL_VIEWPORT_MARGIN <= window.innerWidth;
    const hasLeftSpace = leftSideLeft >= ASSET_DETAIL_VIEWPORT_MARGIN;
    const left = hasRightSpace
      ? rightSideLeft
      : hasLeftSpace
        ? leftSideLeft
        : Math.max(
            ASSET_DETAIL_VIEWPORT_MARGIN,
            window.innerWidth - ASSET_DETAIL_CARD_WIDTH - ASSET_DETAIL_VIEWPORT_MARGIN,
          );

    setAssetDetailPosition({
      left,
      top: Math.max(80, anchorRect.top),
    });
  }, []);

  const syncAssetData = useCallback(
    async (projectId: string, showLoading: boolean) => {
      if (showLoading) setLoadingImages(true);

      try {
        // Skills are expected to write project.json.assets directly; loading images first only
        // triggers the server-side normalization fallback when a skill leaves assets incomplete.
        const nextProjectImages = await fetchProjectImages(projectId);
        const project = await fetchProject(projectId);

        if (
          project &&
          (!currentProjectRef.current ||
            getProjectSyncSignature(currentProjectRef.current) !== getProjectSyncSignature(project))
        ) {
          currentProjectRef.current = project;
          setCurrentProject(project);
        }
        if (nextProjectImages) {
          setProjectImages(nextProjectImages);
          syncProjectImages(nextProjectImages);
          setFailedImageIds(new Set());
        }
      } catch {
        if (showLoading) {
          setProjectImages([]);
          setFailedImageIds(new Set());
        }
      } finally {
        if (showLoading) setLoadingImages(false);
      }
    },
    [setCurrentProject, syncProjectImages],
  );

  useEffect(() => {
    let ignoreResult = false;

    async function loadProjectImages(projectId: string | null) {
      if (!projectId) {
        setProjectImages([]);
        setFailedImageIds(new Set());
        return;
      }

      if (!ignoreResult) await syncAssetData(projectId, true);
    }

    void loadProjectImages(currentProject?.id ?? null);

    return () => {
      ignoreResult = true;
    };
  }, [currentProject?.id, projectImageRevision, syncAssetData]);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeConfigCache((nextConfig) => {
      if (active) setConfig(nextConfig);
    });

    async function loadConfig() {
      try {
        const payload = await fetchConfigCached();
        if (active && payload) setConfig(payload);
      } catch {
        // Keep the asset chat available even if settings are temporarily unavailable.
      }
    }

    void loadConfig();

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const visibleAssets = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();
    const imageById = new Map(projectImages.map((asset) => [asset.id, asset]));
    const assetIds = getProjectAssetIds(currentProject?.assets, activeTab);

    return assetIds
      .map((assetId) => imageById.get(assetId))
      .filter((asset): asset is ProjectImageAsset => Boolean(asset))
      .filter((asset) =>
        normalizedSearch
          ? `${asset.id} ${asset.name} ${asset.type} ${asset.prompt} ${asset.source}`
              .toLowerCase()
              .includes(normalizedSearch)
          : true,
      );
  }, [activeTab, currentProject?.assets, projectImages, searchValue]);
  const visibleMediaItems = useMemo(
    () => visibleAssets.map((asset) => toMediaItem(asset, commandStatuses[asset.id])),
    [commandStatuses, visibleAssets],
  );
  const selectedAsset = useMemo(
    () => visibleAssets.find((asset) => asset.id === selectedAssetId) ?? null,
    [selectedAssetId, visibleAssets],
  );
  const selectedChatAsset = useMemo(
    () => visibleAssets.find((asset) => asset.id === selectedChatAssetId) ?? null,
    [selectedChatAssetId, visibleAssets],
  );
  const imageModelOptions = useMemo<ChatWindowModelOption[]>(
    () =>
      config.imageModels.map((model) => ({
        id: model.id,
        name: model.name,
        providerId: model.providerId,
      })),
    [config.imageModels],
  );
  const selectedModelId = imageModelOptions.some((model) => model.id === selectedImageModelId)
    ? selectedImageModelId
    : (imageModelOptions[0]?.id ?? "");
  const selectedImageModel = config.imageModels.find((model) => model.id === selectedModelId);
  const selectedChatCommandStatus = selectedChatAsset
    ? commandStatuses[selectedChatAsset.id]
    : undefined;
  const selectedChatMentionImages = useMemo<ChatWindowReferenceImage[]>(() => {
    if (!selectedChatAsset) return [];

    return projectImages
      .filter((asset) => asset.type === selectedChatAsset.type)
      .map((asset, index) => {
        const fallbackLabel = tCanvas("chatWindow.imageFallback", { index: index + 1 });
        const label = asset.name.trim() || fallbackLabel;

        return {
          categoryKey: asset.type,
          categoryLabel: getAssetMentionCategoryLabel(t, asset.type),
          id: asset.id,
          label,
          name: label,
          url: asset.url,
        };
      });
  }, [projectImages, selectedChatAsset, t, tCanvas]);
  const selectedAssetChildren = useMemo(() => {
    if (!selectedAsset) return [];

    const childIds = new Set(getAssetChildIds(currentProject?.assets, selectedAsset.id));
    return projectImages.filter((asset) => childIds.has(asset.id));
  }, [currentProject?.assets, projectImages, selectedAsset]);
  const assetsParsed = currentProject?.assetsParsed ?? false;

  useEffect(() => {
    if (!selectedAssetId) return;

    const handleAssetDetailReposition = () => updateAssetDetailPosition(selectedAssetId);
    const frameId = requestAnimationFrame(handleAssetDetailReposition);

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) {
        setSelectedAssetId(null);
        setAssetDetailPosition(null);
        return;
      }

      if (!target.closest(ASSET_DETAIL_CLOSE_SELECTOR)) {
        setSelectedAssetId(null);
        setAssetDetailPosition(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", handleAssetDetailReposition);
    window.addEventListener("scroll", handleAssetDetailReposition, true);

    return () => {
      cancelAnimationFrame(frameId);
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", handleAssetDetailReposition);
      window.removeEventListener("scroll", handleAssetDetailReposition, true);
    };
  }, [selectedAssetId, updateAssetDetailPosition]);

  useEffect(() => {
    if (!selectedChatAssetId) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) {
        setSelectedChatAssetId(null);
        setAssetChatPosition(null);
        return;
      }

      const isSelectedAssetTile = Boolean(
        target.closest(`[data-asset-chat-trigger="${selectedChatAssetId}"]`),
      );
      const isChatWindow = Boolean(target.closest("[data-asset-chat-window]"));
      const isSelectContent = Boolean(target.closest("[data-slot='select-content']"));

      if (isSelectedAssetTile || isChatWindow || isSelectContent) return;
      setSelectedChatAssetId(null);
      setAssetChatPosition(null);
    }

    document.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [selectedChatAssetId]);

  const handleDeleteAsset = async () => {
    if (!currentProject || !deletingAsset) return;

    setDeletingImage(true);
    try {
      const nextProjectImages = await deleteProjectImage(currentProject.id, deletingAsset.id);
      setProjectImages(nextProjectImages);
      setFailedImageIds((currentFailedIds) => {
        const nextFailedIds = new Set(currentFailedIds);
        nextFailedIds.delete(deletingAsset.id);
        return nextFailedIds;
      });
      if (selectedAssetId === deletingAsset.id) {
        setSelectedAssetId(null);
        setAssetDetailPosition(null);
      }
      if (selectedChatAssetId === deletingAsset.id) {
        setSelectedChatAssetId(null);
        setAssetChatPosition(null);
      }
      setDeletingAsset(null);
    } catch {
      setDeletingAsset(null);
    } finally {
      setDeletingImage(false);
    }
  };
  const handleImageError = (assetId: string) => {
    setFailedImageIds((currentFailedIds) => new Set(currentFailedIds).add(assetId));
  };
  const executeAssetPanelAction = async () => {
    if (!currentProject) return;

    setAssetLoadingAction("parse");

    await executeSilentAgentCommand(
      {
        attachments: [],
        html: "",
        text: ASSET_PARSE_USER_PROMPT,
      },
      {
        featureSkill: "asset-parse",
        scope: "asset-grid",
      },
    );

    await syncAssetData(currentProject.id, false);
  };
  const openAssetChat = (assetId: string, anchorElement: HTMLElement) => {
    const anchorRect = anchorElement.getBoundingClientRect();

    setSelectedAssetId(null);
    setAssetDetailPosition(null);
    setSelectedChatAssetId(assetId);
    setAssetChatPosition({
      left: anchorRect.right + 12,
      top: Math.max(120, anchorRect.top + anchorRect.height / 2),
    });
  };
  const confirmActionTitleKey = confirmAction
    ? `assetPanel.actions.${confirmAction}.title`
    : "assetPanel.actions.parse.title";
  const confirmActionDescriptionKey = confirmAction
    ? `assetPanel.actions.${confirmAction}.description`
    : "assetPanel.actions.parse.description";
  const confirmActionButtonKey = confirmAction
    ? `assetPanel.actions.${confirmAction}.confirm`
    : "assetPanel.actions.parse.confirm";

  return (
    <TooltipProvider delayDuration={200}>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as AssetTabKey)}
        className="w-120 gap-0"
      >
        <div className="border-b px-3 py-2">
          <TabsList className="grid h-auto w-full grid-cols-6 gap-1 p-1">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className="h-7 justify-center px-1 text-center text-xs transition-all duration-150 data-active:scale-[1.02]"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="size-4 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder={t("assetPanel.searchPlaceholder")}
            className="h-8 min-w-0 flex-1 border-0 bg-muted/50 px-2 text-xs focus-visible:ring-1"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("assetPanel.parseAll")}
                disabled={assetCommandLoading}
                onClick={() => setConfirmAction("parse")}
                className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
              >
                {assetLoadingAction === "parse" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ListTree className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t("assetPanel.parseAll")}</TooltipContent>
          </Tooltip>
        </div>

        {tabs.map((tab) => (
          <TabsContent key={tab.key} value={tab.key} className="m-0">
            <div className="p-3">
              {!currentProject ? (
                <div className="rounded-md border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                  {t("assetPanel.noCurrentProject")}
                </div>
              ) : loadingImages ? (
                <div className="rounded-md border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                  {t("assetPanel.loading")}
                </div>
              ) : !assetsParsed ? (
                <div className="flex h-98 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border px-3 text-center">
                  {assetCommandLoading ? (
                    <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-5 animate-spin text-primary" />
                      <span>{t("assetPanel.parsing")}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("assetPanel.notParsed")}</p>
                  )}
                  {!assetCommandLoading ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2 border-dashed"
                      onClick={() => setConfirmAction("parse")}
                    >
                      <ListTree className="size-4" />
                      {t("assetPanel.parseAll")}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <ScrollArea className="h-98 pr-2">
                  <div className="grid grid-cols-5 gap-2">
                    {/* The add tile stays first so asset creation is reachable in every tab. */}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateDialogOpen(true)}
                      className="flex aspect-square h-auto flex-col gap-1 border-dashed text-muted-foreground"
                    >
                      <Plus className="size-4" />
                      <span className="text-xs">{t("assetPanel.addAsset")}</span>
                    </Button>

                    {visibleAssets.map((asset) => {
                      const commandStatus = commandStatuses[asset.id];
                      const commandStatusLabel = commandStatus
                        ? tCanvas(`mediaGrid.${commandStatus}`)
                        : "";
                      const imageSource = getSafeMediaSource(asset.url);
                      const canPreviewAsset = Boolean(imageSource && !failedImageIds.has(asset.id));
                      const isHoverPreviewVisible =
                        canPreviewAsset && hoveredAssetPreview?.assetId === asset.id;
                      const previewAbove = hoveredAssetPreview
                        ? hoveredAssetPreview.rect.top >= 220
                        : true;
                      const previewLeft =
                        hoveredAssetPreview && typeof window !== "undefined"
                          ? Math.min(
                              Math.max(
                                hoveredAssetPreview.rect.left + hoveredAssetPreview.rect.width / 2,
                                204,
                              ),
                              window.innerWidth - 204,
                            )
                          : (hoveredAssetPreview?.rect.left ?? 0) +
                            (hoveredAssetPreview?.rect.width ?? 0) / 2;
                      const previewTop = hoveredAssetPreview
                        ? previewAbove
                          ? hoveredAssetPreview.rect.top - 8
                          : hoveredAssetPreview.rect.bottom + 8
                        : 0;

                      return (
                        <div
                          key={asset.id}
                          ref={setAssetTileRef(asset.id)}
                          data-asset-chat-trigger={asset.id}
                          className="group relative cursor-pointer rounded-lg"
                          onMouseEnter={(event) =>
                            setHoveredAssetPreview({
                              assetId: asset.id,
                              rect: event.currentTarget.getBoundingClientRect(),
                            })
                          }
                          onMouseLeave={() => setHoveredAssetPreview(null)}
                          onClick={(event) => openAssetChat(asset.id, event.currentTarget)}
                        >
                          {isHoverPreviewVisible && typeof document !== "undefined"
                            ? createPortal(
                                <div
                                  className={cn(
                                    "pointer-events-none fixed z-[2147483647] -translate-x-1/2",
                                    previewAbove ? "-translate-y-full" : "",
                                  )}
                                  style={{
                                    left: previewLeft,
                                    top: previewTop,
                                  }}
                                >
                                  <MediaPreviewPopover
                                    activeId={asset.id}
                                    items={visibleMediaItems}
                                    previewLabel={tCanvas("mediaPreview.preview")}
                                  />
                                </div>,
                                document.body,
                              )
                            : null}
                          {canPreviewAsset ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  data-asset-detail-trigger
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={tCanvas("mediaGrid.preview")}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setPreviewAssetId(asset.id);
                                  }}
                                  className="absolute left-1 top-1 z-10 size-6 bg-background/90 text-primary opacity-0 shadow-sm transition-opacity hover:bg-primary/15 group-hover:opacity-100"
                                >
                                  <Eye className="size-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {tCanvas("mediaGrid.preview")}
                              </TooltipContent>
                            </Tooltip>
                          ) : null}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                data-asset-detail-trigger
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={t("assetPanel.deleteAsset")}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeletingAsset(asset);
                                }}
                                className="absolute top-1 right-1 z-10 size-6 bg-background/90 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-destructive group-hover:opacity-100"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {t("assetPanel.deleteAsset")}
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                data-asset-detail-trigger
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={t("assetPanel.detail.open")}
                                aria-pressed={selectedAssetId === asset.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedAssetId((currentAssetId) => {
                                    if (currentAssetId === asset.id) {
                                      setAssetDetailPosition(null);
                                      return null;
                                    }

                                    setSelectedChatAssetId(null);
                                    setAssetChatPosition(null);
                                    requestAnimationFrame(() =>
                                      updateAssetDetailPosition(asset.id),
                                    );
                                    return asset.id;
                                  });
                                }}
                                className="absolute bottom-8 left-1 z-10 size-6 bg-background/90 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground aria-pressed:opacity-100 aria-pressed:text-foreground group-hover:opacity-100"
                              >
                                <Info className="size-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {t("assetPanel.detail.open")}
                            </TooltipContent>
                          </Tooltip>
                          <div
                            className={cn(
                              "relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted/40 transition-colors duration-150",
                            )}
                          >
                            {canPreviewAsset && imageSource ? (
                              <Image
                                src={imageSource}
                                alt={asset.name || asset.id}
                                fill
                                sizes="88px"
                                className="object-cover"
                                unoptimized
                                onError={() => handleImageError(asset.id)}
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                                {commandStatus === "loading" ? (
                                  <Loader2 className="size-6 animate-spin" />
                                ) : (
                                  <ImageIcon className="size-6" />
                                )}
                                <span className="text-xs">
                                  {commandStatusLabel || t("assetPanel.imagePending")}
                                </span>
                              </div>
                            )}

                            <div
                              className={cn(
                                "pointer-events-none absolute inset-0 z-40 rounded-md ring-1 ring-inset",
                                selectedAssetId === asset.id
                                  ? "ring-primary"
                                  : "ring-border group-hover:ring-primary",
                              )}
                              aria-hidden="true"
                            />
                          </div>
                          <div className="flex min-h-7 items-center px-1.5 py-1">
                            <span className="truncate text-xs">{asset.name || asset.id}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <MediaPreviewDialog
        activeItemId={previewAssetId}
        items={visibleMediaItems}
        onActiveItemChange={setPreviewAssetId}
        onOpenChange={(open) => !open && setPreviewAssetId(null)}
        open={Boolean(previewAssetId)}
      />

      {typeof document !== "undefined" && selectedAsset && assetDetailPosition
        ? createPortal(
            <div
              className="fixed z-998 w-[min(356px,calc(100vw-24px))]"
              style={{
                left: assetDetailPosition.left,
                top: assetDetailPosition.top,
              }}
            >
              <AssetDetailCard
                asset={selectedAsset}
                childAssets={selectedAssetChildren}
                failedImageIds={failedImageIds}
                onImageError={handleImageError}
                onClose={() => {
                  setSelectedAssetId(null);
                  setAssetDetailPosition(null);
                }}
                className="max-h-[min(560px,calc(100vh-96px))]"
              />
            </div>,
            document.body,
          )
        : null}

      {typeof document !== "undefined" && selectedChatAsset && assetChatPosition
        ? createPortal(
            <div
              data-asset-chat-window
              className="fixed z-999 w-[min(640px,calc(100vw-32px))] -translate-y-1/2"
              style={{
                left: assetChatPosition.left,
                top: assetChatPosition.top,
              }}
            >
              <ChatWindow
                commandStatus={selectedChatCommandStatus}
                initialPrompt={selectedChatAsset.prompt}
                initialPromptKey={selectedChatAsset.id}
                projectId={currentProject?.id ?? ""}
                emptyModelLabel={tCanvas("chatWindow.emptyModel")}
                placeholder={tCanvas("chatWindow.placeholder")}
                inputLabel={tCanvas("chatWindow.inputLabel")}
                addAttachmentLabel={tCanvas("chatWindow.addAttachment")}
                attachmentFallbackLabel={(index) => tCanvas("chatWindow.imageFallback", { index })}
                attachmentListLabel={tCanvas("chatWindow.attachmentList")}
                removeAttachmentLabel={tCanvas("chatWindow.removeAttachment")}
                firstFrameLabel={tCanvas("chatWindow.firstFrame")}
                lastFrameLabel={tCanvas("chatWindow.lastFrame")}
                promptPairSeparator={tCanvas("chatWindow.promptPairSeparator")}
                modelSelectLabel={tCanvas("chatWindow.modelSelect")}
                modelOptions={imageModelOptions}
                mediaMentionImages={selectedChatMentionImages}
                preferMediaMentions
                referenceImages={selectedChatMentionImages}
                requiresFirstLastFrame={false}
                selectedModelId={selectedModelId}
                sendLabel={tCanvas("chatWindow.send")}
                stopLabel={tCanvas("chatWindow.stop")}
                showVideoOptions={false}
                videoDurationLabel={tCanvas("chatWindow.videoDuration")}
                videoDurationUnitLabel={tCanvas("chatWindow.videoDurationUnit")}
                videoShotLabel={tCanvas("chatWindow.videoShot")}
                videoShotLabels={{
                  static: tCanvas("chatWindow.videoShots.static"),
                  "push-in": tCanvas("chatWindow.videoShots.pushIn"),
                  "pull-out": tCanvas("chatWindow.videoShots.pullOut"),
                  pan: tCanvas("chatWindow.videoShots.pan"),
                  tilt: tCanvas("chatWindow.videoShots.tilt"),
                  tracking: tCanvas("chatWindow.videoShots.tracking"),
                  orbit: tCanvas("chatWindow.videoShots.orbit"),
                  handheld: tCanvas("chatWindow.videoShots.handheld"),
                }}
                onModelChange={setSelectedImageModelId}
                onStop={() => stopSilentAgentCommand(selectedChatAsset.id)}
                onSubmit={(payload) => {
                  if (!selectedChatAsset) return;

                  void (async () => {
                    if (!currentProject || !selectedImageModel) return;

                    try {
                      await saveProjectSelectedModel(currentProject.id, {
                        apiKey: selectedImageModel.apiKey,
                        example: selectedImageModel.example,
                        id: selectedImageModel.id,
                        name: selectedImageModel.name,
                        type: "image",
                      });

                      await executeSilentAgentCommand(payload, {
                        featureSkill: "asset-panel-generate",
                        mediaId: selectedChatAsset.id,
                        mediaName: selectedChatAsset.name || selectedChatAsset.id,
                        mediaType: selectedChatAsset.type,
                        scope: "asset-grid",
                      });
                      await syncAssetData(currentProject.id, false);
                    } catch {
                      // The agent run depends on the project model config being current.
                    }
                  })();
                }}
              />
            </div>,
            document.body,
          )
        : null}

      <Dialog open={!!deletingAsset} onOpenChange={(open) => !open && setDeletingAsset(null)}>
        <DialogContent className="w-[min(92vw,420px)]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("assetPanel.deleteConfirmTitle")}</DialogTitle>
            <DialogDescription className="mt-2">
              {t("assetPanel.deleteConfirmDescription", {
                name: deletingAsset?.name || deletingAsset?.id || "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={deletingImage}>
                {t("assetPanel.cancel")}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteAsset}
              disabled={deletingImage}
            >
              {deletingImage ? t("assetPanel.deleting") : t("assetPanel.confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssetCreateDialog
        images={projectImages}
        onCreated={(_image, images) => {
          setProjectImages(images);
          syncProjectImages(images);
          setFailedImageIds(new Set());
        }}
        onImported={(image) => {
          setSelectedChatAssetId(null);
          setAssetChatPosition(null);
          setSelectedAssetId(image.id);
        }}
        onProjectUpdated={setCurrentProject}
        onOpenChange={setCreateDialogOpen}
        open={createDialogOpen}
        projectAssets={currentProject?.assets}
        projectId={currentProject?.id ?? ""}
      />

      <Dialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <DialogContent className="w-[min(92vw,420px)]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t(confirmActionTitleKey)}</DialogTitle>
            <DialogDescription className="mt-2">{t(confirmActionDescriptionKey)}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t("assetPanel.cancel")}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="default"
              disabled={assetCommandLoading}
              onClick={() => {
                const nextAction = confirmAction;
                setConfirmAction(null);
                if (nextAction === "parse") {
                  void executeAssetPanelAction();
                }
              }}
            >
              {assetCommandLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {t(confirmActionButtonKey)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
