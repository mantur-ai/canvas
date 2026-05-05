"use client";

import { useState } from "react";

import type { ModelProvider } from "@/lib/model-providers";
import { cn } from "@/lib/utils";

type ModelProviderIconProps = {
  className?: string;
  provider?: ModelProvider;
};

export function ModelProviderIcon({ className, provider }: ModelProviderIconProps) {
  const [hasImageError, setHasImageError] = useState(false);

  if (provider && !hasImageError) {
    return (
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-background ring-1 ring-border",
          className,
        )}
        aria-hidden="true"
      >
        <img
          src={provider.iconUrl}
          alt=""
          className="size-3.5 object-contain"
          loading="lazy"
          onError={() => setHasImageError(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-1 ring-border",
        className,
      )}
      aria-hidden="true"
    >
      {provider?.fallbackText ?? ""}
    </span>
  );
}
