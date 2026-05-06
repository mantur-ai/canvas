"use client";

import {
  Eye,
  ImageIcon,
  Loader2,
  PackagePlus,
  Plus,
  Star,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { AssetCreateDialog } from "@/components/assets/asset-create-dialog";
import { MediaPreviewDialog } from "@/components/canvas/media-preview-dialog";
import { MediaPreviewPopover } from "@/components/canvas/media-preview-popover";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  addProjectImageToStoryboard,
  addProjectVideoToStoryboard,
  createProjectVideo,
  deleteProjectImage,
  deleteProjectVideo,
  selectProjectStoryboardVideo,
  updateProjectImageFile,
  updateProjectVideoFile,
} from "@/lib/project-api";
import { getSafeMediaSource } from "@/lib/media-src";
import type { ProjectImageAsset } from "@/lib/project-types";
import { cn } from "@/lib/utils";
import { useCanvasStore, type MediaItem } from "@/store/use-canvas-store";

const MEDIA_GRID_SCROLL_AREA_CLASS =
  "nodrag nowheel h-[16.625rem] w-full max-w-full overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-xl transition-[border-color,box-shadow,transform] duration-200";
const MEDIA_GRID_ACTIVE_CLASS =
  "border-border shadow-[0_0_34px_hsl(var(--primary)/0.48),0_20px_60px_rgba(0,0,0,0.62)] translate-y-[-1px]";
const MEDIA_GRID_SCROLL_CONTENT_CLASS = "grid w-full min-w-0 max-w-full grid-cols-2 gap-2 p-2 pr-5";
const MEDIA_GRID_SCROLL_BAR_CLASS = "nodrag data-vertical:w-4 data-horizontal:h-4 p-1";
const MEDIA_GRID_SCROLL_THUMB_CLASS =
  "bg-muted-foreground/55 transition-colors hover:bg-muted-foreground/80";
// Keep tile corners modest so ReactFlow zoom does not make thumbnails look over-rounded.
const MEDIA_TILE_RADIUS_CLASS = "rounded-[6px]";

function IconButtonTooltip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function getMediaPreviewSource(item: MediaItem) {
  return getSafeMediaSource(item.url);
}

function getMediaPosterSource(item: MediaItem) {
  return (
    getSafeMediaSource(item.cover) ??
    getSafeMediaSource(item.coverUrl) ??
    getSafeMediaSource(item.poster) ??
    undefined
  );
}

function MediaTileActions({
  canPreview,
  item,
  onDelete,
  onLibrary,
  onPreview,
  onPreviewSuppressedChange,
  onUploadClick,
}: {
  canPreview: boolean;
  item: MediaItem;
  onDelete: (item: MediaItem) => void;
  onLibrary?: (item: MediaItem) => void;
  onPreview: (item: MediaItem) => void;
  onPreviewSuppressedChange: (suppressed: boolean) => void;
  onUploadClick: () => void;
}) {
  const t = useTranslations("Canvas");

  return (
    <div
      className="absolute inset-x-1 top-1 z-30 flex items-center justify-between opacity-0 transition-opacity group-hover:opacity-100"
      onMouseEnter={() => onPreviewSuppressedChange(true)}
      onMouseLeave={() => onPreviewSuppressedChange(false)}
    >
      <div className="flex gap-1 rounded-md bg-background/80 p-0.5 shadow-sm backdrop-blur">
        <TooltipProvider delayDuration={200}>
          <IconButtonTooltip label={t("mediaGrid.upload")}>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t("mediaGrid.upload")}
              className="size-5.5 text-foreground hover:bg-accent"
              onClick={(event) => {
                event.stopPropagation();
                onUploadClick();
              }}
            >
              <Upload className="size-3.5" />
            </Button>
          </IconButtonTooltip>
        </TooltipProvider>
        {canPreview ? (
          <TooltipProvider delayDuration={200}>
            <IconButtonTooltip label={t("mediaGrid.preview")}>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("mediaGrid.preview")}
                className="size-5.5 text-primary hover:bg-primary/15"
                onClick={(event) => {
                  event.stopPropagation();
                  onPreview(item);
                }}
              >
                <Eye className="size-3.5" />
              </Button>
            </IconButtonTooltip>
          </TooltipProvider>
        ) : null}
      </div>
      <div className="flex gap-1 rounded-md bg-background/80 p-0.5 shadow-sm backdrop-blur">
        {item.type === "image" && onLibrary ? (
          <TooltipProvider delayDuration={200}>
            <IconButtonTooltip label={t("mediaGrid.addToLibrary")}>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("mediaGrid.addToLibrary")}
                className="size-5.5 text-foreground hover:bg-accent"
                onClick={(event) => {
                  event.stopPropagation();
                  onLibrary(item);
                }}
              >
                <PackagePlus className="size-3.5" />
              </Button>
            </IconButtonTooltip>
          </TooltipProvider>
        ) : null}
        <TooltipProvider delayDuration={200}>
          <IconButtonTooltip label={t("mediaGrid.delete")}>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t("mediaGrid.delete")}
              className="size-5.5 text-foreground hover:bg-destructive/15 hover:text-destructive"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(item);
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </IconButtonTooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

