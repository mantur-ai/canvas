"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Plus, Settings2, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Dialog } from "radix-ui";
import type { AgentRecord } from "@/lib/agent-schema";
import { fetchAgentsCached, invalidateAgentsCache } from "@/lib/client-data-cache";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
} from "@/components/ui/select";
import {Textarea} from "@/components/ui/textarea";
import { ScrollArea } from "../ui/scroll-area";
import { useAgentStore } from "@/store/use-agent-store";

type AgentFormState = {
  id: string | null;
  name: string;
  instructions: string;
  icon: string;
  description: string;
};

const EMPTY_FORM: AgentFormState = {
  id: null,
  name: "",
  instructions: "",
  icon: "",
  description: "",
};

function AgentGlyph({ icon, className }: { icon?: string; className?: string }) {
  if (icon && icon.trim().length > 0) {
    if (icon.startsWith("http://") || icon.startsWith("https://")) {
      return (
        <Image
          src={icon}
          alt=""
          width={20}
          height={20}
          unoptimized
          className={cn("size-5 rounded-sm object-contain", className)}
        />
      );
    }
    return (
      <span className={cn("inline-flex size-5 items-center justify-center", className)}>
        {icon}
      </span>
    );
  }

  return (
    <Image
      src="/mantur-logo.svg"
      alt=""
      width={20}
      height={20}
      className={cn("size-5", className)}
    />
  );
}

