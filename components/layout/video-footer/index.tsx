"use client";

import { Combine, Download, Film, LoaderCircle, Pause, Play, Video, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { clearProjectStoryboardSelectedVideo, mergeProjectVideos } from "@/lib/project-api";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/use-canvas-store";
import { useLayoutStore } from "@/store/use-layout-store";
import { VideoFooterCard } from "./components/video-footer-card";
import { VideoFooterPlayer } from "./components/video-footer-player";
import {
  useActiveEpisodeSelectedVideos,
  type SelectedStoryboardVideo,
} from "./use-active-episode-selected-videos";

type TimelineVideo = SelectedStoryboardVideo & {
  durationSeconds: number | null;
  layoutSeconds: number;
  startSeconds: number;
};

const FALLBACK_SEGMENT_SECONDS = 3;
const SLIDER_THUMB_SIZE_PIXELS = 12;
const INVALID_FILE_NAME_PATTERN = new RegExp(String.raw`[<>:"/\\|?*\u0000-\u001f]`, "g");

type WritableFileStream = {
  close: () => Promise<void>;
  write: (data: Blob) => Promise<void>;
};

type WritableFileHandle = {
  createWritable: () => Promise<WritableFileStream>;
};

type FileSystemPermissionDescriptor = {
  mode: "read" | "readwrite";
};

type WritableDirectoryHandle = {
  getDirectoryHandle: (
    name: string,
    options: { create: boolean },
  ) => Promise<WritableDirectoryHandle>;
  getFileHandle: (name: string, options: { create: boolean }) => Promise<WritableFileHandle>;
  queryPermission?: (descriptor: FileSystemPermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (descriptor: FileSystemPermissionDescriptor) => Promise<PermissionState>;
};

type DirectoryPickerWindow = Window &
  typeof globalThis & {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
    }) => Promise<WritableDirectoryHandle>;
  };

function sanitizeFileName(name: string) {
  return name.replace(INVALID_FILE_NAME_PATTERN, "_").trim() || "video";
}

function getVideoExtension(name: string, url: string) {
  const source = name || url;
  const match = source.match(/\.(mp4|mov|webm|m4v)$/i);
  return match ? `.${match[1].toLowerCase()}` : ".mp4";
}

function formatDownloadTimestamp(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function pickDirectory() {
  const showDirectoryPicker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!showDirectoryPicker) throw new Error("DIRECTORY_PICKER_UNSUPPORTED");

  const directory = await showDirectoryPicker({ mode: "readwrite" });
  const permissionDescriptor: FileSystemPermissionDescriptor = { mode: "readwrite" };
  const permission = await directory.queryPermission?.(permissionDescriptor);
  if (permission === "granted" || !directory.requestPermission) return directory;

  const requestedPermission = await directory.requestPermission(permissionDescriptor);
  if (requestedPermission !== "granted") throw new Error("DIRECTORY_PERMISSION_DENIED");

  return directory;
}

function getMergeErrorMessage(error: unknown, t: ReturnType<typeof useTranslations>) {
  if (!(error instanceof Error)) return t("mergeError");

  if (error.message === "VIDEO_FILE_NOT_FOUND") return t("mergeErrors.videoFileNotFound");
  if (error.message === "VIDEO_NOT_FOUND") return t("mergeErrors.videoNotFound");
  if (error.message === "PROJECT_VIDEO_MERGE_FAILED") return t("mergeError");
  if (
    error.message === "DIRECTORY_PICKER_UNSUPPORTED" ||
    error.message === "DIRECTORY_PERMISSION_DENIED"
  ) {
    return t("mergeErrors.directoryAccess");
  }

  return t("mergeError");
}