function MediaUploadInput({
  item,
  onUpload,
  fileInputRef,
}: {
  item: MediaItem;
  onUpload: (item: MediaItem, file: File) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <input
      ref={fileInputRef}
      type="file"
      accept={
        item.type === "video"
          ? "video/mp4,video/webm,video/quicktime"
          : "image/png,image/jpeg,image/webp,image/gif"
      }
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.currentTarget.value = "";
        if (file) onUpload(item, file);
      }}
    />
  );
}

function VideoSelectButton({
  isSelectedVideo,
  item,
  onSelectVideo,
}: {
  isSelectedVideo: boolean;
  item: MediaItem;
  onSelectVideo: (item: MediaItem) => void;
}) {
  const t = useTranslations("Canvas");
  const label = t("mediaGrid.selectVideo", { name: item.name || item.id });

  return (
    <TooltipProvider delayDuration={200}>
      <IconButtonTooltip label={label}>
        <button
          type="button"
          aria-label={label}
          aria-pressed={isSelectedVideo}
          className={cn(
            "absolute bottom-1 left-1 z-30 flex size-6 items-center justify-center rounded-md border bg-background/90 shadow-sm transition-colors",
            isSelectedVideo
              ? "border-primary text-primary"
              : "border-border text-muted-foreground hover:border-primary hover:text-primary",
          )}
          onClick={(event) => {
            event.stopPropagation();
            onSelectVideo(item);
          }}
        >
          <Star
            className={cn(
              "size-3.5 transition-colors",
              isSelectedVideo ? "fill-primary text-primary" : "fill-transparent",
            )}
          />
        </button>
      </IconButtonTooltip>
    </TooltipProvider>
  );
}

function MediaFallbackContent({
  isLoading,
  item,
  statusLabel,
}: {
  isLoading: boolean;
  item: MediaItem;
  statusLabel: string;
}) {
  const t = useTranslations("Canvas");

  return (
    <div className="flex min-w-0 max-w-full flex-col items-center gap-1 px-1 text-muted-foreground">
      {isLoading ? (
        <Loader2 className="size-5 animate-spin" />
      ) : item.type === "video" ? (
        <Video className="size-5" />
      ) : (
        <ImageIcon className="size-5" />
      )}
      <span className="max-w-full truncate text-xs">{statusLabel || t("mediaGrid.pending")}</span>
    </div>
  );
}

function MediaLoadingOverlay({ statusLabel }: { statusLabel: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 bg-background/70 text-muted-foreground backdrop-blur-[1px]">
      <Loader2 className="size-5 animate-spin" />
      <span className="text-xs">{statusLabel}</span>
    </div>
  );
}

