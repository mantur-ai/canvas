"use client";

import { useLocale, useTranslations } from "next-intl";
import { Languages, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname, useRouter } from "@/i18n/routing";
import { routing } from "@/i18n/routing";

type AppLocale = (typeof routing.locales)[number];

export function LanguageSwitcher() {
  const t = useTranslations("Header");
  const tLocale = useTranslations("Locale");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = (nextLocale: AppLocale) => {
    router.replace(pathname, { locale: nextLocale });
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="secondary" className="ml-2 h-10 w-10  backdrop-blur-md">
          <Languages className="h-4 w-4 text-foreground" />
          <span className="sr-only">{t("switchLanguage")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {routing.locales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => switchLocale(loc)}
            className="flex items-center justify-between gap-3 cursor-pointer"
          >
            <span>{tLocale(loc)}</span>
            {locale === loc && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
