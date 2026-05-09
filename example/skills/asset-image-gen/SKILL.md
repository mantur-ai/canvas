---
name: asset-image-gen
description: Use when generating asset reference images for global assets. Triggered by ~asset-image-gen, ~generate-assets, or ~generate-assets --only-id <asset_id>. Also triggered by asset-grid UI context with Media ID.
---

# Asset Image Generation

Use this skill when the requested feature is generating asset reference images from parsed asset prompts. This covers both batch generation and single asset regeneration.

## Scope

- Work only inside `{projectRoot}/projects/{projectId}/`.
- Read only `{projectRoot}/projects/currentProject.json`, `{projectRoot}/projects/{projectId}/project.json`, `{projectRoot}/projects/{projectId}/config.json`, and the single `[Skill Temporary Context]` directory supplied in the command.
- Use `currentProject.json` only to resolve the current project ID when the trigger context does not provide one.
- Use `project.json` only to read project generation settings: `aspectRatio` and `resolution`.
- Use the supplied skill temporary context directory to read and analyze the actual `@`-mentioned asset files, reference image files, and temporary image files for this send.
- Every send receives a unique temporary context directory. Never use a fixed temp path, and never read sibling or older `skill-context` directories.
- Do not read, scan, validate, analyze, create, update, or delete any project file that is not explicitly listed above.
- Use trigger context supplied by the UI/agent command for target IDs, overrides, and generation options.
- If the command includes `[Project Recipe Pack]`, treat it as required project-level style and production constraints.
- Treat every readable project file as read-only. Do not write, patch, rewrite, normalize, sort, or reformat `config.json`, `currentProject.json`, or any other project file.
- Do not persist generated media directly. After the model returns a generated image URL or base64 image data, call the backend storage API.
- Never edit files in `skills/` while executing this workflow.

After running, verify success from the backend storage API response only. Do not inspect project files.

## Output Contracts

### Backend Storage API

The skill must not directly persist generated media or metadata. Store successful model output by calling one of these forms:

```bash
curl --request PATCH "http://localhost:3000/api/projects/{projectId}/images" \
  --header "Content-Type: application/json" \
  --data '{"action":"store-generated","imageId":"<asset_id>","resultUrl":"<provider_image_url>","category":"<asset_type>","name":"<asset_name>","source":"generate"}'
```

```bash
curl --request PATCH "http://localhost:3000/api/projects/{projectId}/images" \
  --header "Content-Type: application/json" \
  --data '{"action":"store-generated","imageId":"<asset_id>","resultBase64":"<provider_base64_or_data_url>","category":"<asset_type>","name":"<asset_name>","source":"generate"}'
```

The backend owns all persistence and validation.
The backend preserves `images/images.json[].prompt`. Do not send or store request prompts.

## Trigger Mapping

The following prompt patterns trigger this skill. Match any of these:

| Prompt keyword                                                                  | Meaning                                            |
| ------------------------------------------------------------------------------- | -------------------------------------------------- |
| `~asset-image-gen`                                                              | Primary trigger: standalone asset image generation |
| `~generate-assets`                                                              | Legacy trigger from ai-storyboard-pipeline         |
| `~generate-assets --only-id <asset_id>`                                         | Single asset regeneration                          |
| `Scope: asset-grid` + `Media ID: <id>`                                          | UI asset-grid context (inline chat on asset)       |
| `Scope: canvas-grid` + `Media Type: characters/scenes/props` + `Media ID: <id>` | Canvas asset grid context                          |
| `Feature: asset image generation`                                               | Frontend featureSkill context                      |

## Gate Checks

Before any generation, validate:

1. Resolve `projectId` from trigger context or `{projectRoot}/projects/currentProject.json`.
2. `{projectRoot}/projects/{projectId}/project.json` exists and contains `aspectRatio` and `resolution`.
3. `{projectRoot}/projects/{projectId}/config.json` exists and contains `imageModel` with `apiKey` and `example` (curl template). Legacy fallback fields are allowed only for old projects.
4. The trigger context includes a target asset ID and prompt. If either is missing, stop and report the missing context.
5. If the prompt contains `@` references, use the supplied `[Skill Temporary Context]` directory and its `context.json` manifest to inspect those files. If a referenced image has no copied file and no usable URL, use its `name`/`label` as a text-only reference instead of failing.
6. If any gate check fails, stop and report exactly what is missing. Do not proceed.

