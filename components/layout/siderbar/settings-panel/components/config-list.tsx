"use client";

import { useTranslations } from "next-intl";

import { ModelProviderIcon } from "@/components/model-provider-icon";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { resolveModelProvider } from "@/lib/model-providers";
import { cn } from "@/lib/utils";

import type { ConfigItem, ConfigSection } from "../types";
import { getSectionIcon, hasApiKey, hasDefaultFlag, maskApiKey } from "../utils";

type ConfigListProps = {
  activeItems: ConfigItem[];
  activeSection: ConfigSection;
  isLoading: boolean;
  selectedId: string | null;
  onDefaultChange: (itemId: string, checked: boolean) => void;
  onSelectItem: (item: ConfigItem | null) => void;
};

export function ConfigList({
  activeItems,
  activeSection,
  isLoading,
  selectedId,
  onDefaultChange,
  onSelectItem,
}: ConfigListProps) {
  const t = useTranslations("Settings");
  const SectionIcon = getSectionIcon(activeSection);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <div className="flex items-center justify-between px-1">
        <h4 className="text-xs font-medium text-muted-foreground">
          {t("modelManager.list.title", { type: t(`modelManager.sections.${activeSection}`) })}
        </h4>
        <span className="text-xs text-muted-foreground">
          {t("modelManager.list.count", { count: activeItems.length })}
        </span>
      </div>

      {isLoading ? (
        <EmptyListMessage>{t("modelManager.feedback.loading")}</EmptyListMessage>
      ) : activeItems.length === 0 ? (
        <EmptyListMessage>{t("modelManager.list.empty")}</EmptyListMessage>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="grid gap-2">
            {activeItems.map((item) => {
              const isSelected = selectedId === item.id;
              const provider =
                activeSection === "imageBed" || !hasApiKey(item)
                  ? undefined
                  : resolveModelProvider(
                      "providerId" in item ? item.providerId : undefined,
                      item.name,
                      item.example,
                    );

              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex min-w-0 items-start gap-2 overflow-hidden rounded-lg border bg-background p-2",
                    isSelected && "border-primary",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectItem(item)}
                    className="flex min-w-0 flex-1 items-start gap-2 overflow-hidden text-left"
                  >
                    {provider ? (
                      <ModelProviderIcon
                        provider={provider}
                        className="mt-0.5 size-8 shrink-0 rounded-md [&_img]:size-5"
                      />
                    ) : (
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <SectionIcon className="size-4" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</p>
                        {hasDefaultFlag(item) && item.isDefault ? (
                          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                            {t("modelManager.form.default")}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {hasApiKey(item) ? maskApiKey(item.apiKey) : ""}
                      </p>
                    </div>
                  </button>

                  {hasDefaultFlag(item) ? (
                    <Checkbox
                      checked={item.isDefault}
                      onCheckedChange={(checked) => onDefaultChange(item.id, checked === true)}
                      aria-label={t("modelManager.actions.setDefault")}
                      className="mt-2"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function EmptyListMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed bg-muted/30 px-3 py-6 text-center">
      <p className="text-xs text-muted-foreground">{children}</p>
    </div>
  );
}
