---
name: storyboard-list-parser
description: Parse one selected project episode from script.md into storyboard beats, then submit the parsed list to the backend API.
---

# Storyboard List Parser

Use this skill when the requested feature is one-click storyboard parsing or splitting one selected episode into storyboard beats.

## What This Skill Does

1. Read the selected project context:
   - `projects/currentProject.json`
   - `projects/{projectId}/config.json`
   - `projects/{projectId}/script.md`
   - `projects/{projectId}/project.json`
   - `projects/{projectId}/images/images.json`
2. Use `script.md` as the episode source.
3. Use `images/images.json` as the asset prompt, asset name, category, URL, and reference metadata source.
4. Parse only the selected episode into storyboard beats.
5. Call the backend API with the parsed storyboard list.

The skill does not write files. The backend API is responsible for storing data and writing project files.

## API Call

Submit the parsed storyboards to:

```bash
curl --noproxy "*" --request PUT "http://localhost:3000/api/projects/{projectId}/episode/{episodeId}" \
  --header "Content-Type: application/json" \
  --data '{"storyboards":[ ... ]}'
```

Request body:

```json
{
  "storyboards": [
    {
      "name": "分镜1 标题",
      "description": "Story beat description",
      "prompt": "Generation-ready storyboard image prompt",
      "videoPrompt": "Generation-ready storyboard video prompt"
    }
  ]
}
```

Only send `name`, `description`, `prompt`, and `videoPrompt` for each storyboard item. Do not send `id`, `images`, `videos`, or `selectedVideo`; the backend owns those fields.

## Parsing Notes

- Keep story order.
- Locate the selected episode by the episode ID/name/number supplied by the command. For Chinese scripts, headings may look like `### 第5集 布局`.
- The selected episode ends before the next episode heading. If it is the last scripted episode, stop before the next top-level or outline section, such as `## 五、后续剧情大纲`.
- Make each beat useful for image and video generation.
- Use the project recipe/style information from project context when it is available.

## Video Duration Budget

Each storyboard item represents one short generated video shot with a hard 15-second maximum duration budget.

- Every `videoPrompt` must be executable within 8-15 seconds.
- Prefer 8-12 seconds for normal beats; use up to 15 seconds only for dense but still single-purpose beats.
- Do not put more than one major action beat, long dialogue block, long narration block, repeated emotional turn, or multiple location/time changes into a single storyboard.
- If the source script segment needs more than 15 seconds, split it into multiple storyboard items instead of writing one long `videoPrompt`.
- Each split storyboard must have its own `name`, `description`, `prompt`, and `videoPrompt`.
- Each `videoPrompt` must contain one clear beginning, one main action or emotional change, and a settled ending.
- Do not write time segments beyond 15 seconds. Allowed segment ranges must stay within `0-15秒`, such as `0-3秒`, `3-8秒`, `8-12秒`, and `12-15秒`.
- If dialogue, voiceover, or subtitle-worthy narration from the source script belongs to the beat, preserve it in the `videoPrompt`.
- If the spoken content does not fit naturally within one 15-second storyboard, split the source segment into multiple storyboard items at natural semantic breaks and distribute the lines in source order.
- Do not silently drop dialogue, and do not convert a dialogue-bearing source beat into a silent visual beat unless the source script itself has no spoken content.
- Only make minimal compression when the original wording is repetitive and the story meaning, speaker intent, and emotional turn remain fully intact.

## Continuity Rules

Adjacent storyboards must cut together smoothly.

- For every storyboard after the first, `videoPrompt` must explicitly connect to the previous storyboard's ending state unless the script clearly changes time, location, or scene.
- For every storyboard before the last, the ending state must naturally set up the next storyboard's beginning.
- Each `videoPrompt` must include a clear start state and end state.
- The start state should preserve the prior shot's character position, posture, emotional intensity, camera direction, scene, lighting, and important props when the story continues in the same moment.
- The end state should land on a stable pose, gaze, camera frame, object position, or transition-ready visual that the next storyboard can inherit.
- If the script requires a discontinuity, write the transition explicitly in `videoPrompt`, such as `切到`, `黑场后`, `屏幕闪白转场`, `数小时后`, `同一地点稍后`, or `Cut to`, `After a black transition`, `Hours later`.
- Do not allow unexplained jumps in location, time, character state, emotional state, camera scale, or action direction.
- When splitting a long script segment into multiple storyboard items, make the split points continuous: the previous storyboard's end state should be the next storyboard's start state, with matching scene, light, character pose, and action direction.