## Read Config Procedure

1. Read `config.json`.
2. Find the selected image model in this order:
   - prefer `config.imageModel` (current project config format)
   - fall back to `config.selectedModels.image` (legacy)
   - fall back to `config.selectedModel` only when `config.selectedModel.type` is `"image"` (legacy)
3. Do not require `selectedModel` or `selectedModels` when `imageModel` exists.
4. Extract `apiKey` and `example` (the curl command template).
5. The `example` field contains a working curl template. Treat it as the source of truth for endpoint, method, headers, model, and provider-specific request shape.
6. Read `project.json.aspectRatio` and `project.json.resolution`; these are the authoritative generation format settings.
7. Replace only the prompt, auth placeholder, image references, size/aspect/resolution when applicable, and other UI-supplied generation options.
8. Replace `$ARK_API_KEY` or any placeholder auth value with the actual `apiKey`.
9. If the API supports image-to-image mode, use only reference URLs supplied in trigger context or copied files from the supplied skill context. Do not resolve references from any project file.

## Secret Handling

- **Never trust the displayed `apiKey` value, regardless of harness.** Different harnesses present the key differently — some (e.g. Claude Code) redact it (`abc123...wxyz`, `Bearer ***`); others (e.g. Hermes) display-truncate it for readability while the underlying value is intact. From the model's perspective the two are indistinguishable, and *both* mean the visible string is not safe to substitute into a request.
- Do NOT reason about whether `...` means "redaction" vs "display truncation" and then act on that conclusion. The conclusion is irrelevant — the rule below applies in every case.
- The only correct way to use `apiKey` is to read it fresh from `projects/{projectId}/config.json` inside the same shell tool call that issues the `curl` request, using a one-liner like `KEY=$(jq -r '.imageModel.apiKey' projects/{projectId}/config.json) && curl -H "Authorization: Bearer $KEY" ...` so the key value never has to flow through the model. The shell call may print non-secret response data, status codes, and errors only — never the key, never the auth header.
- **Use `curl` directly. Do not use Python, Node, or any other runtime to call the provider.** The inline wrapper is a single bash command that reads the key and runs `curl` in the same process.
- Never paste any visible `apiKey` value (full-looking, shortened, or `***`) into a `curl` command emitted as a tool call. Even when the visible key looks complete, route it through the bash key-read above.
- Never call a provider with a key value lifted from tool output, chat context, or prior assistant text.
- Do not report that the API key is truncated unless the raw file content actually contains the literal truncated value.

## Write Procedure

For each asset to generate:

1. Read the target asset ID, name, category, and prompt from trigger context or user instruction.
2. Build the curl command:
   - Start from the `example` curl in the selected image model from `config.json`.
   - Replace the `prompt` field with the trigger/user prompt.
   - Merge `[Project Recipe Pack]` into the final prompt without overwriting the user's specific subject/action instructions.
   - If the target asset category/type is `scenes`, enforce an empty-environment prompt: remove or override any instruction to generate people, characters, human figures, silhouettes, crowds, or passersby. Add this constraint to the final provider prompt: `Scene environment only. No people, no characters, no human figures, no silhouettes, no crowds.`
   - Apply `project.json.aspectRatio` and `project.json.resolution` to the provider request. Override existing fields such as `aspectRatio`, `aspect_ratio`, `ratio`, `size`, `imageSize`, or `resolution` when present. If the provider template has no supported field, add the format to the final prompt as plain text: `Output aspect ratio: <aspectRatio>. Output resolution: <resolution>.`
   - Inject the `apiKey` into the authentication header by reading it from `config.json` inside the same bash tool call that runs `curl` (e.g. `KEY=$(jq -r '.imageModel.apiKey' ...) && curl -H "Authorization: Bearer $KEY" ...`) — never paste a visible key value into a `curl` tool call, regardless of how complete it looks, and never call the provider via Python or any other runtime. See **Secret Handling**.
   - Use only context-supplied reference URLs, copied files from the skill context, or options.
   - **`publicUrl` is the preferred reference value when the provider accepts URLs.** For every `@`-mentioned reference, read `[Skill Temporary Context]/context.json`. If the reference's entry has a non-empty `publicUrl`, pass that URL to the provider in the reference image field. The fact that a `publicUrl` is already present means the image bed step has already been done — skip uploading, but never skip passing the URL through to the model. Falling back to the local file or to the asset name should only happen when `publicUrl` is missing or empty.
   - If a referenced image has no available file/URL, use its asset/reference name as text in the prompt and do not include it in reference image content arrays.
