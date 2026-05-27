"use client";

import { useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { STORYBOARD_PARSE_USER_PROMPT } from "@/lib/chat-prompts";
import { fetchProjectCanvasData, saveProjectEpisodeStoryboards } from "@/lib/project-api";
import type { ProjectStoryboard } from "@/lib/project-types";
import { cn } from "@/lib/utils";
import { type StoryboardListNodeData, useCanvasStore } from "@/store/use-canvas-store";
import { NODE_WIDTH_CLASS } from "../constants";

// ReactFlow honors nodrag/nowheel classes, keeping inner node scrolling separate from canvas gestures.
const NODE_SCROLL_AREA_CLASS =
  "nodrag nowheel overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-xl transition-[border-color,box-shadow] duration-200";
const NODE_SCROLL_CONTENT_CLASS = "flex flex-col gap-2 p-2 ";
const NODE_SCROLL_BAR_CLASS = "nodrag data-vertical:w-4 data-horizontal:h-4 p-1";
const NODE_SCROLL_THUMB_CLASS =
  "bg-muted-foreground/55 transition-colors hover:bg-muted-foreground/80";
const NODE_EMPTY_STATE_CLASS =
  "bg-card flex h-105 border border-border rounded-2xl flex-col items-center justify-center gap-3 text-xs text-muted-foreground";

type StoryboardListNodeType = Node<StoryboardListNodeData, "storyboard-list-node">;
type StoryboardEditForm = Pick<
  ProjectStoryboard,
  "description" | "name" | "prompt" | "videoPrompt"
>;

const EMPTY_STORYBOARD_EDIT_FORM: StoryboardEditForm = {
  description: "",
  name: "",
  prompt: "",
  videoPrompt: "",
};

function getEpisodeNumber(episodeName: string) {
  return episodeName.match(/第\s*(\d+)\s*集/u)?.[1] ?? "";
}

function formatStoryboardDisplayName(sequenceLabel: string, businessName: string) {
  const trimmedBusinessName = businessName.trim();
  return trimmedBusinessName ? `${sequenceLabel} · ${trimmedBusinessName}` : sequenceLabel;
}

export function StoryboardListNode({ data, selected }: NodeProps<StoryboardListNodeType>) {
  const t = useTranslations("Canvas");
  const { execute: executeSilentAgentCommand } = useSilentAgentCommand();
  const [editError, setEditError] = useState("");
  const [editForm, setEditForm] = useState<StoryboardEditForm>(EMPTY_STORYBOARD_EDIT_FORM);
  const [editingStoryboardId, setEditingStoryboardId] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const addStoryboard = useCanvasStore((state) => state.addStoryboard);
  const commandStatus = useCanvasStore((state) => state.commandStatuses[data.episodeId]);
  const currentProject = useCanvasStore((state) => state.currentProject);
  const deleteStoryboard = useCanvasStore((state) => state.deleteStoryboard);
  const moveStoryboard = useCanvasStore((state) => state.moveStoryboard);
  const activeEpisodeId = useCanvasStore((state) => state.activeEpisodeId);
  const activeStoryboardId = useCanvasStore((state) => state.activeStoryboardId);
  const selectedStoryboardIds = useCanvasStore((state) => state.selectedStoryboardIds);
  const setActiveStoryboardId = useCanvasStore((state) => state.setActiveStoryboardId);
  const setProjectCanvasData = useCanvasStore((state) => state.setProjectCanvasData);
  const toggleStoryboardSelection = useCanvasStore((state) => state.toggleStoryboardSelection);
  const updateStoryboard = useCanvasStore((state) => state.updateStoryboard);
  const storyboardCommandLoading = commandStatus === "loading";
  const active = selected || activeEpisodeId === data.episodeId;
  const pendingDeleteStoryboard = data.storyboards.find(
    (storyboard) => storyboard.id === pendingDeleteId,
  );
  const pendingDeleteIndex = pendingDeleteId
    ? data.storyboards.findIndex((storyboard) => storyboard.id === pendingDeleteId)
    : -1;
  const pendingDeleteName =
    pendingDeleteStoryboard && pendingDeleteIndex >= 0
      ? formatStoryboardDisplayName(
          t("storyboardList.sequenceLabel", { index: pendingDeleteIndex + 1 }),
          pendingDeleteStoryboard.name,
        )
      : "";

  const toggleSelectedStoryboard = (storyboardId: string) => {
    setActiveStoryboardId(storyboardId);
    toggleStoryboardSelection(storyboardId);
  };

  const openStoryboardEditor = (storyboard: ProjectStoryboard) => {
    setEditError("");
    setEditForm({
      description: storyboard.description,
      name: storyboard.name,
      prompt: storyboard.prompt,
      videoPrompt: storyboard.videoPrompt,
    });
    setEditingStoryboardId(storyboard.id);
  };

  const handleAddStoryboard = (afterStoryboardId?: string) => {
    const storyboardId = addStoryboard(data.episodeId, afterStoryboardId);
    if (!storyboardId) return;

    setActiveStoryboardId(storyboardId);
    setEditError("");
    setEditForm(EMPTY_STORYBOARD_EDIT_FORM);
    setEditingStoryboardId(storyboardId);
  };

  const handleSaveStoryboard = async () => {
    if (!currentProject || !editingStoryboardId) return;

    const episodeCanvasData = useCanvasStore.getState().currentCanvasDataByEpisode[data.episodeId];
    if (!episodeCanvasData) return;

    const updates: StoryboardEditForm = {
      description: editForm.description.trim(),
      name: editForm.name.trim(),
      prompt: editForm.prompt.trim(),
      videoPrompt: editForm.videoPrompt.trim(),
    };
    const nextStoryboards = episodeCanvasData.data.storyboards.map((storyboard) =>
      storyboard.id === editingStoryboardId
        ? {
            ...storyboard,
            ...updates,
          }
        : storyboard,
    );

    setIsSavingEdit(true);
    setEditError("");
    try {
      await saveProjectEpisodeStoryboards(
        currentProject.id,
        data.episodeId,
        nextStoryboards.map((storyboard) => ({
          description: storyboard.description,
          id: storyboard.id,
          name: storyboard.name,
          prompt: storyboard.prompt,
          videoPrompt: storyboard.videoPrompt,
        })),
      );
      updateStoryboard(editingStoryboardId, updates);
      const canvasData = await fetchProjectCanvasData(currentProject.id, data.episodeId);
      setProjectCanvasData(currentProject.id, data.episodeId, canvasData);
      setEditingStoryboardId(null);
    } catch {
      setEditError(t("storyboardList.saveError"));
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleStoryboardKeyDown = (event: KeyboardEvent<HTMLDivElement>, storyboardId: string) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    toggleSelectedStoryboard(storyboardId);
  };
  const handleParseStoryboard = () => {
    if (!currentProject?.assetsParsed) {
      return;
    }

    void (async () => {
      try {
        const episodeNumber = getEpisodeNumber(data.episodeName);

        await executeSilentAgentCommand(
          {
            attachments: [],
            html: "",
            text: [
              STORYBOARD_PARSE_USER_PROMPT,
              `Selected episode ID: ${data.episodeId}.`,
              `Selected episode name: ${data.episodeName}.`,
              episodeNumber ? `Selected episode number: ${episodeNumber}.` : "",
              "Episode section rule: in script.md, start at the markdown heading matching the selected episode name or episode number, for example `### 第5集 布局`; stop before the next episode heading or before a following top-level/outline section such as `## 五、后续剧情大纲`.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
          {
            featureSkill: "storyboard-parse",
            mediaId: data.episodeId,
            mediaName: data.episodeName,
            mediaType: "storyboard-list",
            scope: "storyboard-list",
          },
        );
        const canvasData = await fetchProjectCanvasData(currentProject.id, data.episodeId);
        setProjectCanvasData(currentProject.id, data.episodeId, canvasData);
      } catch {
        // Storyboard data can be refreshed by rerunning parse or switching episodes.
      }
    })();
  };

  return (
    <div className={cn("relative", NODE_WIDTH_CLASS)}>
      <div className="flex w-full max-w-62.5 items-center gap-2 pb-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-xs font-bold text-foreground">
            {t("storyboardList.title")}
          </span>
          <span
            className="block min-w-0 max-w-full flex-1 truncate rounded-3xl border border-border bg-primary px-1.5 py-0.5 text-xs text-foreground shadow-sm"
            title={data.episodeName}
          >
            {data.episodeName}
          </span>
        </div>
        <Button
          type="button"
          size="icon-xs"
          variant="outline"
          aria-label={t("storyboardList.addAfterCurrent")}
          className="nodrag shrink-0 bg-card"
          onClick={(event) => {
            event.stopPropagation();
            const afterStoryboardId = data.storyboards.some(
              (storyboard) => storyboard.id === activeStoryboardId,
            )
              ? activeStoryboardId
              : undefined;
            handleAddStoryboard(afterStoryboardId);
          }}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      <div>
        {data.storyboards.length > 0 ? (
          <ScrollArea
            className={cn(
              NODE_SCROLL_AREA_CLASS,
              "h-105 ",
              active ? "border-foreground/45" : "border-border",
            )}
            scrollBarClassName={NODE_SCROLL_BAR_CLASS}
            thumbClassName={NODE_SCROLL_THUMB_CLASS}
          >
            <div className={NODE_SCROLL_CONTENT_CLASS}>
              {data.storyboards.map((storyboard, index) => {
                const selected = selectedStoryboardIds.includes(storyboard.id);
                const sequenceLabel = t("storyboardList.sequenceLabel", { index: index + 1 });
                const storyboardName = formatStoryboardDisplayName(sequenceLabel, storyboard.name);

                return (
                  <div
                    key={storyboard.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    onClick={() => toggleSelectedStoryboard(storyboard.id)}
                    onKeyDown={(event) => handleStoryboardKeyDown(event, storyboard.id)}
                    className={cn(
                      "group relative w-full cursor-pointer overflow-hidden rounded-xl border bg-muted text-left transition-colors",
                      selected ? "border-primary bg-primary/10 " : "border-border hover:bg-accent",
                    )}
                  >
                    <div className="mb-1 flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "block max-w-full truncate rounded-br-xl px-2 py-0.5 text-xs font-medium",
                          selected
                            ? "bg-primary text-primary-foreground"
                            : "bg-card text-muted-foreground group-hover:bg-muted-foreground/20",
                        )}
                        title={storyboardName}
                      >
                        {storyboardName}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-3 h-15  text-[10px] leading-4 text-muted-foreground p-1">
                      {storyboard.description}
                    </p>
                    <div className="nodrag absolute bottom-1.5 right-1.5 z-10 flex items-center gap-1 rounded-full border border-border bg-card/95 p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={t("storyboardList.edit", { name: storyboardName })}
                        className="size-6 rounded-full text-muted-foreground hover:text-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          openStoryboardEditor(storyboard);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={t("storyboardList.add")}
                        className="size-6 rounded-full text-muted-foreground hover:text-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleAddStoryboard(storyboard.id);
                        }}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={index === 0}
                        aria-label={t("storyboardList.moveUp", { name: storyboardName })}
                        className="size-6 rounded-full text-muted-foreground hover:text-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          moveStoryboard(storyboard.id, -1);
                        }}
                      >
                        <ChevronUp className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={index === data.storyboards.length - 1}
                        aria-label={t("storyboardList.moveDown", { name: storyboardName })}
                        className="size-6 rounded-full text-muted-foreground hover:text-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          moveStoryboard(storyboard.id, 1);
                        }}
                      >
                        <ChevronDown className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={t("storyboardList.delete", { name: storyboardName })}
                        className="size-6 rounded-full text-destructive hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          setPendingDeleteId(storyboard.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
          <div className={NODE_EMPTY_STATE_CLASS}>
            <span>{t("storyboardList.empty")}</span>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "inline-flex rounded-md",
                      !currentProject?.assetsParsed && "cursor-not-allowed",
                    )}
                  >
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!currentProject?.assetsParsed || storyboardCommandLoading}
                      className="gap-2 bg-transparent disabled:pointer-events-none"
                      onClick={handleParseStoryboard}
                    >
                      {storyboardCommandLoading ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : null}
                      {t("storyboardList.parse")}
                    </Button>
                  </span>
                </TooltipTrigger>
                {!currentProject?.assetsParsed ? (
                  <TooltipContent side="top">{t("storyboardList.parseAssetsFirst")}</TooltipContent>
                ) : null}
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="bg-primary!" />
      <Dialog
        open={editingStoryboardId !== null}
        onOpenChange={(open) => {
          if (!open && !isSavingEdit) setEditingStoryboardId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("storyboardList.editTitle")}</DialogTitle>
            <DialogDescription>{t("storyboardList.editDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                {t("storyboardList.businessName")}
              </span>
              <Input
                value={editForm.name}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder={t("storyboardList.namePlaceholder")}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                {t("storyboardList.description")}
              </span>
              <Textarea
                value={editForm.description}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder={t("storyboardList.descriptionPlaceholder")}
                className="min-h-20"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                {t("storyboardList.prompt")}
              </span>
              <Textarea
                value={editForm.prompt}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    prompt: event.target.value,
                  }))
                }
                placeholder={t("storyboardList.promptPlaceholder")}
                className="min-h-24"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                {t("storyboardList.videoPrompt")}
              </span>
              <Textarea
                value={editForm.videoPrompt}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    videoPrompt: event.target.value,
                  }))
                }
                placeholder={t("storyboardList.videoPromptPlaceholder")}
                className="min-h-24"
              />
            </label>
            {editError ? <p className="text-xs text-destructive">{editError}</p> : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSavingEdit}>
                {t("storyboardList.cancel")}
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => void handleSaveStoryboard()}
              disabled={isSavingEdit}
            >
              {isSavingEdit ? t("storyboardList.saving") : t("storyboardList.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("storyboardList.confirmDeleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("storyboardList.confirmDeleteDescription", {
                name: pendingDeleteName,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("storyboardList.cancel")}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (pendingDeleteId) deleteStoryboard(pendingDeleteId);
                setPendingDeleteId(null);
              }}
            >
              {t("storyboardList.confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
