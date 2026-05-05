import { ImageIcon, Link2, Route, Video } from "lucide-react";
import { v4 as createUuid } from "uuid";

import type {
  AppConfig,
  ImageBedConfig,
  ImageModelConfig,
  VideoModelConfig,
} from "@/lib/config-schema";

import { EMPTY_FORM_VALUES, WORKFLOW_FEATURES } from "./constants";
import type { ConfigItem, ConfigSection, SettingsFormValues, WorkflowSkillConfig } from "./types";

export function getSectionIcon(section: ConfigSection) {
  if (section === "image") return ImageIcon;
  if (section === "video") return Video;
  if (section === "imageBed") return Link2;
  return Route;
}

export function createConfigId(section: ConfigSection) {
  return `${section}-${createUuid()}`;
}

export function maskApiKey(apiKey: string) {
  return apiKey.length > 6 ? `${apiKey.slice(0, 3)}••••${apiKey.slice(-3)}` : "••••••";
}

export function hasVideoReferenceMode(item: ConfigItem): item is VideoModelConfig {
  return "videoReferenceMode" in item;
}

export function hasDefaultFlag(item: ConfigItem): item is ImageBedConfig {
  return "isDefault" in item;
}

export function hasApiKey(
  item: ConfigItem,
): item is ImageBedConfig | ImageModelConfig | VideoModelConfig {
  return "apiKey" in item;
}

export function isWorkflowSkillConfig(item: ConfigItem): item is WorkflowSkillConfig {
  return "primarySkill" in item;
}

export function toFormValues(section: ConfigSection, item?: ConfigItem): SettingsFormValues {
  if (!item) {
    return {
      ...EMPTY_FORM_VALUES,
      isDefault: section === "imageBed",
    };
  }

  if (isWorkflowSkillConfig(item)) {
    return {
      ...EMPTY_FORM_VALUES,
      primarySkill: item.primarySkill,
      uploadSkill: item.uploadSkill ?? "none",
    };
  }

  return {
    ...EMPTY_FORM_VALUES,
    name: item.name,
    apiKey: item.apiKey,
    example: item.example,
    videoReferenceMode: hasVideoReferenceMode(item) ? item.videoReferenceMode : "all-purpose",
    isDefault: hasDefaultFlag(item) ? item.isDefault : section === "imageBed",
  };
}

export function getSectionItems(config: AppConfig, section: ConfigSection): ConfigItem[] {
  if (section === "image") return config.imageModels;
  if (section === "video") return config.videoModels;
  if (section === "imageBed") return config.imageBeds;
  return WORKFLOW_FEATURES.map((feature) => ({
    id: feature,
    name: feature,
    primarySkill: config.workflowSkills[feature].primarySkill,
    uploadSkill: config.workflowSkills[feature].uploadSkill,
  }));
}

export function normalizeImageBeds(imageBeds: ImageBedConfig[]) {
  if (imageBeds.length === 0) return imageBeds;
  if (imageBeds.some((imageBed) => imageBed.isDefault)) return imageBeds;

  return imageBeds.map((imageBed, index) => ({
    ...imageBed,
    isDefault: index === 0,
  }));
}
