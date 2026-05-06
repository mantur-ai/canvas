import { LOBE_ICON_SLUGS } from "@/lib/lobe-icon-slugs";

export type ModelProvider = {
  fallbackText: string;
  iconUrl: string;
  id: string;
  keywords: string[];
  name: string;
};

type LobeIconAlias = {
  fallbackText: string;
  id: string;
  keywords: string[];
  name: string;
  slug: string;
};

const DYNAMIC_LOBE_ICON_ID_PREFIX = "lobe:";
const LOBE_ICON_BASE_URL = "https://unpkg.com/@lobehub/icons-static-svg@latest/icons";
const lobeIconSlugSet = new Set<string>(LOBE_ICON_SLUGS);

const lobeIconUrl = (slug: string) => `${LOBE_ICON_BASE_URL}/${slug}.svg`;

const MODEL_ICON_ALIASES: LobeIconAlias[] = [
  {
    id: "gpt",
    name: "GPT",
    fallbackText: "G",
    slug: "openai",
    keywords: ["gpt", "chatgpt", "o1", "o3", "o4"],
  },
  {
    id: "dalle",
    name: "DALL-E",
    fallbackText: "D",
    slug: "dalle-color",
    keywords: ["dall-e", "dalle"],
  },
  {
    id: "seedance",
    name: "Seedance",
    fallbackText: "S",
    slug: "doubao-color",
    keywords: ["seedance", "seedance2", "seedance2.0", "seedance 2.0"],
  },
  {
    id: "seedream",
    name: "Seedream",
    fallbackText: "S",
    slug: "doubao-color",
    keywords: ["seedream", "seedream3", "seedream4", "seedream 3", "seedream 4"],
  },
  {
    id: "doubao",
    name: "Doubao",
    fallbackText: "豆",
    slug: "doubao-color",
    keywords: ["doubao", "豆包"],
  },
  {
    id: "jimeng",
    name: "Jimeng",
    fallbackText: "即",
    slug: "jimeng-color",
    keywords: ["jimeng", "即梦"],
  },
  {
    id: "qwen",
    name: "Qwen",
    fallbackText: "Q",
    slug: "qwen-color",
    keywords: ["qwen", "通义", "tongyi", "qvq", "qwq"],
  },
  {
    id: "claude",
    name: "Claude",
    fallbackText: "C",
    slug: "claude-color",
    keywords: ["claude", "haiku", "sonnet", "opus"],
  },
  {
    id: "kimi",
    name: "Kimi",
    fallbackText: "K",
    slug: "kimi-color",
    keywords: ["kimi"],
  },
  {
    id: "chatglm",
    name: "ChatGLM",
    fallbackText: "G",
    slug: "chatglm-color",
    keywords: ["chatglm", "glm"],
  },
  {
    id: "wenxin",
    name: "Wenxin",
    fallbackText: "文",
    slug: "wenxin-color",
    keywords: ["wenxin", "文心", "ernie"],
  },
  {
    id: "hailuo",
    name: "Hailuo",
    fallbackText: "海",
    slug: "hailuo-color",
    keywords: ["hailuo", "海螺"],
  },
  {
    id: "hunyuan",
    name: "Hunyuan",
    fallbackText: "混",
    slug: "hunyuan-color",
    keywords: ["hunyuan", "混元", "元宝"],
  },
  {
    id: "kling",
    name: "Kling",
    fallbackText: "K",
    slug: "kling-color",
    keywords: ["kling", "可灵"],
  },
  {
    id: "kolors",
    name: "Kolors",
    fallbackText: "K",
    slug: "kolors-color",
    keywords: ["kolors", "可图"],
  },
  {
    id: "llama",
    name: "Llama",
    fallbackText: "L",
    slug: "metaai-color",
    keywords: ["llama", "llama3", "llama4"],
  },
  {
    id: "command-r",
    name: "Command R",
    fallbackText: "C",
    slug: "cohere-color",
    keywords: ["command-r", "command r"],
  },
  {
    id: "stable-diffusion",
    name: "Stable Diffusion",
    fallbackText: "S",
    slug: "stability-color",
    keywords: ["stable diffusion", "sdxl", "stable image"],
  },
  {
    id: "black-forest-labs",
    name: "Black Forest Labs",
    fallbackText: "B",
    slug: "bfl",
    keywords: ["black forest", "black forest labs"],
  },
];

