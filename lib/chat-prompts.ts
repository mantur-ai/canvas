import { DEFAULT_WORKFLOW_SKILLS, type AppConfig } from "@/lib/config-schema";

export type ChatFeatureSkill =
  | "asset-parse"
  | "asset-map-generate"
  | "asset-generate"
  | "general-chat"
  | "asset-panel-generate"
  | "storyboard-image-generate"
  | "storyboard-parse"
  | "video-generate";

type BuildSystemPromptParams = {
  featureSkill: ChatFeatureSkill;
  projectId: string;
  projectRoot: string;
  workflowSkills?: AppConfig["workflowSkills"];
};

type BuildFeaturePromptParams = {
  featureSkill: ChatFeatureSkill;
  userText: string;
};

const joinPrompt = (parts: string[]) => parts.join(" ");
const PATH_PROMPT = "Use project-relative paths only.";
const withPathPrompt = (prompt: string) => joinPrompt([prompt, PATH_PROMPT]);
export const PROJECT_ROOT_PROMPT_TOKEN = "{{PROJECT_ROOT}}";

export const FIXED_SYSTEM_PROMPT_TEMPLATE =
  "[System Instruction] " +
  "Skills are located at {projectRoot}/skills/. Use the active skill routing below as the source of truth. " +
  "Read only the active skill folder's SKILL.md and execute that skill directly. " +
  "Never ask the user for a skill folder name. " +
  "All file reads and writes must be performed exclusively within {projectRoot}/projects/{projectId}/. Never create or modify files outside this directory. " +
  "Never generate any files inside the skills/ directory.";
const COMMAND_PROMPTS = {
  analyze: withPathPrompt(
    "Run ~analyze: write asset prompts to images/images.json and grouped references to project.json.assets.",
  ),
  generateAssets: withPathPrompt(
    "Run ~generate-assets: save generated references to images/{uuid}.png and update images/images.json.",
  ),
  generateStoryboardImages: withPathPrompt(
    "Run ~generate-storyboard-images: save first/last frames to images/{uuid}.png and update frame fields.",
  ),
  uploadAssetImages: withPathPrompt(
    "Run ~upload-images for generated asset reference images only: reuse stored publicUrl when reachable, otherwise upload and store publicUrl through the backend images API.",
  ),
  uploadStoryboardImages: withPathPrompt(
    "Run ~upload-images for generated storyboard frame images only: reuse stored publicUrl when reachable, otherwise upload and store publicUrl through the backend images API.",
  ),
  uploadVideoReferenceImages: withPathPrompt(
    "Run ~upload-images for video reference images required by the selected video model: reuse stored publicUrl when reachable, otherwise upload and store publicUrl through the backend images API.",
  ),
  linkAssets: withPathPrompt("Run ~link-assets: update the target storyboard images field."),
  splitEpisode: withPathPrompt("Run ~split-episode: write episode/{episode_id}.json."),
  status: withPathPrompt("Run ~status: output only project progress."),
  storyboardPrompts: withPathPrompt(
    "Run ~storyboard-prompts: write episodes/{episode_id}/image-prompts/{storyboard_id}.md.",
  ),
  videoPrompts: withPathPrompt(
    "Run ~video-prompts: write episodes/{episode_id}/video-prompts/{storyboard_id}.md.",
  ),
  generateVideos: withPathPrompt(
    "Run ~generate-videos: save videos/{uuid}.mp4, update videos/videos.json, and update the storyboard videos field.",
  ),
} as const;

const ASSET_STORAGE_GUARD =
  "Keep data serializable. Do not write assets.json. Set project.json assetsParsed to true.";
const CHAT_PROMPT_NO_WRITE_BACK =
  "Treat Chat/User Instruction text as a temporary generation override only. Do not write it back to source prompt fields such as images/images.json[].prompt, episode prompt, or episode videoPrompt. Do not write generation manifests.";

export const ASSET_PARSE_USER_PROMPT = "Parse project assets.";
export const ASSET_GENERATE_USER_PROMPT = withPathPrompt(
  "Use the matched asset image generation skill. Prefer ~generate-assets when supported.",
);
export const STORYBOARD_PARSE_USER_PROMPT = "Parse selected episode.";

type FeatureSkillRoute = {
  prompt: string;
  uploadPrompt?: string;
};

