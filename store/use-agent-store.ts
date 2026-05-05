"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type AgentStore = {
  selectedAgentId: string;
  sessionByContextKey: Record<string, string>;
  clearAgentSession: (contextKey: string) => void;
  getAgentSession: (contextKey: string) => string | undefined;
  setSelectedAgentId: (id: string) => void;
  setAgentSession: (contextKey: string, sessionId: string) => void;
};

export const useAgentStore = create<AgentStore>()(
  persist(
    (set, get) => ({
      selectedAgentId: "",
      sessionByContextKey: {},
      clearAgentSession: (contextKey) =>
        set((state) => {
          const nextSessionByContextKey = { ...state.sessionByContextKey };
          delete nextSessionByContextKey[contextKey];
          return { sessionByContextKey: nextSessionByContextKey };
        }),
      getAgentSession: (contextKey) => get().sessionByContextKey[contextKey],
      setSelectedAgentId: (id) => set({ selectedAgentId: id }),
      setAgentSession: (contextKey, sessionId) =>
        set((state) => ({
          sessionByContextKey: {
            ...state.sessionByContextKey,
            [contextKey]: sessionId,
          },
        })),
    }),
    {
      name: "agent-store",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
