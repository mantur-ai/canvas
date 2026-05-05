import type {
  ImageBedConfig,
  ImageModelConfig,
  VideoModelConfig,
  VideoReferenceMode,
  WorkflowFeature,
  WorkflowPrimarySkill,
  WorkflowUploadSkill,
} from "@/lib/config-schema";

export type ConfigSection = "image" | "video" | "imageBed" | "workflowSkill";

export type SettingsFormValues = {
  name: string;
  apiKey: string;
  example: string;
  videoReferenceMode: VideoReferenceMode;
  isDefault: boolean;
  primarySkill: WorkflowPrimarySkill;
  uploadSkill: WorkflowUploadSkill | "none";
};

export type WorkflowSkillConfig = {
  id: WorkflowFeature;
  name: WorkflowFeature;
  primarySkill: WorkflowPrimarySkill;
  uploadSkill?: WorkflowUploadSkill;
};

export type ConfigItem = ImageModelConfig | VideoModelConfig | ImageBedConfig | WorkflowSkillConfig;

export type FeedbackKey =
  | "modelManager.feedback.loadError"
  | "modelManager.feedback.saveError"
  | "modelManager.feedback.saved"
  | "";
