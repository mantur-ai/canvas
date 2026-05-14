---
name: storyboard-video-gen
description: Generate one storyboard video with the selected video model, then submit the generated video URL to the backend storage API.
---

# Storyboard Video Generation

Use this skill when the command asks to generate or regenerate a storyboard video.

## Inputs

Read only:

- `projects/currentProject.json`
- `projects/{projectId}/project.json`
- `projects/{projectId}/config.json`
- the single `[Skill Temporary Context]` directory supplied by the command, when present

Use command context for:

- `projectId`
- target `Media ID`
- target `Media Name`
- source video prompt
- video options such as duration, shot type, aspect ratio, or resolution
- `[Project Recipe Pack]`
- `@{uuid}` reference markers and temporary reference files

Do not read project storyboard files, image catalogs, video catalogs, manifests, sibling temp folders, or media directories. Do not write files directly.

## Backend Storage API

There are two paths for handing the result to the backend, and **only one of them runs per invocation**:

- **Async path (default for video models that return a `task_id`)**: register the task with `/async-tasks` (see Model Call step 7). The backend API polls the provider, then calls `store-generated` itself. The agent must NOT poll and must NOT call `store-generated` in this path.
- **Direct path (only when the initial generation call already returned a video URL)**: the agent calls `store-generated` directly:

  ```bash
  curl --noproxy "*" --request PATCH "http://localhost:3000/api/projects/{projectId}/videos" \
    --header "Content-Type: application/json" \
    --data '{"action":"store-generated","videoId":"<media_id>","resultUrl":"<provider_video_url>","name":"<storyboard_name>","source":"generate","cover":"<cover_url_or_empty>","duration":"<duration_or_empty>"}'
  ```

In both cases the backend downloads the video, writes files, updates metadata, probes duration, and creates cover data. The skill never writes media files itself.

## Model Call

1. Read `project.json` and `config.json`.
2. Use `project.json.aspectRatio` and `project.json.resolution` as the authoritative generation format settings.
3. Use the selected video model from `config.videoModel`.
4. Use `videoModel.example` as the curl/request template.
5. Replace only:
   - prompt/content text
   - reference media fields
   - duration and shot type from UI options when supplied
   - aspect ratio and resolution from `project.json`
   - auth placeholders with `videoModel.apiKey`
