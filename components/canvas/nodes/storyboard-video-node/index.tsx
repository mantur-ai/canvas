"use client";

import { useTranslations } from "next-intl";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { type StoryboardMediaNodeData, useCanvasStore } from "@/store/use-canvas-store";
import { NODE_WIDTH_CLASS } from "../constants";
import { MediaGrid } from "../media-grid";

type StoryboardVideoNodeType = Node<StoryboardMediaNodeData, "storyboard-video-node">;

export function StoryboardVideoNode({ data, id, selected }: NodeProps<StoryboardVideoNodeType>) {
  const t = useTranslations("Canvas");
  const activeNodeId = useCanvasStore((state) => state.selectedMediaGridItem?.nodeId);
  const active = selected || activeNodeId === id;

  return (
    <div className={cn("relative", NODE_WIDTH_CLASS)}>
      <Handle type="target" position={Position.Left} className="bg-primary!" />
      <div className="flex max-w-62.5 items-center gap-2 pb-2">
        <span className="shrink-0 text-xs font-bold leading-none text-foreground">
          {t("storyboardVideo.title")}
        </span>
        <span className="truncate  rounded-3xl border border-border bg-primary px-1.5 py-0.5 text-xs leading-none text-foreground shadow-sm">
          {data.title}
        </span>
      </div>

      <MediaGrid
        active={active}
        addLabel={t("storyboardVideo.add")}
        items={data.items}
        mediaType={data.mediaType}
        nodeId={id}
        scenePrompt={data.prompt}
        sceneTitle={data.title}
        sceneId={data.sceneId}
        selectedVideoId={data.selectedVideoId}
        showItemNames={false}
      />
      <Handle type="source" position={Position.Right} className="bg-primary!" />
    </div>
  );
}
