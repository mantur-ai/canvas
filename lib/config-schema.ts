import { z } from "zod";

export const videoReferenceModeSchema = z.enum(["all-purpose", "first-last-frame"]);
export const workflowFeatureSchema = z.enum([
  "asset-parse",
  "asset-map-generate",
  "asset-generate",
  "asset-panel-generate",
  "storyboard-image-generate",
  "storyboard-parse",
  "video-generate",
]);
export const workflowPrimarySkillSchema = z.enum([
  "asset-image-gen",
  "global-asset-parser",
  "storyboard-image-gen",
  "storyboard-list-parser",
  "storyboard-video-gen",
]);
export const workflowUploadSkillSchema = z.enum(["upload-images"]);

export const imageModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  apiKey: z.string(),
  example: z.string().min(1),
  providerId: z.string().min(1).optional(),
});

export const videoModelSchema = imageModelSchema.extend({
  videoReferenceMode: videoReferenceModeSchema,
});

export const imageBedSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  apiKey: z.string(),
  example: z.string().min(1),
  isDefault: z.boolean(),
});

export const workflowSkillRouteSchema = z.object({
  primarySkill: workflowPrimarySkillSchema,
  uploadSkill: workflowUploadSkillSchema.optional(),
});

export type WorkflowFeature = z.infer<typeof workflowFeatureSchema>;
export type WorkflowPrimarySkill = z.infer<typeof workflowPrimarySkillSchema>;
export type WorkflowUploadSkill = z.infer<typeof workflowUploadSkillSchema>;
export type WorkflowSkillRoute = z.infer<typeof workflowSkillRouteSchema>;

export const DEFAULT_WORKFLOW_SKILLS: Record<WorkflowFeature, WorkflowSkillRoute> = {
  "asset-parse": {
    primarySkill: "global-asset-parser",
  },
  "asset-map-generate": {
    primarySkill: "storyboard-list-parser",
  },
  "asset-generate": {
    primarySkill: "asset-image-gen",
  },
  "asset-panel-generate": {
    primarySkill: "asset-image-gen",
  },
  "storyboard-image-generate": {
    primarySkill: "storyboard-image-gen",
  },
  "storyboard-parse": {
    primarySkill: "storyboard-list-parser",
  },
  "video-generate": {
    primarySkill: "storyboard-video-gen",
  },
};

export const workflowSkillsSchema = z
  .partialRecord(workflowFeatureSchema, workflowSkillRouteSchema)
  .default(DEFAULT_WORKFLOW_SKILLS)
  .transform((routes) => ({
    ...DEFAULT_WORKFLOW_SKILLS,
    ...routes,
  }));

export const appConfigSchema = z.object({
  imageModels: z.array(imageModelSchema),
  videoModels: z.array(videoModelSchema),
  imageBeds: z.array(imageBedSchema),
  workflowSkills: workflowSkillsSchema,
});

export type VideoReferenceMode = z.infer<typeof videoReferenceModeSchema>;
export type ImageModelConfig = z.infer<typeof imageModelSchema>;
export type VideoModelConfig = z.infer<typeof videoModelSchema>;
export type ImageBedConfig = z.infer<typeof imageBedSchema>;
export type AppConfig = z.infer<typeof appConfigSchema>;
