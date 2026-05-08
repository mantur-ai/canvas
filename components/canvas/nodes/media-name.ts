export function formatStoryboardMediaName(storyboardName: string, mediaName: string) {
  const cleanStoryboardName = storyboardName.trim();
  const cleanMediaName = mediaName.trim();

  if (!cleanStoryboardName) return cleanMediaName;
  if (!cleanMediaName || cleanMediaName.includes(cleanStoryboardName)) return cleanMediaName || cleanStoryboardName;
  return `${cleanStoryboardName} ${cleanMediaName}`;
}
