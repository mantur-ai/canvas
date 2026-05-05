"use client";

import { create } from "zustand";

export type SidebarLoadingKey = "assets" | "chat" | "episodes";
export type AssetLoadingAction = "generate" | "parse" | null;

type LayoutState = {
  assetLoadingAction: AssetLoadingAction;
  sidebarLoading: Record<SidebarLoadingKey, number>;
  sidebarLoadingVersion: Record<SidebarLoadingKey, number>;
  videoFooterOpen: boolean;
  closeVideoFooter: () => void;
  finishSidebarLoading: (key: SidebarLoadingKey) => void;
  resetSidebarLoading: () => void;
  setAssetLoadingAction: (action: AssetLoadingAction) => void;
  startSidebarLoading: (key: SidebarLoadingKey) => void;
  toggleVideoFooter: () => void;
};

export const useLayoutStore = create<LayoutState>((set) => ({
  assetLoadingAction: null,
  sidebarLoading: {
    assets: 0,
    chat: 0,
    episodes: 0,
  },
  sidebarLoadingVersion: {
    assets: 0,
    chat: 0,
    episodes: 0,
  },
  videoFooterOpen: true,
  closeVideoFooter: () => set({ videoFooterOpen: false }),
  finishSidebarLoading: (key) =>
    set((state) => ({
      assetLoadingAction:
        key === "assets" && state.sidebarLoading.assets <= 1 ? null : state.assetLoadingAction,
      sidebarLoading: {
        ...state.sidebarLoading,
        [key]: Math.max(0, state.sidebarLoading[key] - 1),
      },
    })),
  resetSidebarLoading: () =>
    set((state) => ({
      assetLoadingAction: null,
      sidebarLoading: {
        assets: 0,
        chat: 0,
        episodes: 0,
      },
      sidebarLoadingVersion: {
        assets: state.sidebarLoadingVersion.assets + 1,
        chat: state.sidebarLoadingVersion.chat + 1,
        episodes: state.sidebarLoadingVersion.episodes + 1,
      },
    })),
  setAssetLoadingAction: (action) => set({ assetLoadingAction: action }),
  startSidebarLoading: (key) =>
    set((state) => ({
      sidebarLoading: {
        ...state.sidebarLoading,
        [key]: state.sidebarLoading[key] + 1,
      },
      sidebarLoadingVersion: {
        ...state.sidebarLoadingVersion,
        [key]: state.sidebarLoadingVersion[key] + 1,
      },
    })),
  toggleVideoFooter: () => set((state) => ({ videoFooterOpen: !state.videoFooterOpen })),
}));
