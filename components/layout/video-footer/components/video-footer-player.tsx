"use client";

import { X } from "lucide-react";
import { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import type { ProjectVideoAsset } from "@/lib/project-types";

type VideoFooterPlayerProps = {
  closeLabel: string;
  onEnded: () => void;
  onClose: () => void;
  onTimeUpdate: () => void;
  video: ProjectVideoAsset;
};

export const VideoFooterPlayer = forwardRef<HTMLVideoElement, VideoFooterPlayerProps>(
  function VideoFooterPlayer({ closeLabel, onClose, onEnded, onTimeUpdate, video }, ref) {
    return (
      <div className="fixed bottom-[12.75rem] right-5 z-30 aspect-video w-[min(42vw,420px)] overflow-hidden rounded-lg border border-border bg-black shadow-2xl">
        <Button
          type="button"
          size="icon-xs"
          variant="secondary"
          aria-label={closeLabel}
          className="absolute right-2 top-2 z-10 rounded-full bg-background/80 shadow-md"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
        <video
          ref={ref}
          className="size-full object-contain"
          controls={false}
          onEnded={onEnded}
          onTimeUpdate={onTimeUpdate}
          playsInline
          poster={video.cover || video.coverUrl || video.poster}
          src={video.url}
        />
      </div>
    );
  },
);
