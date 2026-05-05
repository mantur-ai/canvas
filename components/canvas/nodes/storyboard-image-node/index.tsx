"use client";

import { useTranslations } from "next-intl";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { type StoryboardMediaNodeData, useCanvasStore } from "@/store/use-canvas-store";
import { NODE_WIDTH_CLASS } from "../constants";
import { MediaGrid } from "../media-grid";

type StoryboardImageNodeType = Node<StoryboardMediaNodeData, "storyboard-image-node">;

export function StoryboardImageNode({ data, id, selected }: NodeProps<StoryboardImageNodeType>) {
  const t = useTranslations("Canvas");
  const activeNodeId = useCanvasStore((state) => state.selectedMediaGridItem?.nodeId);
  const active = selected || activeNodeId === id;

  return (
    <div className={cn("relative", NODE_WIDTH_CLASS)}>
      <Handle type="target" position={Position.Left} className="bg-primary!" />
      <div className="flex max-w-62.5 items-center gap-2 pb-2">
        <span className="shrink-0 text-xs font-semibold leading-none text-foreground">
          {t("storyboardImage.title")}
        </span>
        <span className="truncate rounded-3xl border border-border  px-1.5 py-0.5 text-xs leading-none text-foreground shadow-sm bg-primary ">
          {data.title}
        </span>
      </div>

      <MediaGrid
        active={active}
        addLabel={t("storyboardImage.add")}
        items={data.items}
        mediaType={data.mediaType}
        nodeId={id}
        scenePrompt={data.prompt}
        sceneTitle={data.title}
        sceneId={data.sceneId}
        selectedVideoId={data.selectedVideoId}
        showItemNames
      />
      <Handle type="source" position={Position.Right} className="bg-primary! " />
    </div>
  );
}
