import type { AgentRecord } from "@/lib/agent-schema";
import type { AppConfig } from "@/lib/config-schema";

type AgentsResponse = {
  agents?: AgentRecord[];
};

type ConfigResponse = {
  config?: AppConfig;
};

let agentsCache: AgentRecord[] | null = null;
let agentsRequest: Promise<AgentRecord[]> | null = null;
let configCache: AppConfig | null = null;
let configRequest: Promise<AppConfig | null> | null = null;

export async function fetchAgentsCached(): Promise<AgentRecord[]> {
  if (agentsCache) return agentsCache;
  if (agentsRequest) return agentsRequest;

  agentsRequest = fetch("/api/agents", {
    method: "GET",
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("AGENTS_LOAD_FAILED");

      const payload = (await response.json()) as AgentsResponse;
      agentsCache = payload.agents ?? [];
      return agentsCache;
    })
    .finally(() => {
      agentsRequest = null;
    });

  return agentsRequest;
}

export function setAgentsCache(agents: AgentRecord[]) {
  agentsCache = agents;
  agentsRequest = null;
}

export function invalidateAgentsCache() {
  agentsCache = null;
  agentsRequest = null;
}

export async function fetchConfigCached(): Promise<AppConfig | null> {
  if (configCache) return configCache;
  if (configRequest) return configRequest;

  configRequest = fetch("/api/config", {
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("CONFIG_LOAD_FAILED");

      const payload = (await response.json()) as ConfigResponse;
      configCache = payload.config ?? null;
      return configCache;
    })
    .finally(() => {
      configRequest = null;
    });

  return configRequest;
}

export function setConfigCache(config: AppConfig) {
  configCache = config;
  configRequest = null;
}
