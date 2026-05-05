"use client";

import { ImageIcon, Video } from "lucide-react";
import Image from "next/image";
import { useMemo } from "react";
import { getSafeMediaSource } from "@/lib/media-src";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/store/use-canvas-store";

type MediaPreviewPopoverProps = {
  activeId: string;
  className?: string;
  items: MediaItem[];
  previewLabel: string;
};

function getPreviewSource(item: MediaItem) {
  return getSafeMediaSource(item.url);
}

function getPosterSource(item: MediaItem) {
  return (
    getSafeMediaSource(item.cover) ??
    getSafeMediaSource(item.coverUrl) ??
    getSafeMediaSource(item.poster) ??
    undefined
  );
}

export function MediaPreviewPopover({
  activeId,
  className,
  items,
  previewLabel,
}: MediaPreviewPopoverProps) {
  const previewItems = useMemo(
    () => items.filter((item) => getPreviewSource(item) || getPosterSource(item)),
    [items],
  );
  const activeItem = previewItems.find((item) => item.id === activeId) ?? previewItems[0];
  const source = activeItem ? getPreviewSource(activeItem) : "";

  if (!activeItem) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto w-96 max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border border-primary/35 bg-popover text-popover-foreground shadow-[0_28px_90px_rgba(0,0,0,0.55)] ring-1 ring-primary/20",
        className,
      )}
      role="dialog"
      aria-label={previewLabel}
    >
      <div className="relative aspect-video bg-background">
        {source ? (
          activeItem.type === "video" ? (
            <video
              className="size-full object-contain"
              autoPlay
              loop
              muted
              playsInline
              poster={getPosterSource(activeItem)}
              src={source}
            />
          ) : (
            // Project media URLs are local serializable API paths.
            <Image
              src={source}
              alt={activeItem.name}
              fill
              sizes="288px"
              className="size-full object-contain"
              unoptimized
            />
          )
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            {activeItem.type === "video" ? (
              <Video className="size-8" />
            ) : (
              <ImageIcon className="size-8" />
            )}
          </div>
        )}
      </div>
      <div className="px-3 py-2">
        <span className="block truncate text-xs font-medium">{activeItem.name || activeItem.id}</span>
      </div>
    </div>
  );
}
