import {
  DEFAULT_WORKFLOW_SKILLS,
  type AppConfig,
  type VideoReferenceMode,
} from "@/lib/config-schema";

import type { ConfigSection, SettingsFormValues } from "./types";

export const EMPTY_CONFIG: AppConfig = {
  imageModels: [],
  videoModels: [],
  imageBeds: [],
  workflowSkills: DEFAULT_WORKFLOW_SKILLS,
};

export const EMPTY_FORM_VALUES: SettingsFormValues = {
  name: "",
  apiKey: "",
  example: "",
  videoReferenceMode: "all-purpose",
  isDefault: true,
};

export const CONFIG_SECTIONS: ConfigSection[] = ["image", "video", "imageBed"];

export const VIDEO_REFERENCE_MODES: VideoReferenceMode[] = ["all-purpose", "first-last-frame"];