3. Execute exactly one image generation request per asset.
4. Parse the model response safely:
   - If the provider returns a direct image URL, pass it to the backend storage API.
   - If the provider returns base64 image data or a `data:image/...;base64,...` data URL, pass it to the backend storage API as `resultBase64`. Do not decode or write files from the skill.
   - If the provider returns a `task_id`, report that async image task storage is not supported by this skill yet.
   - If the response has no usable image URL or base64 image data, report failure and stop.
5. Store the generated image by calling the matching backend API form:
   ```bash
   curl --request PATCH "http://localhost:3000/api/projects/{projectId}/images" \
     --header "Content-Type: application/json" \
     --data '{"action":"store-generated","imageId":"<asset_id>","resultUrl":"<provider_image_url>","category":"<asset_type>","name":"<asset_name>","source":"generate"}'
   ```
   or:
   ```bash
   curl --request PATCH "http://localhost:3000/api/projects/{projectId}/images" \
     --header "Content-Type: application/json" \
     --data '{"action":"store-generated","imageId":"<asset_id>","resultBase64":"<provider_base64_or_data_url>","category":"<asset_type>","name":"<asset_name>","source":"generate"}'
   ```
6. Treat the backend JSON response as the source of truth for success. Do not verify by reading files. The backend preserves the existing image prompt; do not patch source prompt fields yourself.
7. If the API call, response parsing, or backend storage API fails, report the exact error. Do NOT retry. Do NOT mark image generation as success.

## Execution Rules

- **Single target**: Generate only assets explicitly supplied by trigger context. Do not discover targets by reading project files.
- **Asset-grid compatibility**: If the prompt context includes `Scope: asset-grid` and `Media ID: <id>`, treat it as `--only-id <id>`. Use the user instruction text as a replacement prompt if provided.
- **Prompt override is temporary**: The user instruction or chat text may replace the prompt only for this provider request. Never write it back to `images/images.json[].prompt`, `episode prompt`, any source prompt field, or a generation manifest.
- **One API call per asset**: Call the image generation API exactly once per asset. If it fails, mark as failed and report. Do not retry. Do not try alternative models or parameters.
- **Curl template authority**: The selected model's `example` curl is the source of truth. Do not hand-roll a different endpoint or request schema when the example already supplies one.
- **Recipe pack required**: When `[Project Recipe Pack]` is present, apply it to generation as global style, palette, camera, texture, realism, or production constraints.
- **Backend storage only**: Never download generated images or directly persist metadata from the skill. Send the generated provider URL or base64 image data and app image ID to the backend storage API.
- **No manifests**: Do not read, create, update, or delete image generation manifests such as `image-curl-manifest.json`.

- **No placeholder images**: Never download images from placeholder services, external URLs, or generate fallback images with ImageMagick. If the API fails, the asset stays failed with a real error message.

## Failure Format

If generation fails, report exactly:

```text
[Asset Image Generation Failed]
Asset ID: <id>
Asset Name: <name>
Error: <error from API>
Suggestion: <actionable suggestion>
```

## Safety Checks

- Wrap the `currentProject.json`, `config.json`, skill temporary context reads, and all network calls in error handling.
- Do not read or write project files other than `currentProject.json`, `config.json`, and the supplied skill temporary context directory.
- Do not store absolute paths, functions, or unserializable values.
- Never report success unless the backend storage API returns success.
