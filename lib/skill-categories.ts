export const SKILL_FOLDER_CATEGORIES = [
  "asset-image-gen",
  "global-asset-parser",
  "storyboard-image-gen",
  "storyboard-list-parser",
  "storyboard-video-gen",
  "upload-images",
] as const;

export type SkillFolderCategory = (typeof SKILL_FOLDER_CATEGORIES)[number];

export const VISIBLE_SKILL_FOLDER_CATEGORIES: SkillFolderCategory[] = [
  "global-asset-parser",
  "storyboard-list-parser",
];