6. Override existing provider fields such as `ratio`, `aspect_ratio`, `aspectRatio`, `resolution`, `size`, or `video_size` when present. If the provider template has no supported field, add the format to the final prompt as plain text: `Output aspect ratio: <aspectRatio>. Output resolution: <resolution>.`
7. Call the video generation endpoint once.
8. **If the provider returns a final video URL on the initial generation call**, skip polling and go straight to the direct `store-generated` API call.
9. **If the provider returns a `task_id` (or any async handle)**, do NOT poll the provider yourself. Async handles include top-level fields such as `task_id`, `id`, `taskId`, and nested provider task objects such as `task.id`. A response like `{"task":{"id":"task_...","status":"queued"}}` is an async handle, not a completed generation. Hand the polling spec to the backend `/async-tasks` endpoint and exit immediately. The backend API owns all polling and final persistence.

   Issue this single registration call (still using the same bash key-read pattern from **Secret Handling** so the auth header is materialized inside the shell call and not pasted by the model):

   ```bash
   KEY=$(jq -r '.videoModel.apiKey' projects/{projectId}/config.json) && \
     curl --noproxy "*" --request POST "http://localhost:3000/api/projects/{projectId}/async-tasks" \
       --header "Content-Type: application/json" \
       --data "$(jq -n \
         --arg mediaId "<media_id>" \
         --arg name "<storyboard_name>" \
         --arg cover "<cover_url_or_empty>" \
         --arg duration "<duration_or_empty>" \
         --arg pollUrl "<provider_status_url_with_task_id>" \
         --arg auth "Bearer $KEY" \
         '{
           mediaId: $mediaId,
           mediaType: "video",
           name: $name,
           source: "generate",
           cover: $cover,
           duration: $duration,
           poll: { url: $pollUrl, method: "GET", headers: { Authorization: $auth } },
           responseSchema: {
             statusPath: "<status_field_path_or_omit>",
             successValues: ["succeeded","success","completed","done"],
             failureValues: ["failed","error","cancelled","timeout"],
             urlPath: "<video_url_field_path>",
             errorPath: "<error_message_field_path_or_omit>"
           },
           intervalMs: 10000,
           maxDurationMs: 1800000
         }')"
   ```

   - `mediaId` is the storyboard video's Media ID from trigger context.
   - `poll.url` is the provider's status-check URL with the task ID baked in. If the provider polls via POST, set `poll.method` to `"POST"` and pass the JSON body string in `poll.body`.
   - For SumOne/OpenAI-compatible video templates using `POST https://api-direct.sumone.hk/v1/videos` that return `task.id`, register `poll.url` as `https://api-direct.sumone.hk/v1/videos/<task.id>`, `poll.method` as `"GET"`, `responseSchema.statusPath` as `"task.status"` or `"status"` depending on the poll response, `responseSchema.successValues` with `["completed","succeeded","success","done"]`, `responseSchema.failureValues` with `["failed","error","cancelled","canceled","timeout"]`, and `responseSchema.urlPath` as `"metadata.url"` unless the actual poll response shows another URL field. If unsure, still register the task; the backend also searches common URL fields such as `metadata.url`, `data.url`, `url`, and `video_url`.
   - `poll.headers.Authorization` (or whatever auth header the provider expects) is set in the same shell call that read the key.
   - `responseSchema.urlPath` is the dot-path inside the provider's JSON response that holds the final video URL (for example `data.video_url`, `content.video_url`, or `data.outputs.0.url`). When this path returns a non-empty string, the backend treats the task as succeeded regardless of any status field.
   - `responseSchema.statusPath` is optional; supply it only if the provider returns the URL only after a status flag flips. Override `successValues` / `failureValues` only when the provider uses unusual labels.
   - Treat the `task` object in the response as proof of registration and stop. **Do not poll yourself afterwards.** The backend will fetch the URL on its own schedule, call `store-generated` to download/persist it, and update `videos/videos.json`.

8. (Direct-URL path only) When step 6 applied, store the generated video by calling the existing `store-generated` API with the URL from the initial response. The `/async-tasks` endpoint already does this for you in the polling path; only do it manually in the direct-URL case.

If the provider response has no task ID and no video URL, report failure with the exact provider error.

## Secret Handling

- **Never trust the displayed `apiKey` value, regardless of agent or harness.** Different agents present secrets differently: some redact them (`abc123...wxyz`, `Bearer ***`), while others display-truncate them for readability. From the model's perspective the two are indistinguishable, and *both* mean the visible string is not safe to substitute into a request.
- Do NOT reason about whether `...` means "redaction" vs "display truncation" and then act on that conclusion. The conclusion is irrelevant — the rule below applies in every case.
- The only correct way to use `apiKey` is to read it fresh from `projects/{projectId}/config.json` inside the same shell tool call that issues the `curl` request, using a one-liner like `KEY=$(jq -r '.videoModel.apiKey' projects/{projectId}/config.json) && curl -H "Authorization: Bearer $KEY" ...` so the key value never has to flow through the model. The shell call may print non-secret response data, status codes, and errors only — never the key, never the auth header.
- **Use `curl` directly. Do not use Python, Node, or any other runtime to call the provider.** The inline wrapper is a single bash command that reads the key and runs `curl` in the same process.
- On Windows PowerShell, keep the same secret-handling rule by reading the key and running `curl.exe` in one command, but build JSON with hashtables plus `ConvertTo-Json` instead of nested hand-escaped strings. For backend `/async-tasks` registration, write the payload through `$payloadPath = Join-Path $env:TEMP 'async_task_req.json'` and `[System.IO.File]::WriteAllText($payloadPath, $json, [System.Text.UTF8Encoding]::new($false))`, then call `curl.exe --data-binary "@$payloadPath"`. Never use an unquoted expression like `$env:TEMP\\async_task_req.json` as a method argument.
- Never paste any visible `apiKey` value (full-looking, shortened, or `***`) into a `curl` command emitted as a tool call. Even when the visible key looks complete, route it through the bash key-read above.
- Never call a provider with a key value lifted from tool output, chat context, or prior assistant text.
- Do not report that the API key is truncated unless the raw file content actually contains the literal truncated value.

