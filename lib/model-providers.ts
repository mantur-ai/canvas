export type ModelProvider = {
  fallbackText: string;
  iconUrl: string;
  id: string;
  keywords: string[];
  name: string;
};

const simpleIconUrl = (slug: string) => `https://cdn.simpleicons.org/${slug}`;

export const MODEL_PROVIDERS: ModelProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    fallbackText: "O",
    iconUrl: simpleIconUrl("openai"),
    keywords: ["openai", "gpt", "chatgpt", "dall-e", "dalle", "sora", "o1", "o3", "o4"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    fallbackText: "A",
    iconUrl: simpleIconUrl("anthropic"),
    keywords: ["anthropic", "claude", "haiku", "sonnet", "opus"],
  },
  {
    id: "google",
    name: "Google",
    fallbackText: "G",
    iconUrl: simpleIconUrl("google"),
    keywords: ["google", "gemini", "imagen", "veo", "vertex"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    fallbackText: "D",
    iconUrl: simpleIconUrl("deepseek"),
    keywords: ["deepseek", "deep seek"],
  },
  {
    id: "qwen",
    name: "Qwen",
    fallbackText: "Q",
    iconUrl: simpleIconUrl("alibabacloud"),
    keywords: ["qwen", "通义", "tongyi", "wanxiang", "wanx", "qvq", "qwq", "alibaba", "aliyun"],
  },
  {
    id: "bytedance",
    name: "ByteDance",
    fallbackText: "B",
    iconUrl: simpleIconUrl("bytedance"),
    keywords: ["bytedance", "byte dance", "doubao", "豆包", "seedream", "seedance", "火山", "volcengine"],
  },
  {
    id: "moonshot",
    name: "Moonshot AI",
    fallbackText: "K",
    iconUrl: "https://www.moonshot.cn/favicon.ico",
    keywords: ["moonshot", "kimi", "月之暗面"],
  },
  {
    id: "minimax",
    name: "MiniMax",
    fallbackText: "M",
    iconUrl: "https://www.minimaxi.com/favicon.ico",
    keywords: ["minimax", "mini max", "abab", "海螺", "hailuo"],
  },
  {
    id: "zhipu",
    name: "Zhipu AI",
    fallbackText: "Z",
    iconUrl: "https://open.bigmodel.cn/favicon.ico",
    keywords: ["zhipu", "智谱", "glm", "bigmodel", "清言"],
  },
  {
    id: "baidu",
    name: "Baidu",
    fallbackText: "B",
    iconUrl: simpleIconUrl("baidu"),
    keywords: ["baidu", "百度", "ernie", "文心", "千帆"],
  },
  {
    id: "tencent",
    name: "Tencent",
    fallbackText: "T",
    iconUrl: simpleIconUrl("tencentqq"),
    keywords: ["tencent", "腾讯", "hunyuan", "混元", "元宝"],
  },
  {
    id: "kuaishou",
    name: "Kling",
    fallbackText: "K",
    iconUrl: "https://app.klingai.com/favicon.ico",
    keywords: ["kling", "可灵", "kuaishou", "快手"],
  },
  {
    id: "stability",
    name: "Stability AI",
    fallbackText: "S",
    iconUrl: simpleIconUrl("stabilityai"),
    keywords: ["stability", "stable diffusion", "sdxl", "stable image"],
  },
  {
    id: "runway",
    name: "Runway",
    fallbackText: "R",
    iconUrl: simpleIconUrl("runway"),
    keywords: ["runway", "gen-1", "gen-2", "gen-3", "gen-4"],
  },
  {
    id: "luma",
    name: "Luma AI",
    fallbackText: "L",
    iconUrl: "https://lumalabs.ai/favicon.ico",
    keywords: ["luma", "lumalabs", "dream machine", "ray2"],
  },
  {
    id: "midjourney",
    name: "Midjourney",
    fallbackText: "M",
    iconUrl: simpleIconUrl("midjourney"),
    keywords: ["midjourney", "mj", "niji"],
  },
  {
    id: "mistral",
    name: "Mistral AI",
    fallbackText: "M",
    iconUrl: simpleIconUrl("mistralai"),
    keywords: ["mistral", "mixtral", "codestral", "magistral", "pixtral"],
  },
  {
    id: "xai",
    name: "xAI",
    fallbackText: "X",
    iconUrl: simpleIconUrl("x"),
    keywords: ["xai", "x.ai", "grok"],
  },
  {
    id: "meta",
    name: "Meta",
    fallbackText: "M",
    iconUrl: simpleIconUrl("meta"),
    keywords: ["meta", "llama", "llama3", "llama4"],
  },
  {
    id: "cohere",
    name: "Cohere",
    fallbackText: "C",
    iconUrl: simpleIconUrl("cohere"),
    keywords: ["cohere", "command-r", "command r"],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    fallbackText: "H",
    iconUrl: simpleIconUrl("huggingface"),
    keywords: ["huggingface", "hugging face", "hf", "inference endpoint"],
  },
  {
    id: "replicate",
    name: "Replicate",
    fallbackText: "R",
    iconUrl: simpleIconUrl("replicate"),
    keywords: ["replicate"],
  },
  {
    id: "ollama",
    name: "Ollama",
    fallbackText: "O",
    iconUrl: simpleIconUrl("ollama"),
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

const PROVIDER_BY_ID = new Map(MODEL_PROVIDERS.map((provider) => [provider.id, provider]));

export function getModelProvider(providerId?: string) {
  if (!providerId) return undefined;
  return PROVIDER_BY_ID.get(providerId);
}

export function inferModelProviderId(...values: Array<string | undefined>) {
  const searchableText = values
    .map((value) => value?.toLowerCase().trim() ?? "")
    .filter(Boolean)
    .join(" ");

  if (!searchableText) return undefined;

  return MODEL_PROVIDERS.find((provider) =>
    provider.keywords.some((keyword) => searchableText.includes(keyword.toLowerCase())),
  )?.id;
}

export function resolveModelProvider(providerId: string | undefined, ...values: string[]) {
  return getModelProvider(providerId) ?? getModelProvider(inferModelProviderId(...values));
}