const PROVIDER_FALLBACKS: ModelProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    fallbackText: "O",
    iconUrl: lobeIconUrl("openai"),
    keywords: ["openai"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    fallbackText: "A",
    iconUrl: lobeIconUrl("anthropic"),
    keywords: ["anthropic"],
  },
  {
    id: "google",
    name: "Google",
    fallbackText: "G",
    iconUrl: lobeIconUrl("google-color"),
    keywords: ["google", "vertex"],
  },
  {
    id: "alibaba",
    name: "Alibaba",
    fallbackText: "A",
    iconUrl: lobeIconUrl("alibaba-color"),
    keywords: ["alibaba", "aliyun", "阿里"],
  },
  {
    id: "bytedance",
    name: "ByteDance",
    fallbackText: "B",
    iconUrl: lobeIconUrl("bytedance-color"),
    keywords: ["bytedance", "byte dance", "火山", "volcengine"],
  },
  {
    id: "moonshot",
    name: "Moonshot AI",
    fallbackText: "M",
    iconUrl: lobeIconUrl("moonshot"),
    keywords: ["moonshot", "月之暗面"],
  },
  {
    id: "minimax",
    name: "MiniMax",
    fallbackText: "M",
    iconUrl: lobeIconUrl("minimax-color"),
    keywords: ["minimax", "mini max", "abab"],
  },
  {
    id: "zhipu",
    name: "Zhipu AI",
    fallbackText: "Z",
    iconUrl: lobeIconUrl("zhipu-color"),
    keywords: ["zhipu", "智谱", "bigmodel", "清言"],
  },
  {
    id: "baidu",
    name: "Baidu",
    fallbackText: "B",
    iconUrl: lobeIconUrl("baidu-color"),
    keywords: ["baidu", "百度", "千帆"],
  },
  {
    id: "tencent",
    name: "Tencent",
    fallbackText: "T",
    iconUrl: lobeIconUrl("tencentcloud-color"),
    keywords: ["tencent", "腾讯"],
  },
  {
    id: "kuaishou",
    name: "Kuaishou",
    fallbackText: "K",
    iconUrl: lobeIconUrl("kwaikat"),
    keywords: ["kuaishou", "快手"],
  },
  {
    id: "stability",
    name: "Stability AI",
    fallbackText: "S",
    iconUrl: lobeIconUrl("stability-color"),
    keywords: ["stability"],
  },
  {
    id: "xai",
    name: "xAI",
    fallbackText: "X",
    iconUrl: lobeIconUrl("xai"),
    keywords: ["xai", "x.ai"],
  },
  {
    id: "meta",
    name: "Meta",
    fallbackText: "M",
    iconUrl: lobeIconUrl("metaai-color"),
    keywords: ["meta"],
  },
  {
    id: "cohere",
    name: "Cohere",
    fallbackText: "C",
    iconUrl: lobeIconUrl("cohere-color"),
    keywords: ["cohere"],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    fallbackText: "H",
    iconUrl: lobeIconUrl("huggingface-color"),
    keywords: ["huggingface", "hugging face", "hf", "inference endpoint"],
  },
  {
    id: "replicate",
    name: "Replicate",
    fallbackText: "R",
    iconUrl: lobeIconUrl("replicate"),
    keywords: ["replicate"],
  },
  {
    id: "ollama",
    name: "Ollama",
    fallbackText: "O",
    iconUrl: lobeIconUrl("ollama"),
    keywords: ["ollama"],
  },
  {
    id: "comfyui",
    name: "ComfyUI",
    fallbackText: "C",
    iconUrl: "https://www.comfy.org/favicon.ico",
    keywords: ["comfyui", "comfy ui", "comfy"],
  },
];

const MODEL_ICON_PROVIDERS: ModelProvider[] = MODEL_ICON_ALIASES.map((alias) => ({
  fallbackText: alias.fallbackText,
  iconUrl: lobeIconUrl(alias.slug),
  id: alias.id,
  keywords: alias.keywords,
  name: alias.name,
}));

export const MODEL_PROVIDERS: ModelProvider[] = [
  ...MODEL_ICON_PROVIDERS,
  ...PROVIDER_FALLBACKS,
];

