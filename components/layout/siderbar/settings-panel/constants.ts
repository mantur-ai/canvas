import {
  DEFAULT_WORKFLOW_SKILLS,
  type AppConfig,
  type VideoReferenceMode,
  type WorkflowFeature,
  type WorkflowPrimarySkill,
  type WorkflowUploadSkill,
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
  primarySkill: "asset-image-gen",
  uploadSkill: "none",
};

export const CONFIG_SECTIONS: ConfigSection[] = ["image", "video", "imageBed", "workflowSkill"];

export const VIDEO_REFERENCE_MODES: VideoReferenceMode[] = ["all-purpose", "first-last-frame"];
export const WORKFLOW_FEATURES: WorkflowFeature[] = [
  "asset-parse",
  "asset-map-generate",
  "asset-generate",
  "asset-panel-generate",
  "storyboard-image-generate",
  "storyboard-parse",
  "video-generate",
];
export const WORKFLOW_PRIMARY_SKILLS: WorkflowPrimarySkill[] = [
  "asset-image-gen",
  "global-asset-parser",
  "storyboard-image-gen",
  "storyboard-list-parser",
  "storyboard-video-gen",
];
export const WORKFLOW_UPLOAD_SKILLS: WorkflowUploadSkill[] = ["upload-images"];
