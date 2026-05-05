"use client";

import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getSafeMediaSource } from "@/lib/media-src";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MediaItem } from "@/store/use-canvas-store";

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

export function MediaPreviewDialog({
  activeItemId,
  items,
  onActiveItemChange,
  onOpenChange,
  open,
}: {
  activeItemId: string | null;
  items: MediaItem[];
  onActiveItemChange: (id: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const t = useTranslations("Canvas");
  const previewItems = items.filter(
    (item) => getMediaPreviewSource(item) || getMediaPosterSource(item),
  );
  const activeIndex = Math.max(
    previewItems.findIndex((item) => item.id === activeItemId),
    0,
  );
  const activeItem = previewItems[activeIndex];
  const source = activeItem ? getMediaPreviewSource(activeItem) : "";
  const hasMultipleItems = previewItems.length > 1;
  const handleStep = (offset: number) => {
    if (!hasMultipleItems) return;

    const nextIndex = (activeIndex + offset + previewItems.length) % previewItems.length;
    onActiveItemChange(previewItems[nextIndex].id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,960px)] overflow-hidden p-0" showCloseButton>
        <DialogHeader className="border-b px-5 py-4 text-left">
          <DialogTitle>{t("mediaPreview.title")}</DialogTitle>
          <DialogDescription>
            {activeItem?.name || activeItem?.id || t("mediaPreview.empty")}
          </DialogDescription>
        </DialogHeader>
        <div className="relative flex min-h-[min(70vh,620px)] items-center justify-center bg-background">
          {activeItem && source ? (
            activeItem.type === "video" ? (
              <video
                className="max-h-[70vh] w-full object-contain"
                controls
                playsInline
                poster={getMediaPosterSource(activeItem)}
                src={source}
              />
            ) : (
              <div className="relative h-[min(70vh,620px)] w-full">
                <Image
                  src={source}
                  alt={activeItem.name}
                  fill
                  sizes="960px"
                  className="object-contain"
                  unoptimized
                />
              </div>
            )
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <ImageIcon className="size-8" />
              <span className="text-sm">{t("mediaPreview.empty")}</span>
            </div>
          )}
          {hasMultipleItems ? (
            <>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label={t("mediaPreview.previous")}
                className="absolute left-4 top-1/2 size-10 -translate-y-1/2 rounded-full bg-background/90 shadow-lg"
                onClick={() => handleStep(-1)}
              >
                <ChevronLeft className="size-5" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label={t("mediaPreview.next")}
                className="absolute right-4 top-1/2 size-10 -translate-y-1/2 rounded-full bg-background/90 shadow-lg"
                onClick={() => handleStep(1)}
              >
                <ChevronRight className="size-5" />
              </Button>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