export default function AgentSwitcher() {
  const t = useTranslations("AgentSwitcher");
  const { selectedAgentId: storeSelectedId, setSelectedAgentId: storeSetSelectedId } =
    useAgentStore();
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const selectedAgentId = storeSelectedId;
  const setSelectedAgentId = storeSetSelectedId;
  const [selectOpen, setSelectOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgentRecord | null>(null);
  const [form, setForm] = useState<AgentFormState>(EMPTY_FORM);
  const [fieldError, setFieldError] = useState<string>("");
  const [isLoading, startLoadingTransition] = useTransition();
  const [isSaving, startSavingTransition] = useTransition();
  const [isDeleting, startDeletingTransition] = useTransition();

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  const loadAgents = useCallback(async () => {
    try {
      const nextAgents = await fetchAgentsCached();
      setAgents(nextAgents);
      const currentId = useAgentStore.getState().selectedAgentId;
      if (!nextAgents.some((agent) => agent.id === currentId)) {
        setSelectedAgentId(nextAgents[0]?.id ?? "");
      }
      return nextAgents;
    } catch {
      toast.error(t("feedback.loadError"));
      return [];
    }
  }, [setSelectedAgentId, t]);

  useEffect(() => {
    startLoadingTransition(() => {
      void loadAgents();
    });
  }, [loadAgents]);

  useEffect(() => {
    const openManager = () => {
      setSelectOpen(false);
      setManagerOpen(true);
    };

    window.addEventListener("mantur:open-agent-manager", openManager);
    return () => {
      window.removeEventListener("mantur:open-agent-manager", openManager);
    };
  }, []);

  function openCreateForm() {
    setFieldError("");
    setForm(EMPTY_FORM);
  }

  function openEditForm(agent: AgentRecord) {
    setFieldError("");
    setForm({
      id: agent.id,
      name: agent.name,
      instructions: agent.instructions,
      icon: agent.icon,
      description: agent.description,
    });
  }

  function validateForm() {
    if (!form.name.trim()) {
      setFieldError(t("validation.nameRequired"));
      return false;
    }

    if (!form.instructions.trim()) {
      setFieldError(t("validation.instructionsRequired"));
      return false;
    }

    setFieldError("");
    return true;
  }

  function updateFormField<Key extends keyof AgentFormState>(key: Key, value: AgentFormState[Key]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function submitForm() {
    if (!validateForm()) {
      return;
    }

    const payload = {
      ...(form.id ? { id: form.id } : {}),
      name: form.name.trim(),
      instructions: form.instructions.trim(),
      icon: form.icon.trim(),
      description: form.description.trim(),
    };

    startSavingTransition(() => {
      void (async () => {
        try {
          const response = await fetch("/api/agents", {
            method: form.id ? "PUT" : "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Save failed: ${JSON.stringify(errorData)}`);
          }

          invalidateAgentsCache();
          const nextAgents = await loadAgents();
          if (!form.id && nextAgents.length > 0) {
            setSelectedAgentId(nextAgents[0].id);
          }
          openCreateForm();
          toast.success(t("feedback.saveSuccess"));
        } catch (err) {
          toast.error(t("feedback.saveError"));
          console.error("Save error:", err);
        }
      })();
    });
  }

  function requestDelete(agent: AgentRecord) {
    setDeleteTarget(agent);
  }

  function confirmDelete() {
    if (!deleteTarget) {
      return;
    }

    startDeletingTransition(() => {
      void (async () => {
        try {
          const response = await fetch("/api/agents", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ id: deleteTarget.id }),
          });

          if (!response.ok) {
            throw new Error("Delete failed.");
          }

          const deletedId = deleteTarget.id;
          setDeleteTarget(null);
          if (form.id === deletedId) {
            openCreateForm();
          }
          invalidateAgentsCache();
          await loadAgents();
          if (useAgentStore.getState().selectedAgentId === deletedId) {
            setSelectedAgentId("");
          }
          toast.success(t("feedback.deleteSuccess"));
        } catch {
          toast.error(t("feedback.deleteError"));
        }
      })();
    });
  }

  return (
    <Dialog.Root
      open={managerOpen}
      onOpenChange={(open) => {
        setManagerOpen(open);
        if (!open) {
          setForm(EMPTY_FORM);
          setFieldError("");
        }
      }}
    >
      <div className="pointer-events-auto">
        <Select
          value={selectedAgentId}
          onValueChange={setSelectedAgentId}
          open={selectOpen}
          onOpenChange={setSelectOpen}
        >
          <SelectTrigger
            className={cn("h-10! w-56 border-none  backdrop-blur-md", "select-none outline-none")}
            aria-label={t("selectAriaLabel")}
          >
            {selectedAgent ? (
              <span className="flex items-center gap-2">
                <AgentGlyph icon={selectedAgent.icon} className="text-primary" />
                <span>{selectedAgent.name}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{t("placeholder")}</span>
            )}
          </SelectTrigger>
          <SelectContent position="popper">
            <div className="flex flex-col gap-1 p-1">
              {agents.length === 0 ? (
                <div className="px-2 py-2 text-sm text-muted-foreground">{t("empty")}</div>
              ) : (
                agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id} className="cursor-pointer">
                    <span className="flex items-center gap-2">
                      <AgentGlyph icon={agent.icon} className="text-primary" />
                      <span>{agent.name}</span>
                    </span>
                  </SelectItem>
                ))
              )}
              <SelectSeparator />
              <Dialog.Trigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                  onClick={() => {
                    setSelectOpen(false);
                    setManagerOpen(true);
                  }}
                >
                  <Settings2 className="size-4 text-primary" />
                  <span>{t("manageButton")}</span>
                </button>
              </Dialog.Trigger>
            </div>
          </SelectContent>
        </Select>
      </div>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[min(92vw,960px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none"
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <div className="flex items-start justify-between border-b border-border px-6 py-3">
            <div className="space-y-1">
              <Dialog.Title className="text-lg font-semibold">{t("dialog.title")}</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label={t("dialog.close")}>
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="grid flex-1 gap-0 overflow-hidden md:grid-cols-[320px_1fr]">
            <section className="flex flex-col border-b border-border md:border-r md:border-b-0">
              <ScrollArea className="max-h-[58vh]">
                <div className="flex flex-col gap-2 px-4 py-4">
                  <div
                    onClick={openCreateForm}
                    className={cn(
                      "cursor-pointer rounded-xl border px-4 py-3 transition-colors",
                      !form.id
                        ? "border-primary/50 bg-primary/10"
                        : "border-dashed border-border hover:bg-accent",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Plus className="size-4 text-primary" />
                      <p className="truncate font-medium text-muted-foreground">{t("list.add")}</p>
                    </div>
                  </div>
                  {agents.map((agent) => {
                    const isActive = form.id === agent.id;

                    return (
                      <div key={agent.id} className="flex items-stretch gap-1">
                        <div
                          onClick={() => openEditForm(agent)}
                          className={cn(
                            "flex-1 cursor-pointer rounded-xl border px-4 py-3 transition-colors",
                            isActive
                              ? "border-primary/50 bg-primary/10"
                              : "border-border bg-background/50",
                          )}
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <AgentGlyph icon={agent.icon} className="text-primary" />
                              <p className="truncate font-medium">{agent.name}</p>
                            </div>
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                              {agent.description || t("list.noDescription")}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </section>

              <section className="flex flex-col overflow-y-auto px-6 py-5">
              <div className="mb-5 space-y-1">
                <h3 className="text-sm font-medium">
                  {form.id ? t("form.editTitle") : t("form.createTitle")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {form.id ? t("form.editDescription") : t("form.createDescription")}
                </p>
              </div>

              <div className="grid gap-4">
                <label className="grid gap-2 text-sm">
                  <span>{t("form.name")}</span>
                  <input
                    value={form.name}
                    onChange={(event) => updateFormField("name", event.target.value)}
                    placeholder={t("form.namePlaceholder")}
                    className="h-10 rounded-lg border border-input bg-background px-3 outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span>{t("form.instructions")}</span>
                  <Input
                    value={form.instructions}
                    onChange={(event) => updateFormField("instructions", event.target.value)}
                    placeholder={t("form.instructionsPlaceholder")}
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span>{t("form.icon")}</span>
                  <Input
                    value={form.icon}
                    onChange={(event) => updateFormField("icon", event.target.value)}
                    placeholder={t("form.iconPlaceholder")}
                  />
                </label>

                <label className="grid gap-2 text-sm">
                  <span>{t("form.description")}</span>
                  <Textarea
                    value={form.description}
                    onChange={(event) => updateFormField("description", event.target.value)}
                    placeholder={t("form.descriptionPlaceholder")}
                    rows={3}
                    className="rounded-lg border border-input bg-background px-3 py-2 outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40"
                  />
                </label>

                {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
              </div>

              <div className="mt-6 flex items-center gap-2">
                {form.id && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      const target = agents.find((a) => a.id === form.id);
                      if (target) requestDelete(target);
                    }}
                  >
                    {t("actions.delete")}
                  </Button>
                )}
                <div className="ml-auto">
                  <Button onClick={submitForm} disabled={isSaving}>
                    {isSaving
                      ? t("actions.saving")
                      : form.id
                        ? t("actions.update")
                        : t("actions.create")}
                  </Button>
                </div>
              </div>
            </section>
            
          </div>

          {deleteTarget ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/75 p-6 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
                <div className="space-y-2">
                  <h4 className="text-base font-semibold">{t("confirm.title")}</h4>
                  <p className="text-sm text-muted-foreground">
                    {t("confirm.description", { name: deleteTarget.name })}
                  </p>
                </div>
                <div className="mt-6 flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setDeleteTarget(null)}
                    disabled={isDeleting}
                  >
                    {t("confirm.cancel")}
                  </Button>
                  <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
                    {isDeleting ? t("confirm.deleting") : t("confirm.confirm")}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>

      {isLoading ? <span className="sr-only">{t("feedback.loading")}</span> : null}
    </Dialog.Root>
  );
}
