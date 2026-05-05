"use client";

import { ImageIcon, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getSafeMediaSource } from "@/lib/media-src";
import type { ProjectImageAsset } from "@/lib/project-types";
import { cn } from "@/lib/utils";

type AssetDetailCardProps = {
  asset: ProjectImageAsset;
  childAssets: ProjectImageAsset[];
  failedImageIds: Set<string>;
  onImageError: (assetId: string) => void;
  onClose: () => void;
  className?: string;
};

function getAssetLabel(asset: ProjectImageAsset) {
  return asset.name || asset.id;
}

function AssetPreview({
  asset,
  failedImageIds,
  imageSize,
  onImageError,
}: {
  asset: ProjectImageAsset;
  failedImageIds: Set<string>;
  imageSize: string;
  onImageError: (assetId: string) => void;
}) {
  const t = useTranslations("Sidebar");
  const imageSource = getSafeMediaSource(asset.url);
  const shouldShowImage = imageSource && !failedImageIds.has(asset.id);

  return (
    <div className="relative size-full overflow-hidden rounded-md border border-border bg-muted/20">
      {shouldShowImage && imageSource ? (
        <Image
          src={imageSource}
          alt={getAssetLabel(asset)}
          fill
          sizes={imageSize}
          className="object-cover"
          unoptimized
          onError={() => onImageError(asset.id)}
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
          <ImageIcon className="size-5" />
          {asset.url ? null : <span className="text-xs">{t("assetPanel.imagePending")}</span>}
        </div>
      )}
    </div>
  );
}

export function AssetDetailCard({
  asset,
  childAssets,
  failedImageIds,
  onImageError,
  onClose,
  className,
}: AssetDetailCardProps) {
  const t = useTranslations("Sidebar");

  return (
    <section
      data-asset-detail-card
      className={cn(
        "flex flex-col overflow-hidden rounded-md border border-border bg-foreground/15 text-foreground shadow-sm  backdrop-blur-2xl",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-2 motion-safe:zoom-in-95 motion-safe:duration-200",
        className,
      )}
      aria-label={t("assetPanel.detail.title")}
    >
      <div className="flex items-start gap-3 p-3">
        <div className="size-14 shrink-0">
          <AssetPreview
            asset={asset}
            failedImageIds={failedImageIds}
            imageSize="56px"
            onImageError={onImageError}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{getAssetLabel(asset)}</h3>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t("assetPanel.detail.close")}
              onClick={onClose}
              className="-mt-1 -mr-1 text-foreground hover:bg-transparent hover:text-foreground"
            >
              <X className="size-3.5" />
            </Button>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground/70">
            {asset.prompt || t("assetPanel.detail.emptyValue")}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-foreground">
            <span>
              {t("assetPanel.detail.type", {
                value: asset.type || t("assetPanel.detail.emptyValue"),
              })}
            </span>
            <span>
              {t("assetPanel.detail.source", {
                value: asset.source || t("assetPanel.detail.emptyValue"),
              })}
            </span>
          </div>
        </div>
      </div>

      {childAssets.length > 0 ? (
        <ScrollArea className="h-[min(360px,calc(100vh-220px))] px-3 pb-3">
          <div className="space-y-2 pl-20 pr-2">
            {childAssets.map((childAsset) => (
              <div
                key={childAsset.id}
                className="flex items-start gap-2 border-l border-border pl-2"
              >
                <div className="size-14 shrink-0">
                  <AssetPreview
                    asset={childAsset}
                    failedImageIds={failedImageIds}
                    imageSize="56px"
                    onImageError={onImageError}
                  />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="truncate text-xs font-medium">{getAssetLabel(childAsset)}</p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="mt-0.5 line-clamp-2 cursor-help text-xs leading-relaxed">
                        {childAsset.prompt || t("assetPanel.detail.emptyValue")}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent
                      className="z-[1000] max-w-80 whitespace-normal leading-relaxed"
                      side="top"
                    >
                      {childAsset.prompt || t("assetPanel.detail.emptyValue")}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : null}
    </section>
  );
}
