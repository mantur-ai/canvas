"use client";

import { Trash2, Video } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { getSafeMediaSource } from "@/lib/media-src";
import type { ProjectVideoAsset } from "@/lib/project-types";
import { cn } from "@/lib/utils";

type VideoFooterCardProps = {
  deleteLabel: string;
  durationLabel: string;
  onDelete: () => void;
  onSelect: () => void;
  selected: boolean;
  storyboardId: string;
  storyboardName: string;
  video: ProjectVideoAsset;
  durationWeight: number;
};

export function VideoFooterCard({
  deleteLabel,
  durationWeight,
  durationLabel,
  onDelete,
  onSelect,
  selected,
  storyboardId,
  storyboardName,
  video,
}: VideoFooterCardProps) {
  const cover =
    getSafeMediaSource(video.cover) ??
    getSafeMediaSource(video.coverUrl) ??
    getSafeMediaSource(video.poster);
  const cardRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const cardElement = cardRef.current;
    if (!cardElement) return;

    const resizeObserver = new ResizeObserver(([entry]) => {
      setCompact(entry.contentRect.width < 100);
    });
    resizeObserver.observe(cardElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    onSelect();
  };

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      key={`${storyboardId}-${video.id}`}
      className={cn(
        "group relative h-full min-w-0 overflow-visible border border-border bg-background text-left transition-colors hover:border-primary",
        
      )}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      style={{ flex: `${durationWeight} 1 0` }}
    >
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label={deleteLabel}
        className="absolute right-1 top-1 z-20 size-6 bg-background/80 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:bg-accent hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="size-3.5" />
      </Button>
      {!compact ? (
        <div className="absolute bottom-1 right-1 z-10 flex items-center justify-between gap-2 border-b border-border bg-background/20 px-2 text-[10px] text-foreground backdrop-blur-md">
          <span>{durationLabel}</span>
        </div>
      ) : null}
      <div className="relative h-full overflow-hidden bg-muted">
        <div
          className={cn(
            "absolute left-1.5 top-1.5 z-10 max-w-[calc(100%-0.75rem)] rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm",
            compact && "hidden",
            selected ? "bg-primary" : "bg-background/90 text-foreground",
          )}
        >
          <span className="block truncate">{storyboardName}</span>
        </div>
        {cover ? (
          <Image
            src={cover}
            alt={video.name || storyboardName}
            fill
            sizes="160px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Video className="size-5" />
          </div>
        )}
      </div>
      {compact ? (
        <div className="pointer-events-none absolute left-1/2 top-0 z-30 hidden h-full w-[200px] -translate-x-1/2 overflow-hidden rounded-md border border-border bg-background text-left shadow-2xl group-hover:block group-focus-within:block">
          <div className="relative h-full bg-muted">
            <div className="absolute bottom-1 right-1 z-10 border-b border-border bg-background/30 px-2 text-[10px] text-foreground backdrop-blur-md">
              {durationLabel}
            </div>
            <div
              className={cn(
                "absolute left-1.5 top-1.5 z-10 max-w-[calc(100%-0.75rem)] rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm",
                selected ? "bg-primary" : "bg-background/90 text-foreground",
              )}
            >
              <span className="block truncate">{storyboardName}</span>
            </div>
            {cover ? (
              <Image
                src={cover}
                alt={video.name || storyboardName}
                fill
                sizes="200px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Video className="size-5" />
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