## Reference Handling

- Use only references from command context and the supplied skill temp context.
- Read `context.json` inside the supplied temp context when present.
- **`publicUrl` is the preferred reference value when the provider accepts URLs.** For every `@`-mentioned reference, read its entry in `context.json`. If the entry has a non-empty `publicUrl`, pass that URL to the provider in the reference image field. The presence of a `publicUrl` means the image bed step has already been done — skip uploading, but never skip passing the URL through to the model. Falling back to a copied local file (or to the asset name as plain text) should only happen when `publicUrl` is missing or empty.
- For copied reference files, use them only in the provider request shape supported by the selected video model — and only when `publicUrl` is unavailable.
- For reference URLs already supplied by command context (not via `context.json`), pass those URLs through unchanged when the provider accepts URLs.
- If a `context.json` reference has `kind: "image"` and its label/name/category indicates a scene asset, include it as a scene/background reference. Describe its purpose as environment, layout, lighting, color, and atmosphere continuity only; do not treat it as a character or action subject.
- If the provider requires public URLs and a reference has no usable `publicUrl` in `context.json`, call `upload-images` for that image ID; `upload-images` must use the backend `resolve-public-url` / `store-public-url` API and must not use `image-url-manifest.json`. Pass the URL it returns into the provider request — `upload-images` returns the URL whether it just uploaded or reused an existing one.
- Do not read project image files by yourself.

For prompt markers:

- Convert exact `@{uuid}` markers to request-time labels such as `@图片1`, `@图片2`.
- Label order must follow the ordered reference media list sent to the model.
- Repeated UUIDs keep the same label.
- If a referenced image has no file and no usable URL, keep the meaning by using its `name` or `label` as plain text, such as `重要道具为银行卡`.
- Never send raw `@{uuid}` markers in the provider prompt.

## Prompt Preparation

Build one final video prompt for the provider:

- Preserve the user's action order, characters, setting, and mood.
- When a scene/background reference is available, mention it in the final provider prompt as `场景背景参考：@图片N（<scene name>）` or `Scene background reference: @Image N (<scene name>)`, limited to environment continuity.
- Merge `[Project Recipe Pack]` as style continuity without replacing the actual action.
- Include supplied video options naturally, especially duration and shot type.
- Emphasize motion, camera movement, expression changes, light changes, atmosphere, and sound.
- Keep the first moment readable and the final moment settled.
- Avoid unsupported new story facts.
- Do not write `@图片N` labels back to project files; they are request-time labels only.
- Do not store the provider prompt, `task_id`, or polling command text in project files or backend API payloads.
- Do not poll provider status endpoints. If the provider returns `task_id`, register it with `/async-tasks` and stop.

## Success

There are two valid success outcomes:

**A. Async-path success (the common case, when the provider returned a `task_id`):**

The `/async-tasks` POST returned `{ task: { id, status: "queued" | "running", ... } }`. The agent's job is done — the backend API now owns the polling, the eventual `store-generated` call, and the project file updates. Report success as "task registered for backend polling, video will appear when ready" and exit. **Do not poll. Do not call `store-generated` afterwards.**

**B. Direct-path success (when the initial generation call already returned a video URL):**

The provider returned a final video URL and the agent called the backend video `store-generated` API with:
   - `videoId`: target Media ID
   - `resultUrl`: provider video URL
   - `name`: target Media Name
   - `cover`: first usable reference URL when available, otherwise empty
   - `duration`: requested duration when available, otherwise empty

Treat the backend JSON response as success.

## Failure Format

```text
[Video Generation Failed]
Media ID: <id>
Video Prompt: <prompt_used>
Error: <error from provider or backend API>
Suggestion: <actionable suggestion>
```

Use this Failure Format only when:

- the initial generation call returned an explicit error (no `task_id`, no URL), OR
- the `/async-tasks` registration call failed (4xx/5xx from the backend), OR
- the `store-generated` call failed.

A `/async-tasks` response with `status: "queued"` or `status: "running"` is a **success** for the agent run, not a failure. Reporting "task still running" as a failure or as a stopped-early message is wrong; it is the expected backend handoff state.