const PROVIDER_BY_ID = new Map<string, ModelProvider>();

for (const provider of MODEL_PROVIDERS) {
  if (!PROVIDER_BY_ID.has(provider.id)) PROVIDER_BY_ID.set(provider.id, provider);
}

export function getModelProvider(providerId?: string) {
  if (!providerId) return undefined;

  if (providerId.startsWith(DYNAMIC_LOBE_ICON_ID_PREFIX)) {
    return createLobeIconProvider(providerId.slice(DYNAMIC_LOBE_ICON_ID_PREFIX.length));
  }

  return PROVIDER_BY_ID.get(providerId);
}

export function inferModelProviderId(...values: Array<string | undefined>) {
  const searchableText = normalizeSearchText(...values);
  if (!searchableText) return undefined;

  if (/\bseedance(?:[\s.-]*\d+(?:\.\d+)?)?\b/u.test(searchableText)) return "seedance";
  if (/\bseedream(?:[\s.-]*\d+(?:\.\d+)?)?\b/u.test(searchableText)) return "seedream";
  if (/\bdoubao(?:[\s.-]*\d+(?:\.\d+)?)?\b|豆包/u.test(searchableText)) return "doubao";

  const modelIconProvider = findProviderByKeywords(MODEL_ICON_PROVIDERS, searchableText);
  if (modelIconProvider) return modelIconProvider.id;

  const lobeIconSlug = inferLobeIconSlug(searchableText);
  if (lobeIconSlug) return `${DYNAMIC_LOBE_ICON_ID_PREFIX}${lobeIconSlug}`;

  return findProviderByKeywords(PROVIDER_FALLBACKS, searchableText)?.id;
}

export function resolveModelProvider(providerId: string | undefined, ...values: string[]) {
  return getModelProvider(inferModelProviderId(...values)) ?? getModelProvider(providerId);
}

function createLobeIconProvider(slug: string): ModelProvider | undefined {
  if (!lobeIconSlugSet.has(slug)) return undefined;

  return {
    fallbackText: slug.slice(0, 1).toUpperCase(),
    iconUrl: lobeIconUrl(slug),
    id: `${DYNAMIC_LOBE_ICON_ID_PREFIX}${slug}`,
    keywords: [slug],
    name: formatLobeIconName(slug),
  };
}

function findProviderByKeywords(providers: ModelProvider[], searchableText: string) {
  return providers.find((provider) =>
    provider.keywords.some((keyword) => searchableText.includes(keyword.toLowerCase())),
  );
}

function formatLobeIconName(slug: string) {
  return slug
    .split("-")
    .filter((part) => part !== "color")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function inferLobeIconSlug(searchableText: string) {
  const candidates = createLobeIconCandidates(tokenizeSearchText(searchableText));

  for (const candidate of candidates) {
    const exactSlug = resolveExistingLobeSlug(candidate);
    if (exactSlug) return exactSlug;

    const withoutVersion = candidate.replace(/(?:v?\d+[a-z]*|\d+[a-z]*)$/u, "");
    const versionlessSlug = resolveExistingLobeSlug(withoutVersion);
    if (versionlessSlug) return versionlessSlug;
  }

  return undefined;
}

function createLobeIconCandidates(tokens: string[]) {
  const candidates: string[] = [];

  for (let start = 0; start < tokens.length; start += 1) {
    for (let end = Math.min(tokens.length, start + 4); end > start; end -= 1) {
      const phraseTokens = tokens.slice(start, end);
      candidates.push(phraseTokens.join(""));
      candidates.push(phraseTokens.join("-"));
    }
  }

  return candidates;
}

function resolveExistingLobeSlug(slug: string) {
  if (slug.length < 3) return undefined;
  if (lobeIconSlugSet.has(`${slug}-color`)) return `${slug}-color`;
  if (lobeIconSlugSet.has(slug)) return slug;
  return undefined;
}

function normalizeSearchText(...values: Array<string | undefined>) {
  return values
    .map((value) => value?.toLowerCase().trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

function tokenizeSearchText(searchableText: string) {
  return searchableText
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0 && !/^\d+(?:\.\d+)?$/.test(token));
}