## Output Language

All generated text in the payload — every storyboard `name`, `description`, `prompt`, and `videoPrompt` — must be written in the **current page language**, supplied by the trigger context as `[Page Language]\n<locale>` (`zh` for Simplified Chinese, `en` for English). This overrides the script language.

- `zh` → write all four fields in Simplified Chinese, including camera/scene structure phrases.
- `en` → write all four fields in English. Translate camera/scene structure phrases as well.
- When applying the **Character Naming Rule** below, look up each character's canonical asset `name` from `images/images.json` as it currently exists. Do not re-translate the asset name — use it verbatim, regardless of the page language, so storyboard prompts always match the persisted character record.
- Quoted dialogue lines stay in the language they were written in inside `script.md` (do not translate the spoken content). Only narrative/action/camera text follows the page language.
- If `[Page Language]` is missing from the trigger context, fall back to the script's dominant language.

## Dialogue Preservation Rules

- When the source script contains dialogue, voiceover, or subtitle-worthy narration for a beat, `videoPrompt` must include that spoken content explicitly.
- Preserve the original spoken wording from `script.md` whenever possible. Do not paraphrase dialogue into action-only description.
- Keep the speaker identity with each spoken line when the speaker is known.
- Dialogue must appear inside `videoPrompt`, not only inside `description`.
- If a source segment contains multiple lines that cannot fit naturally into one 8-15 second shot, split it into consecutive storyboard items and distribute the lines in source order instead of deleting them.
- A storyboard with no spoken content should be treated as silent only when the corresponding source segment truly has no dialogue, voiceover, or narration.
- Do not invent dialogue that is absent from the script.

## Video Prompt Structure

For every `videoPrompt`, use a structure that keeps spoken content visible and separable:

- `画面：` / `Visual:`
- `动作：` / `Action:`
- `对白：` / `Dialogue:`
- `声音：` / `Sound:`
- `结尾状态：` / `End state:`

If the beat contains spoken content, write one or more quoted lines under `对白：` / `Dialogue:` in source order with the speaker name when known.
If the beat has no spoken content in the source segment, write `对白：无` / `Dialogue: None`.

## Scene Prompt Rule

When the storyboard `prompt` or `videoPrompt` describes the scene/environment context, do **not** embed character figures or people in the scene description itself. Scene context must describe environment, layout, lighting, time of day, weather, atmosphere, and props only. Reference any characters present in the beat explicitly via `@character_name` (or by named subject) outside of the scene-environment portion of the prompt — never as part of the scene description.

When a storyboard beat clearly matches one `scenes` asset from `images/images.json`, include that scene asset's exact `name` in both `prompt` and `videoPrompt` as plain text, for example `场景参考：岳家客厅` or `Scene reference: Yue family living room`. This makes the backend bind the generated scene reference image to the storyboard. Do not write UUID markers, paths, or `@图片N` labels into stored prompts.

Before submitting the storyboard list, review every `prompt` and `videoPrompt`: any scene/environment phrase must be an empty environment description. Remove words that place people or character bodies inside the environment, including crowd, passerby, silhouette, figure, protagonist, he/she/they, man, woman, child, 人、人群、路人、身影、人物、男人、女人、孩子、主角、他、她、他们. Character presence belongs only in the action/subject part of the beat using the canonical character asset name.

## Character Naming Rule (Non-Dialogue References)

In `prompt` and `videoPrompt`, every reference to a character that appears **outside of dialogue lines** — i.e., in action, stage direction, scene description, camera direction, or any narrative description — must use the canonical character asset `name` from `images/images.json` (the `characters` records). This includes:

- Pronouns (他/她/他们/she/he/they) → replace with the asset name.
- Relational/role labels (母亲、那个男人、老板、女主、protagonist、the woman) → replace with the asset name.
- Nicknames or in-script aliases that map to a known character → replace with the asset name.
- Variant references → use the variant's asset name (`<base>-<tag>`, e.g. `苏寒-受伤`) when the beat depicts that specific form; otherwise use the base name.

Match script-mentioned characters to entries in `images/images.json` by semantic identity. If a referenced character cannot be matched to any `characters` asset, keep the script's wording unchanged and flag it in the parse summary rather than inventing an asset name.

Dialogue itself (the spoken lines) is left as-is — characters may address each other with pronouns, nicknames, or relational terms inside their speech. The rule applies only to the surrounding non-dialogue prompt text.
