"use client";

import { useEffect, useState, Fragment } from "react";
import {
  Layers,
  Loader2,
  Package,
  FolderKanban,
  MessageCircle,
  Settings,
  Video,
  X,
  Wrench,
} from "lucide-react";
import { Dialog } from "radix-ui";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { EpisodesPanel } from "./episodes-panel";
import { AssetsPanel } from "./assets-panel";
import { ProjectsPanel } from "./projects-panel";
import { SettingsPanel } from "./settings-panel";
import { SkillsPanel } from "./skills-panel";
import { GlobalChatDrawer } from "../global-chat-drawer";
import { useLayoutStore } from "@/store/use-layout-store";

type NavSection =
  | "episodes"
  | "assets"
  | "projects"
  | "settings"
  | "skills"
  | "chat"
  | "video"
  | null;

type NavItem = { key: Exclude<NavSection, null>; icon: typeof Layers; group: number };
type SidebarDialogSection = "projects" | "settings" | "skills";

const FLOAT_KEYS = new Set(["episodes", "assets"]);
const DIALOG_KEYS = new Set(["projects", "settings", "skills"]);
const DRAWER_KEYS = new Set(["chat"]);

const NAV_ITEMS: NavItem[] = [
  { key: "episodes", icon: Layers, group: 0 },
  { key: "assets", icon: Package, group: 0 },
  { key: "projects", icon: FolderKanban, group: 1 },
  { key: "settings", icon: Settings, group: 1 },
  { key: "skills", icon: Wrench, group: 1 },
  { key: "chat", icon: MessageCircle, group: 2 },
  { key: "video", icon: Video, group: 2 },
];

function FloatingPanel({ active, onClose }: { active: NavSection; onClose: () => void }) {
  const t = useTranslations("Sidebar");
  const visible = active !== null && FLOAT_KEYS.has(active);

  return (
    <div
      className={cn(
        "fixed top-16 left-20 z-40 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all duration-200 ease-out backdrop-blur-md",

        visible ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-2 opacity-0",
      )}
      aria-hidden={!visible}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-sm font-semibold">{active ? t(active) : null}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="overflow-y-auto">
        {active === "episodes" && <EpisodesPanel />}
        {active === "assets" && <AssetsPanel />}
      </div>
    </div>
  );
}

function DialogPanel({
  active,
  t,
  onClose,
}: {
  active: NavSection;
  t: (key: string) => string;
  onClose: () => void;
}) {
  return (
    <Dialog.Root
      open={active !== null && DIALOG_KEYS.has(active)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none",
            active === "skills" ? "w-[min(92vw,520px)]" : "w-[min(92vw,960px)]",
          )}
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            {active ? (
              <Dialog.Title className="text-lg font-semibold">{t(active)}</Dialog.Title>
            ) : null}
            <Dialog.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {active === "projects" && <ProjectsPanel onEnteredProject={onClose} />}
            {active === "settings" && <SettingsPanel />}
            {active === "skills" && <SkillsPanel />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const Sidebar = () => {
  const t = useTranslations("Sidebar");
  const [active, setActive] = useState<NavSection>(null);
  const sidebarLoading = useLayoutStore((state) => state.sidebarLoading);
  const videoFooterOpen = useLayoutStore((state) => state.videoFooterOpen);
  const toggleVideoFooter = useLayoutStore((state) => state.toggleVideoFooter);

  const toggle = (key: NavSection) => {
    if (key === "video") {
      setActive(null);
      toggleVideoFooter();
      return;
    }

    setActive((prev) => (prev === key ? null : key));
  };

  useEffect(() => {
    const openPanel = (event: Event) => {
      const panel = (event as CustomEvent<SidebarDialogSection>).detail;
      if (!DIALOG_KEYS.has(panel)) return;

      setActive(panel);
    };

    window.addEventListener("mantur:open-sidebar-panel", openPanel);
    return () => {
      window.removeEventListener("mantur:open-sidebar-panel", openPanel);
    };
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      {/* Icon strip */}
      <aside className="fixed top-24 left-4 z-30 flex w-12 flex-col items-center gap-1 border bg-card/5 py-3 rounded-full backdrop-blur-md">
        {NAV_ITEMS.map(({ key, icon: Icon, group }, i) => {
          const loading =
            (key === "assets" && sidebarLoading.assets > 0) ||
            (key === "episodes" && sidebarLoading.episodes > 0);

          return (
            <Fragment key={key}>
              {i > 0 && group !== NAV_ITEMS[i - 1].group && (
                <Separator key={`sep-${group}`} className="w-6" />
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => toggle(key)}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-lg transition-colors",
                      active === key || (key === "video" && videoFooterOpen) || loading
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {loading ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <Icon className="size-5" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{t(key)}</p>
                </TooltipContent>
              </Tooltip>
            </Fragment>
          );
        })}
      </aside>

      <Button
        type="button"
        size="icon-lg"
        className={cn(
          "fixed right-5 top-20 z-30 size-12 rounded-full border border-border bg-card text-foreground shadow-[0_0_28px_rgba(255,255,255,0.16)] transition-transform hover:scale-105 hover:bg-accent hover:text-foreground",
          active === "chat" ? "scale-105 ring-4 ring-foreground/15" : "animate-pulse animation-duration-[2.35s]",
        )}
        aria-label={t("chat")}
        aria-expanded={active === "chat"}
        onClick={() => toggle("chat")}
      >
        <span className="relative flex size-5 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-foreground/20 animate-ping animation-duration-[2.2s]" />
          {sidebarLoading.chat > 0 ? (
            <Loader2 className="relative size-5 animate-spin" />
          ) : (
            <MessageCircle className="relative size-5" />
          )}
        </span>
      </Button>

      {/* Floating panel: episodes, assets */}
      <FloatingPanel active={active} onClose={() => setActive(null)} />

      {/* Modal dialog: projects, settings, skills */}
      <DialogPanel active={active} t={t} onClose={() => setActive(null)} />

      <GlobalChatDrawer
        open={active !== null && DRAWER_KEYS.has(active)}
        onClose={() => setActive(null)}
      />
    </TooltipProvider>
  );
};

export default Sidebar;
