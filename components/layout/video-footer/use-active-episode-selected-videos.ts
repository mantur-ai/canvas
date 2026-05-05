"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchProjectCanvasData, type ProjectCanvasData } from "@/lib/project-api";
import type { ProjectEpisode, ProjectVideoAsset } from "@/lib/project-types";
import { useCanvasStore } from "@/store/use-canvas-store";

export type SelectedStoryboardVideo = {
  selected: boolean;
  storyboardId: string;
  storyboardName: string;
  video: ProjectVideoAsset;
};

export type ActiveEpisode = {
  canvasData: ProjectCanvasData;
  episode: ProjectEpisode;
};

type CanvasDataByEpisode = Record<string, ProjectCanvasData>;

function createMissingVideo(videoId: string): ProjectVideoAsset {
  return {
    apiUrl: "",
    id: videoId,
    cover: "",
    coverUrl: "",
    duration: "",
    name: videoId,
    poster: "",
    prompt: "",
    source: "",
    status: "",
    url: "",
  };
}

export function useActiveEpisodeSelectedVideos() {
  const t = useTranslations("Sidebar.videoFooter");
  const currentProject = useCanvasStore((state) => state.currentProject);
  const currentCanvasData = useCanvasStore((state) => state.currentCanvasData);
  const storeCanvasDataByEpisode = useCanvasStore((state) => state.currentCanvasDataByEpisode);
  const activeEpisodeIdFromStore = useCanvasStore((state) => state.activeEpisodeId);
  const selectedEpisodeIds = useCanvasStore((state) => state.selectedEpisodeIds);
  const [canvasDataByEpisode, setCanvasDataByEpisode] = useState<CanvasDataByEpisode>({});
  const selectedEpisodeKey = selectedEpisodeIds.join(",");
  const fallbackEpisodeId = currentProject?.episodes[0]?.id ?? "";
  const currentProjectId = currentProject?.id ?? "";

  useEffect(() => {
    let active = true;
    const episodeIds =
      selectedEpisodeKey.length > 0
        ? selectedEpisodeKey.split(",")
        : fallbackEpisodeId
          ? [fallbackEpisodeId]
          : [];

    const loadAllStoryboardVideos = async () => {
      if (!currentProjectId) {
        setCanvasDataByEpisode({});
        return;
      }

      try {
        const episodeEntries = await Promise.all(
          episodeIds.map(
            async (episodeId) =>
              [
                episodeId,
                await fetchProjectCanvasData(currentProjectId, episodeId),
              ] as const,
          ),
        );

        if (active) setCanvasDataByEpisode(Object.fromEntries(episodeEntries));
      } catch {
        if (active) setCanvasDataByEpisode({});
      }
    };

    void loadAllStoryboardVideos();

    return () => {
      active = false;
    };
  }, [currentProjectId, fallbackEpisodeId, selectedEpisodeKey]);

  const visibleCanvasDataByEpisode = useMemo<CanvasDataByEpisode>(() => {
    const storeData = Object.fromEntries(
      Object.entries(storeCanvasDataByEpisode).map(([episodeId, canvasData]) => [
        episodeId,
        canvasData.data,
      ]),
    );

    // Real-time canvas state wins over disk data so selectedVideo changes appear immediately.
    return {
      ...canvasDataByEpisode,
      ...storeData,
    };
  }, [canvasDataByEpisode, storeCanvasDataByEpisode]);

  const activeEpisode = useMemo<ActiveEpisode | null>(() => {
    if (!currentProject) return null;

    const activeEpisodeFromStore = currentProject.episodes.find(
      (episode) => episode.id === activeEpisodeIdFromStore,
    );
    if (activeEpisodeFromStore) {
      const canvasData = visibleCanvasDataByEpisode[activeEpisodeFromStore.id];
      return canvasData ? { canvasData, episode: activeEpisodeFromStore } : null;
    }

    if (!currentCanvasData) return null;
    const fallbackEpisode = currentProject.episodes.find(
      (episode) => episode.id === currentCanvasData.episodeId,
    );
    if (!fallbackEpisode) return null;

    return {
      canvasData: currentCanvasData.data,
      episode: fallbackEpisode,
    };
  }, [
    activeEpisodeIdFromStore,
    currentCanvasData,
    currentProject,
    visibleCanvasDataByEpisode,
  ]);

  const selectedVideos = useMemo<SelectedStoryboardVideo[]>(() => {
    if (!activeEpisode) return [];

    return activeEpisode.canvasData.storyboards.flatMap((storyboard, index) => {
      if (!storyboard.selectedVideo) return [];

      const video =
        activeEpisode.canvasData.videos.find((item) => item.id === storyboard.selectedVideo) ??
        createMissingVideo(storyboard.selectedVideo);

      return [
        {
          selected: true,
          storyboardId: storyboard.id,
          storyboardName: storyboard.name.trim() || t("storyboardFallback", { index: index + 1 }),
          video,
        },
      ];
    });
  }, [activeEpisode, t]);

  return {
    activeEpisode,
    currentProjectId,
    selectedVideos,
  };
}
