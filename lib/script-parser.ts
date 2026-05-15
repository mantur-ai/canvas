export type ParsedScriptEpisode = {
  name: string;
};

export type ParsedScript = {
  name: string;
  episodeCount: number;
  episodes: ParsedScriptEpisode[];
};

// Extract project metadata and episode headings from the markdown script.
export function parseScriptMD(content: string): ParsedScript {
  const lines = content.split("\n");

  const firstNonEmpty = lines.find((line) => line.trim().length > 0);
  const name = firstNonEmpty ? firstNonEmpty.replace(/^#+\s*/, "").trim() : "";

  // Match either Chinese "分集剧本" or English "Episodes" / "Episode Scripts" / "Scripts"
  const SECTION_RE =
    /^#{1,6}\s+.*(?:分集剧本|episode\s+scripts?|episodes|scripts)\s*$/i;
  // Match either "第N集..." / "第N话..." or "Episode N..." / "EP N..." at any heading depth.
  // 部分剧本会把每集作为一级标题(# 第N集 ...),所以不再限定 ### 三级。
  const EPISODE_RE =
    /^#{1,6}\s+((?:第\s*\d+\s*[集话].*|episode\s+\d+.*|ep\.?\s*\d+.*))$/i;

  const episodeSectionIndex = lines.findIndex((line) => SECTION_RE.test(line));

  if (episodeSectionIndex === -1) {
    throw new Error("PARSE_NO_EPISODE_SECTION");
  }

  // 不再用 "下一个 ## 标题" 截断 section:有的剧本里场次也是 ##(如 "## 场次 1-1"),
  // 而分集本身可能是 # 一级标题。EPISODE_RE 已足够严格,直接扫到文件末尾即可。
  const episodes: ParsedScriptEpisode[] = [];
  for (let i = episodeSectionIndex + 1; i < lines.length; i++) {
    const match = lines[i].match(EPISODE_RE);
    if (match) {
      episodes.push({ name: match[1].trim() });
    }
  }

  if (episodes.length === 0) {
    throw new Error("PARSE_NO_EPISODES");
  }

  return { name, episodeCount: episodes.length, episodes };
}