function MediaVisualViewport({
  canSelectVideo,
  isError,
  isLoading,
  isSelectedVideo,
  item,
  onImageError,
  onSelectVideo,
  statusLabel,
  visualSource,
}: {
  canSelectVideo: boolean;
  isError: boolean;
  isLoading: boolean;
  isSelectedVideo: boolean;
  item: MediaItem;
  onImageError: () => void;
  onSelectVideo?: (item: MediaItem) => void;
  statusLabel: string;
  visualSource?: string | null;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      {canSelectVideo && onSelectVideo ? (
        <VideoSelectButton
          isSelectedVideo={isSelectedVideo}
          item={item}
          onSelectVideo={onSelectVideo}
        />
      ) : null}
      {visualSource && !isError ? (
        // Project media URLs are data from the project JSON and remain serializable in flow nodes.
        <Image
          src={visualSource}
          alt={item.name}
          fill
          sizes="108px"
          className="object-cover"
          unoptimized
          onError={onImageError}
        />
      ) : (
        <MediaFallbackContent isLoading={isLoading} item={item} statusLabel={statusLabel} />
      )}
      {isLoading && visualSource && !isError ? (
        <MediaLoadingOverlay statusLabel={statusLabel} />
      ) : null}
    </div>
  );
}

function MediaNameBar({ name }: { name: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex h-5 max-w-full min-w-0 items-center justify-center overflow-hidden rounded-b-[inherit] bg-background/30 px-1 pb-0.5 pt-px backdrop-blur-md">
      <span className="block max-w-full truncate text-[10px] leading-none">{name}</span>
    </div>
  );
}

function MediaTileSelectionLayers({
  hasActiveSelection,
  isSelected,
}: {
  hasActiveSelection: boolean;
  isSelected: boolean;
}) {
  return (
    <>
      {hasActiveSelection && !isSelected ? (
        <div
          className="pointer-events-none absolute inset-0 z-[5] bg-black/55 backdrop-blur-[1px] rounded-sm"
          aria-hidden="true"
        />
      ) : null}
      <div
        className="pointer-events-none absolute inset-0 z-[25] rounded-[inherit] border border-border"
        aria-hidden="true"
      />
    </>
  );
}

function MediaTileSelectButton({
  item,
  onSelect,
}: {
  item: MediaItem;
  onSelect: (item: MediaItem, anchorRect: DOMRect) => void;
}) {
  const t = useTranslations("Canvas");

  return (
    <button
      type="button"
      aria-label={t("mediaGrid.select", { name: item.name || item.id })}
      className="absolute inset-0 z-10 cursor-pointer bg-transparent rounded-2xl"
      onClick={(event) => {
        event.stopPropagation();
        onSelect(item, event.currentTarget.getBoundingClientRect());
      }}
    />
  );
}

