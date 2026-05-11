---
name: global-asset-parser
description: Parse a project's script.md into global assets and asset prompts, then persist the asset catalog via the backend image bulk-replace API. URLs are not generated at parse time.
---

# Global Asset Parser

Use this skill when the requested feature is one-click asset parsing, global asset extraction, or asset prompt creation from `script.md`.

## Strict File Access (HARD RULE)

This skill is **read-only on disk** and limited to two files:

- The only files this skill may open are `{projectRoot}/projects/{projectId}/script.md` and `{projectRoot}/projects/{projectId}/project.json`.
- Every other file under the project, the workspace, or the skill directory is out of scope. Do not open, list, stat, or otherwise inspect any other path.
- The skill never writes to disk. All persistence goes through the backend image bulk-replace API documented below.
- The skill makes no GET API calls; it only sends the parsed asset list via PATCH.

If a needed input is not in `script.md` or `project.json`, stop and report what is missing instead of looking elsewhere.

## Scope

- Operate on a single project per invocation.
- This skill never produces URLs, file paths, or curl commands as part of the asset payload. It only parses information.

## Output Language

All generated text in the payload — every asset `name` and every `prompt` — must be written in the **current page language**, supplied by the trigger context as `[Page Language]\n<locale>` (`zh` for Simplified Chinese, `en` for English; treat anything else as the same locale string). This overrides the script language.

- `zh` → write `name` and `prompt` in Simplified Chinese, including all structure phrases (`角色设定图，...`, `电影场景环境参考图，...`, `视角：...`, `重点：...`).
- `en` → write `name` and `prompt` in English. Translate the structure phrases too: `Character reference sheet, clean white background. ...`, `Cinematic scene environment reference, ...`, `View: ...`, `Focus: ...`.
- Translate character/scene/prop names from the script when the page locale differs from the script language. Keep the translated `name` stable across re-parses so the backend can re-match by `(type, name)` — never alternate between languages once a project has been parsed in one locale.
- If `[Page Language]` is missing from the trigger context, fall back to the script's dominant language and report the fallback in the summary.

## Backend Storage API

Persist the parsed asset catalog by calling:

```bash
curl --request PATCH "http://localhost:3000/api/projects/{projectId}/images" \
  --header "Content-Type: application/json" \
  --data '{"action":"bulk-replace","images":[ ... ]}'
```

**Persistence payload must not include `url`.** Parsing produces text-only records (`name`, `type`, `source`, `prompt`). The backend assigns/preserves `url` on its own — never send a URL value (empty string, placeholder, or otherwise) when persisting parsed assets.

The backend will:

- Match each incoming record against the existing asset catalog by `(type, name)` and reuse the existing `id`, `url`, and `source` so previously generated images are not lost.
- Assign a fresh UUID for any new asset.
- Rebuild the project's grouped asset index from the merged catalog (preserving valid character `children` from prior state, dropping stale IDs).
- Set `assetsParsed` based on whether the catalog is non-empty.
- Remap storyboard image references on the server side.

Response: `{ "images": [...], "project": { ... } }`. Treat it as the source of truth for success.

## Output Contracts

### Image Record Shape

Each entry in the `images` payload describes one global asset:

```json
{
  "name": "苏寒",
  "type": "characters",
  "source": "generate",
  "prompt": "Production-ready visual prompt"
}
```

Field rules:

- `name` (required): asset name in the current page language (see **Output Language** above). The backend uses `(type, name)` as the merge key, so keep the name stable across re-parses for the same logical asset and locale.
- `type` (required): one of `characters`, `scenes`, `props`. Do not parse, create, or output `voices` or `videos` records.
- `source`: always `"generate"` for skill-produced records. The backend preserves an existing record's source when the record is matched.
- `prompt` (required): production-ready visual prompt for the asset. See Prompt Requirements below.

Do **not** send these fields. They are owned by the backend:

- `id`: the backend reuses the existing UUID when `(type, name)` matches a prior record, otherwise it assigns a new UUID.
- `url`: the backend keeps the previously generated URL when matched; new records start with empty URL until `asset-image-gen` produces one.

## Parsing Rules

1. Identify reusable global assets from the full `script.md`:
   - `characters`: named recurring roles, important one-off roles, and character variants needed for visual consistency.
   - `scenes`: recurring locations, distinctive settings, or scene environments.
   - `props`: important reusable objects, vehicles, devices, documents, symbols, or wardrobe items.
   - Do not identify, parse, or create `voices` or `videos` assets.
