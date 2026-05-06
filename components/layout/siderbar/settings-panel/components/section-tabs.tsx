"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CONFIG_SECTIONS } from "../constants";
import type { ConfigSection } from "../types";
import { getSectionIcon } from "../utils";

type SectionTabsProps = {
  activeSection: ConfigSection;
  onSelectSection: (section: ConfigSection) => void;
};

export function SectionTabs({ activeSection, onSelectSection }: SectionTabsProps) {
  const t = useTranslations("Settings");

  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
      {CONFIG_SECTIONS.map((section) => {
        const Icon = getSectionIcon(section);
        return (
          <Button
            key={section}
            type="button"
            variant={activeSection === section ? "default" : "ghost"}
            size="sm"
            onClick={() => onSelectSection(section)}
            className={cn(
              "h-8 rounded-md px-2",
              activeSection !== section && "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {t(`modelManager.sections.${section}`)}
          </Button>
        );
      })}
    </div>
  );
}