function MediaPreview({
  hasActiveSelection,
  isSelected,
  item,
  onDelete,
  onLibrary,
  onPreview,
  onSelect,
  onSelectVideo,
  onUpload,
  previewItems,
  selectedVideoId,
  showName,
}: {
  hasActiveSelection: boolean;
  isSelected: boolean;
  item: MediaItem;
  onDelete: (item: MediaItem) => void;
  onLibrary?: (item: MediaItem) => void;
  onPreview: (item: MediaItem) => void;
  onSelect: (item: MediaItem, anchorRect: DOMRect) => void;
  onSelectVideo?: (item: MediaItem) => void;
  onUpload: (item: MediaItem, file: File) => void;
  previewItems: MediaItem[];
  selectedVideoId?: string;
  showName: boolean;
}) {
  const t = useTranslations("Canvas");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState(false);
  const [previewAnchorRect, setPreviewAnchorRect] = useState<DOMRect | null>(null);
  const [previewSuppressed, setPreviewSuppressed] = useState(false);
  const previewSource = getMediaPreviewSource(item);
  const posterSource = getMediaPosterSource(item);
  const visualSource = item.type === "video" ? posterSource : previewSource;
  const status = item.status.toLowerCase();
  const commandStatus =
    status === "loading" || status === "error" || status === "success" ? status : "";
  const isLoading = commandStatus === "loading";
  const hasStatusError = commandStatus === "error" || status === "failed";
  const isError = hasStatusError || (item.type === "image" && failed);
  const isSelectedVideo = item.type === "video" && selectedVideoId === item.id;
  const canPreview = (Boolean(previewSource) || Boolean(posterSource)) && !isError;
  const canSelectVideo =
    item.type === "video" &&
    Boolean(onSelectVideo) &&
    Boolean(previewSource) &&
    !isLoading &&
    !isError;
  const statusLabel =
    commandStatus === "loading"
      ? t("mediaGrid.loading")
      : commandStatus === "success"
        ? t("mediaGrid.success")
        : isError
          ? t("mediaGrid.error")
          : "";
  const previewAbove = previewAnchorRect ? previewAnchorRect.top >= 220 : true;
  const previewLeft =
    previewAnchorRect && typeof window !== "undefined"
      ? Math.min(
          Math.max(previewAnchorRect.left + previewAnchorRect.width / 2, 204),
          window.innerWidth - 204,
        )
      : (previewAnchorRect?.left ?? 0) + (previewAnchorRect?.width ?? 0) / 2;
  const previewTop = previewAnchorRect
    ? previewAbove
      ? previewAnchorRect.top - 8
      : previewAnchorRect.bottom + 8
    : 0;

  useEffect(() => {
    setFailed(false);
  }, [commandStatus, visualSource]);

  return (
    <div
      data-selected-media-grid-item={isSelected ? "true" : undefined}
      className={`group relative min-w-0 max-w-full text-left ${MEDIA_TILE_RADIUS_CLASS}`}
      onMouseEnter={(event) => setPreviewAnchorRect(event.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => setPreviewAnchorRect(null)}
    >
      {item.type === "image" &&
      canPreview &&
      previewAnchorRect &&
      !previewSuppressed &&
      typeof document !== "undefined"
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
                key={item.id}
                activeId={item.id}
                items={previewItems}
                previewLabel={t("mediaPreview.preview")}
              />
            </div>,
            document.body,
          )
        : null}
      <div
        className={cn(
          "relative flex aspect-square flex-col overflow-hidden outline outline-0 outline-offset-1 transition-[outline-color,outline-width] duration-150 group-hover:outline-2 group-hover:outline-primary",
          isSelected ? "outline-2 outline-primary" : "outline-transparent",
          MEDIA_TILE_RADIUS_CLASS,
        )}
      >
        <MediaTileActions
          canPreview={canPreview}
          item={item}
          onDelete={onDelete}
          onLibrary={onLibrary}
          onPreview={onPreview}
          onPreviewSuppressedChange={setPreviewSuppressed}
          onUploadClick={() => fileInputRef.current?.click()}
        />
        <MediaUploadInput fileInputRef={fileInputRef} item={item} onUpload={onUpload} />
        <MediaVisualViewport
          canSelectVideo={canSelectVideo}
          isError={isError}
          isLoading={isLoading}
          isSelectedVideo={isSelectedVideo}
          item={item}
          onImageError={() => setFailed(true)}
          onSelectVideo={onSelectVideo}
          statusLabel={statusLabel}
          visualSource={visualSource}
        />
        {showName ? <MediaNameBar name={item.name || item.id} /> : null}
        <MediaTileSelectionLayers hasActiveSelection={hasActiveSelection} isSelected={isSelected} />
        <MediaTileSelectButton item={item} onSelect={onSelect} />
      </div>
    </div>
  );
}

function EmptyMediaTile({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <div className={`min-w-0 max-w-full ${MEDIA_TILE_RADIUS_CLASS}`}>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={(event) => {
          event.stopPropagation();
          onClick?.();
        }}
        className={`flex aspect-square h-auto w-full min-w-0 flex-col items-center justify-center gap-1 overflow-hidden border border-dashed border-border bg-transparent px-1 text-muted-foreground ring-inset transition-colors hover:bg-accent hover:text-primary hover:ring-1 hover:ring-primary ${MEDIA_TILE_RADIUS_CLASS}`}
      >
        <Plus className="size-4" />
        <span className="max-w-full truncate text-xs">{label}</span>
      </button>
    </div>
  );
}

