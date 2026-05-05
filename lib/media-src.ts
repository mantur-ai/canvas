const SAFE_MEDIA_PROTOCOLS = new Set(["http:", "https:", "blob:"]);

export function getSafeMediaSource(value: string | null | undefined): string | null {
  const source = value?.trim();
  if (!source) return null;

  // Project API paths should be site-relative. Older data may be missing the leading slash.
  if (source.startsWith("api/")) return `/${source}`;
  if (source.startsWith("/") && !source.startsWith("//")) return source;

  if (source.startsWith("data:image/")) return source;

  try {
    const parsedUrl = new URL(source);
    return SAFE_MEDIA_PROTOCOLS.has(parsedUrl.protocol) ? source : null;
  } catch {
    return null;
  }
}