const FEATURE_SKILL_PROMPTS: Record<ChatFeatureSkill, FeatureSkillRoute> = {
  "asset-parse": {
    prompt: joinPrompt(["Feature: asset parsing.", COMMAND_PROMPTS.analyze, ASSET_STORAGE_GUARD]),
  },
  "asset-map-generate": {
    prompt: joinPrompt([COMMAND_PROMPTS.linkAssets, "Preserve stable asset IDs."]),
  },
  "asset-generate": {
    prompt: joinPrompt([
      "Feature: asset image generation.",
      COMMAND_PROMPTS.generateAssets,
      CHAT_PROMPT_NO_WRITE_BACK,
      "Keep existing valid assets unless replacement is requested.",
    ]),
  },
  "general-chat": {
    prompt: joinPrompt([
      "Use project context. Do not change files unless requested.",
      `If the user asks for project progress or uses ~status, ${COMMAND_PROMPTS.status}`,
      "If the user explicitly asks for a workflow, infer the closest configured workflow skill.",
    ]),
  },
  "asset-panel-generate": {
    prompt: joinPrompt([
      "Feature: asset image generation.",
      COMMAND_PROMPTS.generateAssets,
      CHAT_PROMPT_NO_WRITE_BACK,
      "Update only the selected asset image item.",
    ]),
  },
  "storyboard-image-generate": {
    prompt: joinPrompt([
      "Feature: storyboard image generation.",
      COMMAND_PROMPTS.generateStoryboardImages,
      CHAT_PROMPT_NO_WRITE_BACK,
      "Update only the selected storyboard image/media item.",
    ]),
  },
  "storyboard-parse": {
    prompt: joinPrompt([
      "Feature: storyboard parsing.",
      "Parse the selected episode into storyboard beats.",
      "Read script source from script.md and asset prompt/reference metadata from images/images.json.",
      "Locate the selected episode by the provided episode ID, episode name, and episode number context; parse only that episode section.",
      "Return storyboard items with name, description, prompt, and videoPrompt for the selected episode.",
    ]),
  },
  "video-generate": {
    prompt: joinPrompt([
      "Feature: storyboard video generation.",
      "Use the selected video generation skill directly.",
      CHAT_PROMPT_NO_WRITE_BACK,
      "Use the supplied prompt, model config, duration, shot options, project recipe pack, and temporary reference context.",
      "After the video model returns a provider URL, call the backend video store-generated API; do not write files directly.",
    ]),
  },
};

function buildSkillRoutePrompt(
  featureSkill: ChatFeatureSkill,
  workflowSkills: AppConfig["workflowSkills"] = DEFAULT_WORKFLOW_SKILLS,
) {
  const promptRoute = FEATURE_SKILL_PROMPTS[featureSkill];
  const configRoute = featureSkill === "general-chat" ? null : workflowSkills[featureSkill];
  const activeSkill =
    configRoute === null
      ? "auto-select only when the user asks a non-workflow question"
      : `${configRoute.primarySkill} ({projectRoot}/skills/${configRoute.primarySkill}/SKILL.md)`;
  const uploadRoute = promptRoute.uploadPrompt
    ? [
        `[Upload Function Route]`,
        `Skill: ${configRoute?.uploadSkill ?? "upload-images"} ({projectRoot}/skills/${configRoute?.uploadSkill ?? "upload-images"}/SKILL.md)`,
        promptRoute.uploadPrompt,
      ].join("\n")
    : "";

  return [
    `[Active Skill Route]`,
    `Feature: ${featureSkill}`,
    `Primary skill: ${activeSkill}`,
    uploadRoute,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildChatSystemPrompt({
  featureSkill,
  projectId,
  projectRoot,
  workflowSkills,
}: BuildSystemPromptParams) {
  const fixedPrompt = FIXED_SYSTEM_PROMPT_TEMPLATE.replaceAll(
    "{projectRoot}",
    projectRoot,
  ).replaceAll("{projectId}", projectId);
  const skillRoutePrompt = buildSkillRoutePrompt(featureSkill, workflowSkills).replaceAll(
    "{projectRoot}",
    projectRoot,
  );

  return [fixedPrompt, skillRoutePrompt].join("\n");
}

export function buildFeatureUserPrompt({ featureSkill, userText }: BuildFeaturePromptParams) {
  return [
    `[Feature Task]\n${FEATURE_SKILL_PROMPTS[featureSkill].prompt}`,
    `[User Instruction]\n${userText}`,
  ].join("\n");
}
