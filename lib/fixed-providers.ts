import type { AppConfig, ImageBedConfig, ImageModelConfig, VideoModelConfig } from "@/lib/config-schema";

export const FIXED_IMAGE_MODELS = [
  {
    example: "fixed-provider:gpt-image-2",
    id: "fixed-image-gpt-image-2",
    name: "gpt-image-2",
    providerId: "gpt",
  },
  {
    example: "fixed-provider:seedream-5-lite",
    id: "fixed-image-seedream-5-lite",
    name: "Seedream 5.0 lite",
    providerId: "seedream",
  },
] as const;

export const FIXED_VIDEO_MODELS = [
  {
    example: "fixed-provider:seedance-2",
    id: "fixed-video-seedance-2",
    name: "seedance2.0",
    providerId: "seedance",
    videoReferenceMode: "all-purpose",
  },
] as const;

export const FIXED_IMAGE_BEDS = [
  {
    example: "fixed-provider:imgbb",
    id: "fixed-image-bed-imgbb",
    isDefault: true,
    name: "imgbb",
  },
] as const;

function findExistingByFixedName<T extends { apiKey: string; id: string; name: string }>(
  items: T[],
  fixed: { id: string; name: string },
) {
  return items.find((item) => item.id === fixed.id) ?? items.find((item) => item.name === fixed.name);
}

export function withFixedProviderConfig(config: AppConfig): AppConfig {
  const imageModels: ImageModelConfig[] = FIXED_IMAGE_MODELS.map((fixed) => {
    const existing = findExistingByFixedName(config.imageModels, fixed);
    return {
      apiKey: existing?.apiKey ?? "",
      example: fixed.example,
      id: fixed.id,
      name: fixed.name,
      providerId: fixed.providerId,
    };
  });

  const videoModels: VideoModelConfig[] = FIXED_VIDEO_MODELS.map((fixed) => {
    const existing = findExistingByFixedName(config.videoModels, fixed);
    return {
      apiKey: existing?.apiKey ?? "",
      example: fixed.example,
      id: fixed.id,
      name: fixed.name,
      providerId: fixed.providerId,
      videoReferenceMode: existing?.videoReferenceMode ?? fixed.videoReferenceMode,
    };
  });

  const imageBeds: ImageBedConfig[] = FIXED_IMAGE_BEDS.map((fixed) => {
    const existing = findExistingByFixedName(config.imageBeds, fixed);
    return {
      apiKey: existing?.apiKey ?? "",
      example: fixed.example,
      id: fixed.id,
      isDefault: true,
      name: fixed.name,
    };
  });

  return {
    ...config,
    imageBeds,
    imageModels,
    videoModels,
  };
}
