"use client";

import { ArrowLeft, Bot, ChevronRight, FolderInput, ImageIcon, Upload } from "lucide-react";
import Image from "next/image";
import { type ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getSafeMediaSource } from "@/lib/media-src";
import { addProjectImageToAssets, createProjectImage } from "@/lib/project-api";
import type { ProjectAssets, ProjectDetail, ProjectImageAsset } from "@/lib/project-types";
import { cn } from "@/lib/utils";

type AssetCreateMode = "choose-source" | "global" | "form";
type AssetCreateSource = "global" | "local" | "ai";
type AssetCreateCategory = "character" | "prop" | "scene" | "reference";

type AssetCreateDialogProps = {
  hiddenSources?: AssetCreateSource[];
  images: ProjectImageAsset[];
  libraryImage?: ProjectImageAsset | null;
  onCreated?: (image: ProjectImageAsset, images: ProjectImageAsset[]) => void;
  onImported?: (image: ProjectImageAsset) => void;
  onProjectUpdated?: (project: ProjectDetail) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectAssets?: ProjectAssets;
  projectId: string;
};

const CATEGORY_KEYS: AssetCreateCategory[] = ["character", "prop", "scene", "reference"];
const SOURCE_KEYS: AssetCreateSource[] = ["global", "local", "ai"];
const GLOBAL_CATEGORY_KEYS: AssetCreateCategory[] = ["character", "prop", "scene"];

type GlobalAssetEntry = {
  children: string[];
  displayImage: ProjectImageAsset | null;
  id: string;
  image: ProjectImageAsset | null;
};

function getAssetGroups(projectAssets: ProjectAssets | undefined, category: AssetCreateCategory) {
  if (!projectAssets) return [];
  if (category === "character") return projectAssets.characters;
  if (category === "scene") return projectAssets.scenes;
  if (category === "prop") return projectAssets.props;
  return [];
}

function getImageById(images: ProjectImageAsset[], imageId: string) {
  return images.find((image) => image.id === imageId) ?? null;
}

function getDisplayImage(images: ProjectImageAsset[], assetId: string, childIds: string[]) {
  const ownImage = getImageById(images, assetId);
  if (ownImage) return ownImage;

  return childIds.map((childId) => getImageById(images, childId)).find(Boolean) ?? null;
}

function getFileHelp(file: File | null, fallback: string) {
  if (!file) return fallback;
  return file.name;
}