2. De-duplicate by normalized semantic identity, not by exact wording.
3. Stable identity:
   - Use the same `name` and `type` across re-parses for the same logical asset so the backend can preserve the prior `id` and `url`.
4. Character variants (multi-form / 多形态):
   - When the same logical character appears in distinguishable forms (for example: 受伤、便装/正装、童年/少年/成年、伪装、不同身份、不同造型、人形与兽形等), each form must be emitted as its own separate `characters` record — one record per form. Do not merge multiple forms into a single prompt.
   - The base form is the canonical record; use the bare name (for example `苏寒`).
   - Each variant uses a derived name in the pattern `<base name>-<variant tag>` (for example `苏寒-受伤`, `苏寒-童年`, `苏寒-便装`). The variant tag should be short and visually descriptive so re-parses produce the same name.
   - Variant records must be wired into the base character's `children` after persistence. See the **Variant Wiring** step in the Write Procedure: after `bulk-replace` returns, the skill issues one `PATCH` per variant to attach it to the base character so it shows up under that character's `children`.
5. Keep `scenes` and `props` flat. Do not parse `voices` or `videos`.

## Prompt Requirements

Each `prompt` should be production-ready, detailed enough for direct generation, and free of unsupported filler. Include only information supported by `script.md`:

- Visual identity: appearance, age range, clothing, materials, color, era, style, mood.
- Scene identity: location, time of day, environment, lighting, atmosphere, notable layout.
- Prop identity: shape, material, scale, marks, usage context.

Do not invent brand-new story facts. If details are missing, describe the asset neutrally and mark unknown aspects as flexible inside the prompt.

### Quality Enhancement Rules

- Write prompts as coherent visual direction, not keyword piles.
- Preserve the project's dominant visual style when it is stated in `script.md` or `project.json.description`; carry the same style language across characters, scenes, and props.
- Character prompts must be reference-sheet ready. For every `characters` record, write the prompt so it can directly generate a character design sheet:
  - Start with the output layout requirement in the project/script language: one clean character reference image, white background, left half face close-up, right half full-body front view, side view, and back view, arranged horizontally.
  - Then describe the character in complete narrative paragraphs, not tags.
  - Include age range, gender presentation when supported, regional visual traits when supported, face shape, eyes, hair, body, clothing silhouette, color, material, accessories, and overall temperament.
  - Make the character distinguishable at a glance from other characters in the same project.
  - For character variants, state the relationship to the base character and the visible difference.
- Character prompt structure should follow this pattern while staying inside the single `prompt` string:
  - `角色设定图，白色干净背景。画面左半部分是面部特写，右半部分是全身正面、侧面和背面三个角度的设定图，水平排列。`
  - paragraph 1: face, hair, age, identity, expression.
  - paragraph 2: body, clothing, shoes, accessories, material details.
  - paragraph 3: posture and temperament.
- Scene prompts must be environment-reference ready:
  - Include place type, time, spatial layout, viewpoint, main light source, light direction, color temperature, color palette, important props, foreground/midground/background depth, atmosphere, and visual style.
  - Use film-scene language such as establishing shot, medium-wide view, depth, backlight, side light, practical light, warm/cool contrast, wet reflection when useful.
  - Identify the scene's core visual focus with `重点：...` (Chinese) or `Focus: ...` (English).
  - **Scene prompts must NOT contain people or characters.** A scene asset is an empty environment reference. Do not describe figures, silhouettes, crowds, or any human/character presence — even implicitly (no "a person stands here", no "people walking by"). Characters are separate `characters` assets and are composed in at storyboard generation time.
- Scene prompt structure should follow this pattern while staying inside the single `prompt` string:
  - `电影场景环境参考图，[整体风格]。`
  - `视角：[地点类型、时间、空间布局、光源与方向、色调、关键物件、前中后景层次、氛围情绪]。`
  - `重点：[核心视觉元素]。`
- Prop prompts must be reference-image ready on a clean white background, like character assets. For every `props` record, write the prompt as one isolated prop/object reference image on a white clean background, with no scene environment, no hands, no people, and no character presence.
- Prop prompts should make the object identifiable at thumbnail size: silhouette, material, scale, color, markings, wear, and how it appears in the story.
- Avoid abstract-only wording such as "lonely", "powerful", or "mysterious" unless it is grounded in visual or audible details.
- Avoid negative phrasing where possible.
- Do not repeat unsupported details merely to make prompts richer. Quality comes from specificity grounded in the script, not invention.

