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
    /^##\s+.*(?:分集剧本|episode\s+scripts?|episodes|scripts)\s*$/i;
  // Match either "第N集..." / "第N话..." or "Episode N..." / "EP N..."
  const EPISODE_RE =
    /^###\s*((?:第\s*\d+\s*[集话].*|episode\s+\d+.*|ep\.?\s*\d+.*))$/i;

  const episodeSectionIndex = lines.findIndex((line) => SECTION_RE.test(line));

  if (episodeSectionIndex === -1) {
    throw new Error("PARSE_NO_EPISODE_SECTION");
  }

  let sectionEnd = lines.length;
  for (let i = episodeSectionIndex + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }

  const episodes: ParsedScriptEpisode[] = [];
  for (let i = episodeSectionIndex + 1; i < sectionEnd; i++) {
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
