"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { useCanvasStore } from "@/store/use-canvas-store";
import AgentSwitcher from "./AgentSwitcher";
import { LanguageSwitcher } from "./LanguageSwitcher";

export default function Header() {
  const currentProject = useCanvasStore((state) => state.currentProject);
  const t = useTranslations("Header");

  return (
    <header className="pointer-events-none fixed top-0 left-0 right-0 z-50 flex h-16 items-center px-16">
      <span className="pointer-events-auto inline-flex min-w-0 items-center gap-2">
        <Image
          src="/mantur-logo.svg"
          alt={t("logoAlt")}
          width={68}
          height={20}
          loading="eager"
          style={{ width: 68, height: "auto" }}
        />
        {currentProject ? (
          <span className="max-w-[min(420px,60vw)] truncate text-sm font-semibold text-foreground">
            {currentProject.name}
          </span>
        ) : (
          <span className="text-xl font-bold">{t("brandName")}</span>
        )}

      </span>
      <div className="flex-1"></div>
      <span className="pointer-events-auto flex items-center gap-2">
        <AgentSwitcher />
        <LanguageSwitcher />
      </span>
    </header>
  );
}