export function AssetCreateDialog({
  hiddenSources = [],
  images,
  libraryImage,
  onCreated,
  onImported,
  onProjectUpdated,
  onOpenChange,
  open,
  projectAssets,
  projectId,
}: AssetCreateDialogProps) {
  const t = useTranslations("AssetCreate");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<AssetCreateMode>("choose-source");
  const [source, setSource] = useState<AssetCreateSource>("local");
  const [category, setCategory] = useState<AssetCreateCategory>("character");
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [parentCharacterId, setParentCharacterId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [name, setName] = useState(libraryImage?.name ?? "");
  const [prompt, setPrompt] = useState(libraryImage?.prompt ?? "");
  const [saving, setSaving] = useState(false);
  const filePreviewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  const sourceOptions = SOURCE_KEYS.filter((item) => !hiddenSources.includes(item));
  const isLibraryMode = Boolean(libraryImage);

  const selectableAssets = useMemo<GlobalAssetEntry[]>(() => {
    if (category === "reference") {
      return images.map((image) => ({
        children: [],
        displayImage: image,
        id: image.id,
        image,
      }));
    }

    return getAssetGroups(projectAssets, category).map((asset) => ({
      children: asset.children,
      displayImage: getDisplayImage(images, asset.id, asset.children),
      id: asset.id,
      image: getImageById(images, asset.id),
    }));
  }, [category, images, projectAssets]);
  const selectedCharacter = projectAssets?.characters.find(
    (asset) => asset.id === selectedCharacterId,
  );
  const selectedCharacterOptions = useMemo<GlobalAssetEntry[]>(() => {
    if (!selectedCharacter) return [];

    return selectedCharacter.children.map((childId) => ({
      children: [],
      displayImage: getImageById(images, childId),
      id: childId,
      image: getImageById(images, childId),
    }));
  }, [images, selectedCharacter]);

  useEffect(() => {
    if (!filePreviewUrl) return;

    return () => {
      URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  const closeDialog = () => {
    onOpenChange(false);
    setMode(isLibraryMode ? "form" : "choose-source");
    setSelectedCharacterId(null);
    setParentCharacterId("");
    setPreviewFailed(false);
    setSaving(false);
  };

  const submitForm = async () => {
    if (saving || (!isLibraryMode && !name.trim()) || !projectId) return;

    setSaving(true);
    try {
      if (libraryImage) {
        const project = await addProjectImageToAssets(projectId, {
          category,
          imageId: libraryImage.id,
          parentId:
            category === "character" && parentCharacterId !== "__root__"
              ? parentCharacterId
              : undefined,
        });
        onProjectUpdated?.(project);
        closeDialog();
        return;
      }

      const result = await createProjectImage(projectId, {
        category,
        file,
        name: name.trim(),
        parentId:
          category === "character" && parentCharacterId !== "__root__"
            ? parentCharacterId
            : undefined,
        prompt: prompt.trim(),
        source,
      });
      onCreated?.(result.image, result.images);
      if (result.project) onProjectUpdated?.(result.project);
      closeDialog();
      setFile(null);
      setName("");
      setPrompt("");
    } catch {
      setSaving(false);
    }
  };
  const displayMode: AssetCreateMode = isLibraryMode ? "form" : mode;
  const formName = libraryImage?.name ?? name;
  const formPrompt = libraryImage?.prompt ?? prompt;
  const libraryImageSource = getSafeMediaSource(libraryImage?.url);
  const renderAssetRow = (entry: GlobalAssetEntry, onClick: () => void) => {
    const matchedImage = entry.displayImage;
    const label = matchedImage?.name || t("global.unmatchedTitle");
    const childCount = entry.children.length;
    const canSelect = Boolean(matchedImage) || (category === "character" && childCount > 0);
    const imageSource = getSafeMediaSource(matchedImage?.url);

    return (
    <button
      key={entry.id}
      type="button"
      disabled={!canSelect}
      className={cn(
        "group grid min-h-16 grid-cols-[3.5rem_1fr_auto] items-center gap-3 rounded-md border border-border bg-card p-2 text-left transition-colors hover:border-primary hover:bg-accent",
        !canSelect && "cursor-not-allowed opacity-60 hover:border-border hover:bg-card",
      )}
      onClick={onClick}
    >
      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted/40">
        {imageSource ? (
          <Image
            src={imageSource}
            alt={label}
            fill
            sizes="56px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <ImageIcon className="size-6 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{label}</span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">
          {matchedImage ? matchedImage.type : t("global.unmatchedDescription", { id: entry.id })}
          {childCount > 0 ? t("global.childCount", { count: childCount }) : ""}
        </span>
      </div>
      {category === "character" && childCount > 0 ? (
        <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary" />
      ) : null}
    </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : closeDialog())}>
      <DialogContent
        className="w-[min(92vw,520px)] border-border bg-card p-0 text-card-foreground shadow-2xl"
        showCloseButton
      >
        {displayMode === "choose-source" && !isLibraryMode ? (
          <>
            <DialogHeader className="border-border px-5 py-4">
              <DialogTitle className="text-base">{t("source.title")}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2 p-3">
              {sourceOptions.map((item) => {
                const Icon: ComponentType<{ className?: string }> =
                  item === "global" ? FolderInput : item === "local" ? Upload : Bot;
                return (
                  <button
                    key={item}
                    type="button"
                    className="group grid min-h-16 grid-cols-[2rem_1fr_auto] items-center gap-2 rounded-lg border border-border bg-background/40 px-3 text-left transition-colors hover:border-primary hover:bg-accent"
                    onClick={() => {
                      setSource(item);
                      setMode(item === "global" ? "global" : "form");
                    }}
                  >
                    <span className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-primary">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {t(`source.${item}.title`)}
                      </span>
                      <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                        {t(`source.${item}.description`)}
                      </span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary" />
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {displayMode === "global" ? (
          <>
            <DialogHeader className="border-border px-5 py-4">
              <div className="flex items-center gap-2 pr-8">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-7 text-foreground hover:bg-accent"
                  onClick={() => {
                    setMode("choose-source");
                    setSelectedCharacterId(null);
                  }}
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <div className="min-w-0">
                  <DialogTitle className="text-base">{t("global.title")}</DialogTitle>
                </div>
              </div>
            </DialogHeader>
            <div className="px-4 pt-4">
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                {GLOBAL_CATEGORY_KEYS.map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "h-8 rounded-md text-xs text-foreground hover:bg-background",
                    category === item && "bg-background text-foreground shadow-sm",
                  )}
                  onClick={() => {
                    setCategory(item);
                    setSelectedCharacterId(null);
                  }}
                >
                  {t(`category.${item}`)}
                </Button>
                ))}
              </div>
            </div>
            {category === "character" && selectedCharacterId ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mx-4 mt-3 w-fit gap-2 text-xs text-foreground hover:bg-accent"
                onClick={() => setSelectedCharacterId(null)}
              >
                <ArrowLeft className="size-4" />
                {t("global.back")}
              </Button>
            ) : null}
            <ScrollArea className="h-80 px-4 py-3">
              <div className="grid gap-2 pr-2">
                {(category === "character" && selectedCharacterId
                  ? selectedCharacterOptions
                  : selectableAssets
                ).map((entry) =>
                  renderAssetRow(entry, () => {
                      if (category === "character" && !selectedCharacterId && entry.children.length > 0) {
                        setSelectedCharacterId(entry.id);
                        return;
                      }
                      if (!entry.image) return;
                      onImported?.(entry.image);
                      closeDialog();
                    }),
                )}
              </div>
              {(category === "character" && selectedCharacterId
                ? selectedCharacterOptions.length
                : selectableAssets.length) === 0 ? (
                <div className="rounded-md border border-dashed border-border px-3 py-10 text-center text-xs text-muted-foreground">
                  {t("global.empty")}
                </div>
              ) : null}
            </ScrollArea>
          </>
        ) : null}

        {displayMode === "form" ? (
          <>
            <DialogHeader className="border-border px-5 py-4">
              <div className="flex items-center gap-2 pr-8">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-7 text-foreground hover:bg-accent"
                  onClick={() => setMode("choose-source")}
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <div className="min-w-0">
                  <DialogTitle className="text-base">
                    {isLibraryMode ? t("form.libraryTitle") : t("form.title")}
                  </DialogTitle>
                </div>
              </div>
            </DialogHeader>
            <ScrollArea className="max-h-[min(62vh,420px)]">
              <div className="grid gap-4 px-5 py-4 pr-6">
                <div className="grid grid-cols-[88px_1fr] gap-4">
                  <button
                    type="button"
                    disabled={isLibraryMode}
                    className={cn(
                      "relative flex aspect-square items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted/40 text-muted-foreground transition-colors hover:border-primary hover:text-primary",
                      isLibraryMode && "cursor-not-allowed opacity-60 hover:border-border hover:text-muted-foreground",
                    )}
                    onClick={() => {
                      if (!isLibraryMode) fileInputRef.current?.click();
                    }}
                  >
                    {libraryImageSource && !previewFailed ? (
                      <Image
                        src={libraryImageSource}
                        alt={libraryImage?.name ?? formName}
                        fill
                        className="object-cover"
                        unoptimized
                        onError={() => setPreviewFailed(true)}
                      />
                    ) : filePreviewUrl ? (
                      <Image
                        src={filePreviewUrl}
                        alt={file?.name ?? ""}
                        fill
                        className="object-cover"
                        unoptimized
                        onError={() => setPreviewFailed(true)}
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <ImageIcon className="size-5" />
                        <span className="text-[10px]">{t("form.imageError")}</span>
                      </div>
                    )}
                  </button>
                  <div
                    className={cn(
                      "flex min-w-0 flex-col justify-center gap-1 text-xs",
                      isLibraryMode && "opacity-60",
                    )}
                  >
                    <span className="truncate font-medium text-foreground">
                      {libraryImage?.name || getFileHelp(file, t("form.uploadHint"))}
                    </span>
                    <span className="leading-4 text-muted-foreground">{t("form.uploadRule")}</span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                <div className="grid grid-cols-[88px_1fr] items-center gap-4">
                  <Label className="text-xs text-muted-foreground">{t("form.category")}</Label>
                  <Select
                    value={category}
                    onValueChange={(value) => setCategory(value as AssetCreateCategory)}
                  >
                    <SelectTrigger className="h-8 w-full rounded-md border-border bg-input/30 text-xs text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_KEYS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {t(`category.${item}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {category === "character" ? (
                  <div className="grid grid-cols-[88px_1fr] items-center gap-4">
                    <Label className="text-xs text-muted-foreground">{t("form.parentCharacter")}</Label>
                    <Select value={parentCharacterId} onValueChange={setParentCharacterId}>
                      <SelectTrigger className="h-8 w-full rounded-md border-border bg-input/30 text-xs text-foreground">
                        <SelectValue placeholder={t("form.parentCharacterPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__root__">{t("form.parentCharacterPlaceholder")}</SelectItem>
                        {projectAssets?.characters.map((asset) => {
                          const image = getImageById(images, asset.id);
                          return (
                            <SelectItem key={asset.id} value={asset.id}>
                              {image?.name || t("global.unmatchedDescription", { id: asset.id })}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div className="grid grid-cols-[88px_1fr] items-center gap-4">
                  <Label className="text-xs text-muted-foreground">{t("form.name")}</Label>
                  <Input
                    value={formName}
                    onChange={(event) => setName(event.target.value)}
                    disabled={isLibraryMode}
                    placeholder={t("form.namePlaceholder")}
                    className="h-8 rounded-md border-border bg-input/30 text-xs text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                <div className="grid grid-cols-[88px_1fr] items-start gap-4">
                  <Label className="pt-2 text-xs text-muted-foreground">{t("form.prompt")}</Label>
                  <Textarea
                    value={formPrompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    disabled={isLibraryMode}
                    placeholder={t("form.promptPlaceholder")}
                    className="min-h-24 resize-none rounded-md border-border bg-input/30 text-xs text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>
            </ScrollArea>
            <DialogFooter className="border-t border-border px-5 py-3">
              <Button
                type="button"
                className="h-8 rounded-md bg-primary px-3 text-xs text-foreground hover:bg-primary/90"
                disabled={saving || (!isLibraryMode && !name.trim())}
                onClick={submitForm}
              >
                {saving ? t("form.saving") : t("form.confirm")}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