export function MediaGrid({
  addLabel,
  items,
  mediaType,
  nodeId,
  scenePrompt,
  sceneTitle,
  sceneId,
  selectedVideoId,
  showItemNames,
  active,
}: {
  active: boolean;
  addLabel: string;
  items: MediaItem[];
  mediaType: "image" | "video";
  nodeId: string;
  scenePrompt: string;
  sceneTitle: string;
  sceneId: string;
  selectedVideoId?: string;
  showItemNames: boolean;
}) {
  const t = useTranslations("Canvas");
  const selectedMediaGridItem = useCanvasStore((state) => state.selectedMediaGridItem);
  const selectMediaGridItem = useCanvasStore((state) => state.selectMediaGridItem);
  const currentCanvasData = useCanvasStore((state) => state.currentCanvasData);
  const currentProject = useCanvasStore((state) => state.currentProject);
  const addImageToStoryboard = useCanvasStore((state) => state.addImageToStoryboard);
  const addVideoToStoryboard = useCanvasStore((state) => state.addVideoToStoryboard);
  const removeMediaFromStoryboard = useCanvasStore((state) => state.removeMediaFromStoryboard);
  const setCurrentProject = useCanvasStore((state) => state.setCurrentProject);
  const setStoryboardSelectedVideo = useCanvasStore((state) => state.setStoryboardSelectedVideo);
  const updateImageAsset = useCanvasStore((state) => state.updateImageAsset);
  const updateVideoAsset = useCanvasStore((state) => state.updateVideoAsset);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [libraryImage, setLibraryImage] = useState<ProjectImageAsset | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<MediaItem | null>(null);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);
  const hasActiveSelection = Boolean(selectedMediaGridItem);
  const handleAddMedia = () => {
    if (!currentProject) return;
    if (mediaType === "image") {
      setCreateDialogOpen(true);
      return;
    }

    void (async () => {
      try {
        const result = await createProjectVideo(currentProject.id, {
          name: addLabel,
          prompt: "",
          source: "manual",
        });
        await addProjectVideoToStoryboard(currentProject.id, sceneId, result.video.id);
        addVideoToStoryboard(sceneId, result.video);
      } catch {
        // Creation can be retried from the add tile.
      }
    })();
  };
  const handleConfirmDeleteMedia = () => {
    if (!currentProject || !pendingDeleteItem) return;
    const item = pendingDeleteItem;

    void (async () => {
      try {
        if (item.type === "image") {
          await deleteProjectImage(currentProject.id, item.id);
        } else {
          await deleteProjectVideo(currentProject.id, item.id);
        }
        removeMediaFromStoryboard(sceneId, item.id, item.type);
        setPendingDeleteItem(null);
      } catch {
        // Deleting is best-effort; keep the tile if persistence fails.
      }
    })();
  };
  const handleUploadMedia = (item: MediaItem, file: File) => {
    if (!currentProject) return;

    void (async () => {
      try {
        if (item.type === "image") {
          const result = await updateProjectImageFile(currentProject.id, item.id, file);
          updateImageAsset(result.image);
          return;
        }

        const result = await updateProjectVideoFile(currentProject.id, item.id, file);
        updateVideoAsset(result.video);
      } catch {
        // Upload replacement can be retried from the tile.
      }
    })();
  };
  const handleAddImageToStoryboard = (image: ProjectImageAsset) => {
    if (!currentProject) return;

    void (async () => {
      try {
        await addProjectImageToStoryboard(currentProject.id, sceneId, image.id);
        addImageToStoryboard(sceneId, image);
      } catch {
        // Binding can be retried by adding the image again from the library.
      }
    })();
  };

  return (
    <>
      {/* Keep wheel and drag gestures local to the node's media scroller. */}
      <ScrollArea
        className={cn(
          MEDIA_GRID_SCROLL_AREA_CLASS,
          active ? MEDIA_GRID_ACTIVE_CLASS : "border-border",
        )}
        scrollBarClassName={MEDIA_GRID_SCROLL_BAR_CLASS}
        thumbClassName={MEDIA_GRID_SCROLL_THUMB_CLASS}
      >
        <div className={MEDIA_GRID_SCROLL_CONTENT_CLASS}>
          <EmptyMediaTile label={addLabel} onClick={handleAddMedia} />
          {items.map((item) => (
            <MediaPreview
              key={item.id}
              hasActiveSelection={hasActiveSelection}
              isSelected={
                selectedMediaGridItem?.nodeId === nodeId &&
                selectedMediaGridItem.item.id === item.id
              }
              item={item}
              onDelete={setPendingDeleteItem}
              onPreview={(selectedItem) => setPreviewItemId(selectedItem.id)}
              onLibrary={(selectedItem) => {
                const image = currentCanvasData?.data.images.find(
                  (asset) => asset.id === selectedItem.id,
                );
                if (image) setLibraryImage(image);
              }}
              showName={showItemNames}
              onUpload={handleUploadMedia}
              previewItems={items}
              onSelect={(selectedItem, anchorRect) => {
                selectMediaGridItem({
                  nodeId,
                  sceneId,
                  scenePrompt,
                  sceneTitle,
                  item: selectedItem,
                  anchorRect: {
                    height: anchorRect.height,
                    left: anchorRect.left,
                    top: anchorRect.top,
                    width: anchorRect.width,
                  },
                });
              }}
              onSelectVideo={
                mediaType === "video"
                  ? (selectedItem) => {
                      setStoryboardSelectedVideo(sceneId, selectedItem.id);
                      if (!currentProject) return;

                      void selectProjectStoryboardVideo(
                        currentProject.id,
                        sceneId,
                        selectedItem.id,
                      ).catch(() => {
                        // The local selection stays visible; persistence can retry on the next click.
                      });
                    }
                  : undefined
              }
              selectedVideoId={selectedVideoId}
            />
          ))}
        </div>
      </ScrollArea>
      {currentProject ? (
        <AssetCreateDialog
          hiddenSources={["local"]}
          images={currentCanvasData?.data.images ?? []}
          onCreated={handleAddImageToStoryboard}
          onImported={handleAddImageToStoryboard}
          onProjectUpdated={setCurrentProject}
          onOpenChange={setCreateDialogOpen}
          open={createDialogOpen}
          projectAssets={currentProject.assets}
          projectId={currentProject.id}
        />
      ) : null}
      {currentProject ? (
        <AssetCreateDialog
          images={currentCanvasData?.data.images ?? []}
          libraryImage={libraryImage}
          onOpenChange={(open) => !open && setLibraryImage(null)}
          onProjectUpdated={setCurrentProject}
          open={Boolean(libraryImage)}
          projectAssets={currentProject.assets}
          projectId={currentProject.id}
        />
      ) : null}
      <MediaPreviewDialog
        activeItemId={previewItemId}
        items={items}
        onActiveItemChange={setPreviewItemId}
        onOpenChange={(open) => !open && setPreviewItemId(null)}
        open={Boolean(previewItemId)}
      />
      <Dialog
        open={Boolean(pendingDeleteItem)}
        onOpenChange={(open) => !open && setPendingDeleteItem(null)}
      >
        <DialogContent className="w-[min(92vw,420px)]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("mediaGrid.deleteTitle")}</DialogTitle>
            <DialogDescription className="mt-2">
              {t("mediaGrid.deleteDescription", {
                name: pendingDeleteItem?.name || pendingDeleteItem?.id || "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setPendingDeleteItem(null)}>
              {t("mediaGrid.cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmDeleteMedia}>
              {t("mediaGrid.confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
