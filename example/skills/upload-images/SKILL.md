---
name: upload-images
description: Upload local project images to the configured image bed and store the returned public URL on the image record through the backend API.
---

# Upload Images

Use this skill when a workflow needs a public URL for one or more local project images.

## Scope

Read only:

- `projects/currentProject.json`
- `projects/{projectId}/config.json`
- `projects/{projectId}/images/images.json`

Do not read or write `image-url-manifest.json`. Do not write project files directly. Store public URLs only through the backend images API.

## Reuse Existing Public URL

Before uploading an image, ask the backend whether the image already has a reachable public URL:

```bash
curl --request PATCH "http://localhost:3000/api/projects/{projectId}/images" \
  --header "Content-Type: application/json" \
  --data '{"action":"resolve-public-url","imageId":"<image_id>"}'
```

If the response has `"reachable": true` and a non-empty `publicUrl`, **return that `publicUrl` to the caller and skip the upload step.** "Skip upload" means skip the upload to the image bed only — it does **not** mean skip passing the URL back. The caller (image-gen / video-gen / storyboard-gen) needs the `publicUrl` so it can include it in the provider request, so always emit the URL on the way out, regardless of whether it came from a fresh upload or from the existing record.

## Upload And Store

If no reachable public URL exists:

1. Resolve the local image from `images/images.json[].url`.
2. Upload that local image to the selected image bed from `config.json.imageBed`.
3. Extract the returned public URL from the image bed response. This exact URL is the value that must be stored.
4. Store it on the image record through the backend:

```bash
curl --request PATCH "http://localhost:3000/api/projects/{projectId}/images" \
  --header "Content-Type: application/json" \
  --data '{"action":"store-public-url","imageId":"<image_id>","publicUrl":"<uploaded_public_url>"}'
```

The backend validates that the public URL is reachable before writing it to `images/images.json`.

## Upload Rules

- Use `config.json.imageBed.example` as the upload request template.
- Replace only the image bed API key and local file placeholder.
- **Never trust the displayed `imageBed.apiKey` value, regardless of harness.** Different harnesses present the key differently — some (e.g. Claude Code) redact it (`abc123...wxyz`, `***`); others (e.g. Hermes) display-truncate it for readability while the underlying value is intact. From the model's perspective the two are indistinguishable, and *both* mean the visible string is not safe to substitute into the upload request.
- Do NOT reason about whether `...` means "redaction" vs "display truncation" and then act on that conclusion. The conclusion is irrelevant — the rule below applies in every case.
- The only correct way to use `imageBed.apiKey` is to read it fresh from `projects/{projectId}/config.json` inside the same shell tool call that issues the `curl` upload, using a one-liner like `KEY=$(jq -r '.imageBed.apiKey' projects/{projectId}/config.json) && curl -F "image=@..." -H "Authorization: Bearer $KEY" ...` so the key value never has to flow through the model. The shell call may print non-secret response data, status codes, and errors only — never the key.
- **Use `curl` directly. Do not use Python, Node, or any other runtime to perform the upload.** The inline wrapper is a single bash command that reads the key and runs `curl` in the same process.
- Never paste any visible API key value (full-looking, shortened, or `***`) into a `curl` command emitted as a tool call. Even when the visible key looks complete, route it through the bash key-read above.
- Never call the image bed with a key value lifted from tool output, chat context, or prior assistant text.
- Upload each missing image once.
- Do not retry automatically.
- Do not write manifests.
- Do not store public URLs yourself.
- Do not write standalone helper scripts or persistent tooling for upload logic, retry queues, or URL caching. The single inline bash command required by the secret-handling rules above is not a "helper script" — it is a one-shot wrapper that reads the key from `config.json` and runs `curl` (the request shape comes from `config.json.imageBed.example`) in the same process. After the inline upload returns a URL, call the backend API to store it.

## Success

Return the usable public URL for each requested image. It may be reused from the image record or newly uploaded and stored through the API. Either way, the caller must receive the URL string so it can be passed into the downstream model request — never return success without surfacing the URL.

## Failure Format

```text
[Image Upload Failed]
Image ID: <id>
Image Name: <name>
Error: <error from backend API, image bed API, or local validation>
Suggestion: <actionable suggestion>
```
