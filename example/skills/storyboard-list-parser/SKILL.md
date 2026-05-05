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
curl --request PUT "http://localhost:3000/api/projects/{projectId}/episode/{episodeId}" \
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

## Output Language

All generated text in the payload — every storyboard `name`, `description`, `prompt`, and `videoPrompt` — must be written in the **current page language**, supplied by the trigger context as `[Page Language]\n<locale>` (`zh` for Simplified Chinese, `en` for English). This overrides the script language.

- `zh` → write all four fields in Simplified Chinese, including camera/scene structure phrases.
- `en` → write all four fields in English. Translate camera/scene structure phrases as well.
- When applying the **Character Naming Rule** below, look up each character's canonical asset `name` from `images/images.json` as it currently exists. Do not re-translate the asset name — use it verbatim, regardless of the page language, so storyboard prompts always match the persisted character record.
- Quoted dialogue lines stay in the language they were written in inside `script.md` (do not translate the spoken content). Only narrative/action/camera text follows the page language.
- If `[Page Language]` is missing from the trigger context, fall back to the script's dominant language.

## Scene Prompt Rule

When the storyboard `prompt` or `videoPrompt` describes the scene/environment context, do **not** embed character figures or people in the scene description itself. Scene context must describe environment, layout, lighting, time of day, weather, atmosphere, and props only. Reference any characters present in the beat explicitly via `@character_name` (or by named subject) outside of the scene-environment portion of the prompt — never as part of the scene description.

Before submitting the storyboard list, review every `prompt` and `videoPrompt`: any scene/environment phrase must be an empty environment description. Remove words that place people or character bodies inside the environment, including crowd, passerby, silhouette, figure, protagonist, he/she/they, man, woman, child, 人、人群、路人、身影、人物、男人、女人、孩子、主角、他、她、他们. Character presence belongs only in the action/subject part of the beat using the canonical character asset name.

## Character Naming Rule (Non-Dialogue References)

In `prompt` and `videoPrompt`, every reference to a character that appears **outside of dialogue lines** — i.e., in action, stage direction, scene description, camera direction, or any narrative description — must use the canonical character asset `name` from `images/images.json` (the `characters` records). This includes:

- Pronouns (他/她/他们/she/he/they) → replace with the asset name.
- Relational/role labels (母亲、那个男人、老板、女主、protagonist、the woman) → replace with the asset name.
- Nicknames or in-script aliases that map to a known character → replace with the asset name.
- Variant references → use the variant's asset name (`<base>-<tag>`, e.g. `苏寒-受伤`) when the beat depicts that specific form; otherwise use the base name.

Match script-mentioned characters to entries in `images/images.json` by semantic identity. If a referenced character cannot be matched to any `characters` asset, keep the script's wording unchanged and flag it in the parse summary rather than inventing an asset name.

Dialogue itself (the spoken lines) is left as-is — characters may address each other with pronouns, nicknames, or relational terms inside their speech. The rule applies only to the surrounding non-dialogue prompt text.