async function writeBlobToDirectory(
  directory: WritableDirectoryHandle,
  fileName: string,
  blob: Blob,
) {
  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function fetchVideoBlob(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("VIDEO_DOWNLOAD_FAILED");

  return response.blob();
}

function parseVideoDuration(duration: string) {
  const value = duration.trim().toLowerCase();
  if (!value) return null;

  const numericDuration = Number(value.replace(/s$/, ""));
  if (Number.isFinite(numericDuration) && numericDuration > 0) return numericDuration;

  const timeParts = value.split(":").map((part) => Number(part));
  if (
    timeParts.length >= 2 &&
    timeParts.length <= 3 &&
    timeParts.every((part) => Number.isFinite(part) && part >= 0)
  ) {
    return timeParts.reduce((total, part) => total * 60 + part, 0);
  }

  return null;
}

function formatTimelineTime(seconds: number) {
  const roundedSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const remainingSeconds = roundedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function VideoFooter() {
  const t = useTranslations("Sidebar.videoFooter");
  const open = useLayoutStore((state) => state.videoFooterOpen);
  const onClose = useLayoutStore((state) => state.closeVideoFooter);
  const toggleVideoFooter = useLayoutStore((state) => state.toggleVideoFooter);
  const clearStoryboardSelectedVideo = useCanvasStore(
    (state) => state.clearStoryboardSelectedVideo,
  );
  const { activeEpisode, currentProjectId, selectedVideos } = useActiveEpisodeSelectedVideos();
  const [playback, setPlayback] = useState({ playheadSeconds: 0, playing: false });
  const [playerVisible, setPlayerVisible] = useState(false);
  const [pendingDeleteVideo, setPendingDeleteVideo] = useState<SelectedStoryboardVideo | null>(
    null,
  );
  const [busyAction, setBusyAction] = useState<"download" | "merge" | null>(null);
  const playerRef = useRef<HTMLVideoElement>(null);

  const timelineVideos = useMemo<TimelineVideo[]>(() => {
    return selectedVideos.reduce<{ elapsedSeconds: number; items: TimelineVideo[] }>(
      (timeline, item) => {
        const durationSeconds = parseVideoDuration(item.video.duration);
        const layoutSeconds = durationSeconds ?? FALLBACK_SEGMENT_SECONDS;

        return {
          elapsedSeconds: timeline.elapsedSeconds + layoutSeconds,
          items: [
            ...timeline.items,
            {
              ...item,
              durationSeconds,
              layoutSeconds,
              startSeconds: timeline.elapsedSeconds,
            },
          ],
        };
      },
      { elapsedSeconds: 0, items: [] },
    ).items;
  }, [selectedVideos]);
  const totalDurationSeconds = timelineVideos.reduce(
    (total, item) => total + item.layoutSeconds,
    0,
  );
  const roundedTotalDurationSeconds = Math.max(0, Math.round(totalDurationSeconds));
  const visiblePlayheadSeconds = Math.min(playback.playheadSeconds, roundedTotalDurationSeconds);
  const remainingSeconds = Math.max(
    0,
    roundedTotalDurationSeconds - Math.round(visiblePlayheadSeconds),
  );
  const playbackDisabled = roundedTotalDurationSeconds <= 0;
  const playbackPlaying = playback.playing && !playbackDisabled;
  const currentTimelineVideo =
    timelineVideos.find(
      (timelineVideo) =>
        visiblePlayheadSeconds >= timelineVideo.startSeconds &&
        visiblePlayheadSeconds < timelineVideo.startSeconds + timelineVideo.layoutSeconds,
    ) ?? timelineVideos.at(-1);
  const currentVideoStartSeconds = currentTimelineVideo?.startSeconds ?? 0;
  const currentVideoOffsetSeconds = Math.max(0, visiblePlayheadSeconds - currentVideoStartSeconds);
  const exportDisabled =
    !currentProjectId || !activeEpisode || selectedVideos.length === 0 || busyAction !== null;

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !currentTimelineVideo) return;

    if (
      Number.isFinite(currentVideoOffsetSeconds) &&
      Math.abs(player.currentTime - currentVideoOffsetSeconds) > 0.35
    ) {
      player.currentTime = Math.max(0, currentVideoOffsetSeconds);
    }

    if (playbackPlaying) {
      void player.play().catch(() => {
        setPlayback((currentPlayback) => ({ ...currentPlayback, playing: false }));
      });
      return;
    }

    player.pause();
  }, [
    currentTimelineVideo?.video.id,
    currentVideoOffsetSeconds,
    playbackPlaying,
    currentTimelineVideo,
  ]);

  const handlePlayerTimeUpdate = useCallback(() => {
    const player = playerRef.current;
    if (!player || !currentTimelineVideo) return;

    const nextSeconds = Math.min(
      currentTimelineVideo.startSeconds + player.currentTime,
      roundedTotalDurationSeconds,
    );

    setPlayback((currentPlayback) => ({
      ...currentPlayback,
      playheadSeconds: nextSeconds,
    }));
  }, [currentTimelineVideo, roundedTotalDurationSeconds]);

  const handlePlayerEnded = useCallback(() => {
    if (!currentTimelineVideo) return;

    const currentIndex = timelineVideos.findIndex(
      (timelineVideo) =>
        timelineVideo.storyboardId === currentTimelineVideo.storyboardId &&
        timelineVideo.video.id === currentTimelineVideo.video.id,
    );
    const nextTimelineVideo = timelineVideos[currentIndex + 1];

    setPlayback({
      playheadSeconds: nextTimelineVideo?.startSeconds ?? 0,
      playing: Boolean(nextTimelineVideo),
    });
  }, [currentTimelineVideo, timelineVideos]);

  const handleConfirmDeleteSelectedVideo = () => {
    if (!pendingDeleteVideo || !currentProjectId) return;

    const { storyboardId, video } = pendingDeleteVideo;
    clearStoryboardSelectedVideo(storyboardId, video.id);
    setPendingDeleteVideo(null);
    if (currentTimelineVideo?.video.id === video.id) {
      playerRef.current?.pause();
      setPlayback({ playheadSeconds: 0, playing: false });
      setPlayerVisible(false);
    }

    void clearProjectStoryboardSelectedVideo(currentProjectId, storyboardId, video.id).catch(() => {
      // Local state is already updated; another delete attempt can retry persistence.
    });
  };

  const handleMerge = async () => {
    if (exportDisabled || !activeEpisode) return;

    setBusyAction("merge");
    try {
      const directory = await pickDirectory();
      const blob = await mergeProjectVideos(
        currentProjectId,
        selectedVideos.map((item) => item.video.id),
      );
      await writeBlobToDirectory(
        directory,
        `${sanitizeFileName(activeEpisode.episode.name)}-${formatDownloadTimestamp(new Date())}.mp4`,
        blob,
      );
      toast.success(t("mergeSuccess"));
    } catch (error) {
      if (!isAbortError(error)) {
        console.error("[VideoFooter] merge failed", error);
        toast.error(getMergeErrorMessage(error, t));
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownload = async () => {
    if (exportDisabled || !activeEpisode) return;

    setBusyAction("download");
    try {
      const directory = await pickDirectory();
      const episodeDirectory = await directory.getDirectoryHandle(
        sanitizeFileName(activeEpisode.episode.name),
        { create: true },
      );

      await Promise.all(
        selectedVideos.map(async (item, index) => {
          const blob = await fetchVideoBlob(item.video.url);
          const fileName = `${String(index + 1).padStart(2, "0")}-${sanitizeFileName(
            item.storyboardName,
          )}${getVideoExtension(item.video.name, item.video.url)}`;

          await writeBlobToDirectory(episodeDirectory, fileName, blob);
        }),
      );
      toast.success(t("downloadSuccess"));
    } catch (error) {
      if (!isAbortError(error)) toast.error(t("downloadError"));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <>
      {!open ? (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("open")}
                className="fixed bottom-4 left-1/2 z-30 flex size-9 -translate-x-1/2 items-center justify-center rounded-lg border bg-card text-muted-foreground shadow-xl transition-colors hover:bg-accent hover:text-foreground"
                onClick={toggleVideoFooter}
              >
                <Video className="size-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{t("open")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
      {open && playerVisible && currentTimelineVideo?.video.url ? (
        <VideoFooterPlayer
          ref={playerRef}
          closeLabel={t("close")}
          onEnded={handlePlayerEnded}
          onClose={() => {
            playerRef.current?.pause();
            setPlayback((currentPlayback) => ({ ...currentPlayback, playing: false }));
            setPlayerVisible(false);
          }}
          onTimeUpdate={handlePlayerTimeUpdate}
          video={currentTimelineVideo.video}
        />
      ) : null}
      <div
        className={cn(
          "relative w-full border-t border-border bg-card/95 text-card-foreground shadow-[0_-18px_50px_rgba(0,0,0,0.34)] backdrop-blur-md",
          open ? "overflow-visible" : "overflow-hidden",
          !open && "pointer-events-none",
        )}
        style={{
          maxHeight: open ? "12.5rem" : "0rem",
          opacity: open ? 1 : 0,
          transition: "max-height 360ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out",
        }}
        aria-hidden={!open}
      >
        <div className="flex h-50 w-full flex-col px-5 py-3">
          <div className="mb-2 flex shrink-0 items-center gap-2">
            <Film className="size-4 text-primary" />
            <h2 className="max-w-80 truncate text-sm font-semibold">
              {activeEpisode?.episode.name ?? t("emptyTitle")}
            </h2>
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
              {t("count", { count: selectedVideos.length })}
            </span>
            <div className="flex-1" />
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("merge")}
                    disabled={exportDisabled}
                    className={cn(
                      "rounded-full",
                      busyAction === "merge" && "text-primary",
                      busyAction !== null && busyAction !== "merge" && "opacity-60",
                    )}
                    onClick={handleMerge}
                  >
                    {busyAction === "merge" ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Combine className="size-4 transition-transform duration-300 hover:-translate-x-0.5 hover:scale-110" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{t("merge")}</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("download")}
                    disabled={exportDisabled}
                    className={cn("rounded-full", busyAction === "download" && "text-primary")}
                    onClick={handleDownload}
                  >
                    <Download className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{t("download")}</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="secondary"
                    aria-label={t("close")}
                    className="rounded-full border border-border bg-card shadow-sm"
                    onClick={onClose}
                  >
                    <X className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{t("close")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-1">
            {timelineVideos.length > 0 ? (
              <div className="flex h-full min-w-full flex-nowrap items-stretch">
                {timelineVideos.map((timelineVideo) => (
                  <VideoFooterCard
                    key={`${timelineVideo.storyboardId}-${timelineVideo.video.id}`}
                    deleteLabel={t("removeSelectedVideo")}
                    durationLabel={
                      timelineVideo.durationSeconds
                        ? formatTimelineTime(timelineVideo.durationSeconds)
                        : t("unknownDuration")
                    }
                    onDelete={() => setPendingDeleteVideo(timelineVideo)}
                    onSelect={() => {
                      setPlayerVisible(true);
                      setPlayback({
                        playheadSeconds: timelineVideo.startSeconds,
                        playing: false,
                      });
                    }}
                    selected={timelineVideo.selected}
                    storyboardId={timelineVideo.storyboardId}
                    storyboardName={timelineVideo.storyboardName}
                    video={timelineVideo.video}
                    durationWeight={timelineVideo.layoutSeconds}
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-full min-w-full items-center justify-center rounded-md border border-dashed border-border px-4 text-sm text-muted-foreground">
                {t("empty")}
              </div>
            )}
          </div>
          <div
            id="video-footer-total-duration"
            className="mx-auto mt-2 flex h-7 w-full max-w-200 min-w-0 shrink-0 items-center gap-3"
          >
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={playbackPlaying ? t("pause") : t("play")}
              disabled={playbackDisabled}
              className="shrink-0 rounded-full border border-border bg-background/70"
              onClick={() => {
                setPlayerVisible(true);
                setPlayback((currentPlayback) => ({
                  playheadSeconds:
                    visiblePlayheadSeconds >= roundedTotalDurationSeconds
                      ? 0
                      : currentPlayback.playheadSeconds,
                  playing: !currentPlayback.playing,
                }));
              }}
            >
              {playbackPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </Button>
            <div className="relative flex-1">
              <Slider
                aria-label={t("playbackProgress")}
                className="relative z-2"
                disabled={playbackDisabled}
                max={roundedTotalDurationSeconds || 1}
                min={0}
                step={1}
                value={[visiblePlayheadSeconds]}
                onValueChange={(value) => {
                  const nextSeconds = value[0] ?? 0;
                  setPlayback((currentPlayback) => ({
                    playheadSeconds: nextSeconds,
                    playing:
                      nextSeconds >= roundedTotalDurationSeconds ? false : currentPlayback.playing,
                  }));
                }}
              />
              {timelineVideos.slice(1).map((timelineVideo) => {
                const markerPercent =
                  roundedTotalDurationSeconds > 0
                    ? (timelineVideo.startSeconds / roundedTotalDurationSeconds) * 100
                    : 0;
                const markerOffsetPixels =
                  SLIDER_THUMB_SIZE_PIXELS / 2 - (markerPercent / 100) * SLIDER_THUMB_SIZE_PIXELS;

                return (
                  <button
                    key={`${timelineVideo.storyboardId}-${timelineVideo.video.id}-marker`}
                    type="button"
                    aria-label={timelineVideo.storyboardName}
                    className="absolute top-1/2 z-0 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted shadow-sm transition-[height,background-color] hover:h-5 hover:bg-primary disabled:pointer-events-none disabled:opacity-50"
                    disabled={playbackDisabled}
                    style={{ left: `calc(${markerPercent}% + ${markerOffsetPixels}px)` }}
                    onClick={() => {
                      setPlayerVisible(true);
                      setPlayback({
                        playheadSeconds: timelineVideo.startSeconds,
                        playing: true,
                      });
                    }}
                  />
                );
              })}
            </div>
            <span className="w-14 shrink-0 text-right font-mono text-xs text-muted-foreground">
              -{formatTimelineTime(remainingSeconds)}
            </span>
          </div>
        </div>
      </div>
      <Dialog
        open={pendingDeleteVideo !== null}
        onOpenChange={(openDialog) => {
          if (!openDialog) setPendingDeleteVideo(null);
        }}
      >
        <DialogContent className="w-[min(92vw,420px)]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("removeSelectedVideoTitle")}</DialogTitle>
            <DialogDescription className="mt-2">
              {t("removeSelectedVideoDescription", {
                name: pendingDeleteVideo?.video.name || pendingDeleteVideo?.video.id || "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setPendingDeleteVideo(null)}>
              {t("cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmDeleteSelectedVideo}>
              {t("confirmRemove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
