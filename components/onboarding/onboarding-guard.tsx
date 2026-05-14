"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, CheckCircle2, FolderKanban, Loader2, RefreshCcw, Settings2, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchAgentsCached } from "@/lib/client-data-cache";
import { fetchProjects } from "@/lib/project-api";
import { cn } from "@/lib/utils";
import type { AppConfig } from "@/lib/config-schema";
import type { SkillFolder } from "@/lib/services/skill-service";

type OnboardingStepKey = "agent" | "skills" | "modelApi" | "project";

type SetupStatus = Record<OnboardingStepKey, boolean>;

type ConfigResponse = {
  config?: AppConfig;
};

type SkillsResponse = {
  skills?: SkillFolder[];
};

const EMPTY_STATUS: SetupStatus = {
  agent: false,
  skills: false,
  modelApi: false,
  project: false,
};

const BLOCKING_REFRESH_INTERVAL_MS = 3000;

const STEPS: Array<{
  icon: typeof Bot;
  key: OnboardingStepKey;
}> = [
  { icon: Bot, key: "agent" },
  { icon: Wrench, key: "skills" },
  { icon: Settings2, key: "modelApi" },
  { icon: FolderKanban, key: "project" },
];

function hasModelApi(config: AppConfig | null) {
  if (!config) return false;

  return config.imageModels.length + config.videoModels.length > 0;
}

function isSetupComplete(status: SetupStatus | null) {
  return Boolean(status) && STEPS.every((step) => status[step.key]);
}

function openAgentManager() {
  window.dispatchEvent(new CustomEvent("mantur:open-agent-manager"));
}

function openSidebarPanel(panel: "projects" | "settings" | "skills") {
  window.dispatchEvent(new CustomEvent("mantur:open-sidebar-panel", { detail: panel }));
}

function openStep(key: OnboardingStepKey) {
  if (key === "agent") {
    openAgentManager();
    return;
  }

  if (key === "skills") {
    openSidebarPanel("skills");
    return;
  }

  if (key === "modelApi") {
    openSidebarPanel("settings");
    return;
  }

  openSidebarPanel("projects");
}

async function fetchConfig(): Promise<AppConfig | null> {
  const response = await fetch("/api/config", { cache: "no-store" });
  if (!response.ok) throw new Error("CONFIG_LOAD_FAILED");

  const payload = (await response.json()) as ConfigResponse;
  return payload.config ?? null;
}

async function fetchSkills(): Promise<SkillFolder[]> {
  const response = await fetch("/api/skills", { cache: "no-store" });
  if (!response.ok) throw new Error("SKILLS_LOAD_FAILED");

  const payload = (await response.json()) as SkillsResponse;
  return Array.isArray(payload.skills) ? payload.skills : [];
}

export function OnboardingGuard() {
  const t = useTranslations("Onboarding");
  // 只接受最新一次检查结果，避免慢请求把已完成状态又覆盖成旧状态。
  const latestRefreshIdRef = useRef(0);
  const shouldBlockRef = useRef(false);
  const statusRef = useRef<SetupStatus | null>(null);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const incompleteSteps = useMemo(
    () => (status ? STEPS.filter((step) => !status[step.key]).map((step) => step.key) : []),
    [status],
  );
  const shouldBlock = hasInitiallyLoaded && (hasLoadError || incompleteSteps.length > 0);

  useEffect(() => {
    shouldBlockRef.current = shouldBlock;
    setIsOpen(shouldBlock);
  }, [shouldBlock]);

  const refreshStatus = useCallback(async (options: { showLoading?: boolean } = {}) => {
    const showLoading = options.showLoading ?? false;
    const refreshId = latestRefreshIdRef.current + 1;
    latestRefreshIdRef.current = refreshId;

    if (showLoading) setIsLoading(true);
    setHasLoadError(false);

    try {
      const previousStatus = statusRef.current;
      const [agents, skills, config, projects] = await Promise.all([
        previousStatus?.agent ? Promise.resolve(null) : fetchAgentsCached(),
        previousStatus?.skills ? Promise.resolve(null) : fetchSkills(),
        previousStatus?.modelApi ? Promise.resolve(null) : fetchConfig(),
        previousStatus?.project ? Promise.resolve(null) : fetchProjects(),
      ]);

      if (latestRefreshIdRef.current !== refreshId) return;

      const nextStatus = {
        agent: previousStatus?.agent ?? Boolean(agents && agents.length > 0),
        skills: previousStatus?.skills ?? Boolean(skills && skills.length > 0),
        modelApi: previousStatus?.modelApi ?? hasModelApi(config),
        project: previousStatus?.project ?? Boolean(projects && projects.length > 0),
      };
      statusRef.current = nextStatus;
      setStatus(nextStatus);
    } catch {
      if (latestRefreshIdRef.current !== refreshId) return;

      setHasLoadError(true);
      statusRef.current = EMPTY_STATUS;
      setStatus(EMPTY_STATUS);
    } finally {
      if (latestRefreshIdRef.current === refreshId) {
        setHasInitiallyLoaded(true);
        if (showLoading) setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const initialCheckId = window.setTimeout(() => {
      void refreshStatus({ showLoading: true });
    }, 0);

    const handleFocus = () => {
      if (!shouldBlockRef.current) return;
      void refreshStatus();
    };
    const handleOnboardingRefresh = () => {
      void refreshStatus({ showLoading: true });
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("mantur:onboarding-refresh", handleOnboardingRefresh);
    return () => {
      window.clearTimeout(initialCheckId);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("mantur:onboarding-refresh", handleOnboardingRefresh);
    };
  }, [refreshStatus]);

  useEffect(() => {
    if (!isOpen || (!hasLoadError && isSetupComplete(status))) return;

    const refreshTimeoutId = window.setTimeout(() => {
      void refreshStatus();
    }, BLOCKING_REFRESH_INTERVAL_MS);

    return () => {
      window.clearTimeout(refreshTimeoutId);
    };
  }, [hasLoadError, isOpen, refreshStatus, status]);

  return (
    <Dialog open={isOpen} modal>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="w-[min(92vw,720px)] rounded-2xl"
      >
        <DialogHeader className="px-6 py-5">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="mt-1">{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 px-6 py-5">
          {hasLoadError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t("loadError")}
            </div>
          ) : null}

          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const complete = status?.[step.key] ?? false;

            return (
              <div
                key={step.key}
                className={cn(
                  "grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-[1fr_auto] sm:items-center",
                  complete ? "border-border" : "border-primary/40",
                )}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      complete ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {t("stepLabel", { index: index + 1, title: t(`steps.${step.key}.title`) })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(`steps.${step.key}.description`)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs",
                      complete ? "text-success" : "text-muted-foreground",
                    )}
                  >
                    {complete ? <CheckCircle2 className="size-3.5" /> : null}
                    {complete ? t("status.complete") : t("status.incomplete")}
                  </span>
                  <Button className="text-foreground" type="button" size="sm" onClick={() => openStep(step.key)}>
                    {t(`steps.${step.key}.action`)}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
          <p className="text-xs text-muted-foreground">{t("footer")}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void refreshStatus({ showLoading: true })}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCcw className="size-3.5" />}
            {isLoading ? t("actions.checking") : t("actions.refresh")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
