import type {
  ImageBedConfig,
  ImageModelConfig,
  VideoModelConfig,
  VideoReferenceMode,
} from "@/lib/config-schema";

export type ConfigSection = "image" | "video" | "imageBed";

export type SettingsFormValues = {
  name: string;
  apiKey: string;
  example: string;
  videoReferenceMode: VideoReferenceMode;
  isDefault: boolean;
};

export type ConfigItem = ImageModelConfig | VideoModelConfig | ImageBedConfig;

export type FeedbackKey =
  | "modelManager.feedback.loadError"
  | "modelManager.feedback.saveError"
  | "modelManager.feedback.saved"
  | "";