### High-Quality Prompt Examples

Use these abbreviated examples as style targets. Adapt the language to the project/script language and only include details supported by the script.

Character prompt style:

```text
角色设定图，白色干净背景。画面左半部分是面部特写，右半部分是全身正面、侧面和背面三个角度的设定图，水平排列。

这是一位二十六七岁的中国女性，鹅蛋脸，弯眉杏眼，瞳色深棕近黑，鼻梁挺直但线条柔和，肤色白皙偏暖。头发是自然黑色中长发，长度刚过肩膀，发尾微微内扣。

身高约一米六五，身材匀称偏纤细。上身穿米白色圆领羊绒毛衣，下身是深灰色高腰直筒西裤，脚穿黑色尖头低跟皮鞋。左手腕戴银色表盘的极简手表，耳朵上是一对小巧珍珠耳钉。

整体气质是干练但温和，站姿端正但不僵硬，眼神沉稳。
```

Scene prompt style:

```text
电影场景环境参考图，真人写实，电影感构图。
视角：现代都市写字楼的开放式办公区，深夜十一点。大部分工位已经空了，桌面散落文件和未合上的笔记本电脑，屏幕微光在黑暗中闪烁。靠窗的一排台灯投下暖黄色光圈，落地窗外是冷蓝色城市夜景，窗户映出室内倒影。画面有前景桌面、中景工位、远景城市灯火的纵深。
重点：台灯暖光与窗外冷光的反差，加班后空旷疲惫的空间感。
```

Do not copy these exact identities into the project unless the script describes them. Use them only as structure and detail-density references.

## Write Procedure

1. Load `project.json` from disk; respect the project's stated style/language when constructing the payload (the skill never sends project metadata updates).
2. Read `script.md` from disk.
3. Parse `script.md` and build the `images` payload using only `characters`, `scenes`, and `props`. Each entry must include `name`, `type`, `source: "generate"`, and `prompt`. Do not include `id` or `url` — persistence does not require a URL, and the backend will not accept one from this skill.
4. Send the payload to the bulk-replace API:

   ```bash
   curl --request PATCH "http://localhost:3000/api/projects/{projectId}/images" \
     --header "Content-Type: application/json" \
     --data '{"action":"bulk-replace","images":[ ... ]}'
   ```

   Treat the response `images` and `project` fields as the source of truth.
5. Validate before sending:
   - `images` is a JSON array.
   - every entry has a non-empty `name`.
   - every entry's `type` is one of `characters`, `scenes`, `props`.
   - every `name` and `prompt` uses the locale supplied by `[Page Language]` (see **Output Language**).
   - no entry contains `url`, `publicUrl`, `publicUrlUpdatedAt`, or placeholder URL fields; parsed assets are text-only.
6. **Variant Wiring** — for every variant character emitted in step 3 (any `characters` record whose `name` matches `<base>-<tag>`):
   - Resolve the variant's persisted `id` and the base character's `id` from the `images` array returned by `bulk-replace` (match by `name`).
   - If the base character is not in the response (variant has no parent in the catalog), skip wiring for that variant and report it in the summary.
   - Otherwise issue one `PATCH` per variant to attach it under the base character's `children`:

     ```bash
     curl --request PATCH "http://localhost:3000/api/projects/{projectId}/images" \
       --header "Content-Type: application/json" \
       --data '{"category":"characters","imageId":"<variant_id>","parentId":"<base_id>"}'
     ```

   - Treat each PATCH's response `project.assets.characters` as the source of truth for the wired children.
7. Report a short summary with counts per type, the number of variants wired into base characters' `children`, and any assumptions. Do not claim ID or URL counts; those are owned by the backend.

## Safety Checks

- Wrap disk reads and the PATCH call in error handling.
- Re-check the **Strict File Access** rule before any tool call: only `script.md` and `project.json` may be opened.
- Do not produce URLs, file paths, or curl commands as part of the asset payload.
- Do not store functions, DOM nodes, absolute paths, or unserializable values in payloads.
- Treat backend non-2xx responses as failures and report the exact error.
