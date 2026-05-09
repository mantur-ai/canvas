import type { FlowState } from "@/lib/flow-schema";
import type {
  ProjectConfig,
  ProjectDetail,
  ProjectImageAsset,
  ProjectListItem,
  ProjectSelectedImageBedInfo,
  ProjectSelectedModelInfo,
  ProjectStoryboard,
  ProjectVideoAsset,
} from "@/lib/project-types";

type ProjectsResponse = {
  projects?: ProjectListItem[];
};

type ProjectResponse = {
  project?: ProjectDetail;
};

type ProjectImagesResponse = {
  image?: ProjectImageAsset;
  images?: ProjectImageAsset[];
  project?: ProjectDetail;
};

type ProjectVideosResponse = {
  message?: string;
  video?: ProjectVideoAsset;
  videos?: ProjectVideoAsset[];
};

const inFlightGetRequests = new Map<string, Promise<unknown>>();

export type ProjectTempImage = {
  id: string;
  label: string;
  name: string;
  fileName: string;
  type: string;
  url: string;
};

export type ProjectCanvasData = {
  flow: FlowState;
  storyboards: ProjectStoryboard[];
  images: ProjectImageAsset[];
  videos: ProjectVideoAsset[];
};

export type ProjectCommandStatus = "loading" | "error" | "success";

export type ProjectSkillContextFile = {
  id: string;
  kind: "image" | "temp";
  label: string;
  name: string;
  publicUrl?: string;
  relativePath: string;
  sourceUrl: string;
};

export type ProjectSkillContextReference = ProjectSkillContextFile & {
  hasFile: boolean;
};

export type ProjectSkillContext = {
  contextDir: string;
  files: ProjectSkillContextFile[];
  manifestPath: string;
  references: ProjectSkillContextReference[];
};

async function readJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error("PROJECT_REQUEST_FAILED");
  }

  return (await response.json()) as T;
}

async function fetchJsonOnce<T>(url: string): Promise<T> {
  const cachedRequest = inFlightGetRequests.get(url) as Promise<T> | undefined;
  if (cachedRequest) return cachedRequest;

  const request = fetch(url, {
    cache: "no-store",
  })
    .then((response) => readJsonResponse<T>(response))
    .finally(() => {
      inFlightGetRequests.delete(url);
    });

  inFlightGetRequests.set(url, request);
  return request;
}

export async function fetchProjects(): Promise<ProjectListItem[]> {
  const data = await fetchJsonOnce<ProjectsResponse>("/api/projects");

  return Array.isArray(data.projects) ? data.projects : [];
}

export async function fetchProject(projectId: string): Promise<ProjectDetail> {
  const data = await fetchJsonOnce<ProjectResponse>(
    `/api/projects/${encodeURIComponent(projectId)}`,
  );

  if (!data.project) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  return data.project;
}

export async function fetchProjectImages(projectId: string): Promise<ProjectImageAsset[]> {
  const data = await fetchJsonOnce<ProjectImagesResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/images`,
  );

  return Array.isArray(data.images) ? data.images : [];
}

export async function fetchProjectVideos(projectId: string): Promise<ProjectVideoAsset[]> {
  const data = await fetchJsonOnce<ProjectVideosResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/videos`,
  );

  return Array.isArray(data.videos) ? data.videos : [];
}

export async function fetchProjectCanvasData(
  projectId: string,
  episodeId: string,
): Promise<ProjectCanvasData> {
  return fetchJsonOnce<ProjectCanvasData>(
    `/api/projects/${encodeURIComponent(projectId)}/flow?episodeId=${encodeURIComponent(episodeId)}`,
  );
}

export async function fetchProjectFlow(projectId: string): Promise<FlowState> {
  const data = await fetchJsonOnce<{ flow?: FlowState }>(
    `/api/projects/${encodeURIComponent(projectId)}/flow`,
  );

  if (!data.flow) {
    throw new Error("PROJECT_FLOW_NOT_FOUND");
  }

  return data.flow;
}

export async function saveProjectFlow(projectId: string, flow: FlowState): Promise<FlowState> {
  const data = await readJsonResponse<{ flow?: FlowState }>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/flow`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(flow),
    }),
  );

  if (!data.flow) {
    throw new Error("PROJECT_FLOW_SAVE_FAILED");
  }

  return data.flow;
}

export type ProjectStoryboardSaveInput = {
  description?: string;
  id?: string;
  name: string;
  prompt?: string;
  videoPrompt?: string;
};

export async function saveProjectEpisodeStoryboards(
  projectId: string,
  episodeId: string,
  storyboards: ProjectStoryboardSaveInput[],
): Promise<ProjectStoryboard[]> {
  const data = await readJsonResponse<{ storyboards?: ProjectStoryboard[] }>(
    await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/episode/${encodeURIComponent(episodeId)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ storyboards }),
      },
    ),
  );

  return Array.isArray(data.storyboards) ? data.storyboards : [];
}

export async function replaceProjectImages(
  projectId: string,
  images: ProjectImageAsset[],
): Promise<{ images: ProjectImageAsset[]; project: ProjectDetail | null }> {
  const data = await readJsonResponse<{
    images?: ProjectImageAsset[];
    project?: ProjectDetail | null;
  }>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/images`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "bulk-replace", images }),
    }),
  );

  return {
    images: Array.isArray(data.images) ? data.images : [],
    project: data.project ?? null,
  };
}

export async function normalizeProjectStoryboardAssets(
  projectId: string,
  episodeId: string,
): Promise<ProjectStoryboard[]> {
  const data = await readJsonResponse<{ storyboards?: ProjectStoryboard[] }>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "normalize-storyboard-assets",
        episodeId,
      }),
    }),
  );

  return Array.isArray(data.storyboards) ? data.storyboards : [];
}

export async function saveProjectSelectedModel(
  projectId: string,
  selectedModel: Omit<ProjectSelectedModelInfo, "selectedAt">,
): Promise<ProjectConfig> {
  const data = await readJsonResponse<{ config?: ProjectConfig }>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/config`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ selectedModel }),
    }),
  );

  if (!data.config) {
    throw new Error("PROJECT_CONFIG_SAVE_FAILED");
  }

  return data.config;
}

export async function saveProjectConfigSelection(
  projectId: string,
  selection: {
    imageBed?: Omit<ProjectSelectedImageBedInfo, "selectedAt">;
    selectedModel?: Omit<ProjectSelectedModelInfo, "selectedAt">;
  },
): Promise<ProjectConfig> {
  const data = await readJsonResponse<{ config?: ProjectConfig }>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/config`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(selection),
    }),
  );

  if (!data.config) {
    throw new Error("PROJECT_CONFIG_SAVE_FAILED");
  }

  return data.config;
}

export async function deleteProjectImage(
  projectId: string,
  imageId: string,
): Promise<ProjectImageAsset[]> {
  const data = await readJsonResponse<ProjectImagesResponse>(
    await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/images?imageId=${encodeURIComponent(imageId)}`,
      {
        method: "DELETE",
        cache: "no-store",
      },
    ),
  );

  return Array.isArray(data.images) ? data.images : [];
}

export async function createProjectImage(
  projectId: string,
  params: {
    category: string;
    file?: File | null;
    name: string;
    parentId?: string;
    prompt: string;
    source: string;
  },
): Promise<{ image: ProjectImageAsset; images: ProjectImageAsset[]; project?: ProjectDetail }> {
  const formData = new FormData();
  formData.append("category", params.category);
  formData.append("name", params.name);
  formData.append("prompt", params.prompt);
  formData.append("source", params.source);
  if (params.parentId) formData.append("parentId", params.parentId);
  if (params.file) formData.append("file", params.file);

  const data = await readJsonResponse<ProjectImagesResponse>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/images`, {
      method: "POST",
      body: formData,
    }),
  );

  if (!data.image) {
    throw new Error("PROJECT_IMAGE_CREATE_FAILED");
  }

  return {
    image: data.image,
    images: Array.isArray(data.images) ? data.images : [data.image],
    project: data.project,
  };
}

export async function updateProjectImageFile(
  projectId: string,
  imageId: string,
  file: File,
): Promise<{ image: ProjectImageAsset; images: ProjectImageAsset[] }> {
  const formData = new FormData();
  formData.append("imageId", imageId);
  formData.append("file", file);

  const data = await readJsonResponse<ProjectImagesResponse>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/images`, {
      method: "PUT",
      body: formData,
    }),
  );

  if (!data.image) {
    throw new Error("PROJECT_IMAGE_UPDATE_FAILED");
  }

  return {
    image: data.image,
    images: Array.isArray(data.images) ? data.images : [data.image],
  };
}

export async function clearProjectImageFile(
  projectId: string,
  imageId: string,
): Promise<{ image: ProjectImageAsset; images: ProjectImageAsset[] }> {
  const data = await readJsonResponse<ProjectImagesResponse>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/images`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "clear-file", imageId }),
    }),
  );

  if (!data.image) {
    throw new Error("PROJECT_IMAGE_CLEAR_FAILED");
  }

  return {
    image: data.image,
    images: Array.isArray(data.images) ? data.images : [data.image],
  };
}

export async function storeGeneratedProjectImage(
  projectId: string,
  params: {
    category?: string;
    imageId: string;
    name?: string;
    parentId?: string;
    source?: string;
  } & ({ resultBase64: string; resultUrl?: string } | { resultBase64?: string; resultUrl: string }),
): Promise<{ image: ProjectImageAsset; images: ProjectImageAsset[] }> {
  const data = await readJsonResponse<ProjectImagesResponse>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/images`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "store-generated", ...params }),
    }),
  );

  if (!data.image) {
    throw new Error("PROJECT_IMAGE_STORE_GENERATED_FAILED");
  }

  return {
    image: data.image,
    images: Array.isArray(data.images) ? data.images : [data.image],
  };
}

export async function storeProjectImagePublicUrl(
  projectId: string,
  params: {
    imageId: string;
    publicUrl: string;
  },
): Promise<{ image: ProjectImageAsset; images: ProjectImageAsset[] }> {
  const data = await readJsonResponse<ProjectImagesResponse>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/images`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "store-public-url", ...params }),
    }),
  );

  if (!data.image) {
    throw new Error("PROJECT_IMAGE_PUBLIC_URL_STORE_FAILED");
  }

  return {
    image: data.image,
    images: Array.isArray(data.images) ? data.images : [data.image],
  };
}

export async function resolveProjectImagePublicUrl(
  projectId: string,
  imageId: string,
): Promise<{ image: ProjectImageAsset; publicUrl: string; reachable: boolean }> {
  const data = await readJsonResponse<
    ProjectImagesResponse & {
      publicUrl?: string;
      reachable?: boolean;
    }
  >(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/images`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "resolve-public-url", imageId }),
    }),
  );

  if (!data.image) {
    throw new Error("PROJECT_IMAGE_PUBLIC_URL_RESOLVE_FAILED");
  }

  return {
    image: data.image,
    publicUrl: typeof data.publicUrl === "string" ? data.publicUrl : "",
    reachable: data.reachable === true,
  };
}

export async function addProjectImageToAssets(
  projectId: string,
  params: {
    category: string;
    imageId: string;
    parentId?: string;
  },
): Promise<ProjectDetail> {
  const data = await readJsonResponse<ProjectImagesResponse>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/images`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    }),
  );

  if (!data.project) {
    throw new Error("PROJECT_IMAGE_ASSET_SAVE_FAILED");
  }

  return data.project;
}

export async function addProjectImageToStoryboard(
  projectId: string,
  storyboardId: string,
  imageId: string,
): Promise<void> {
  await readJsonResponse<{ storyboards?: ProjectStoryboard[] }>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/images`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "storyboard", storyboardId, imageId }),
    }),
  );
}

export async function createProjectVideo(
  projectId: string,
  params: {
    name: string;
    prompt: string;
    source: string;
  },
): Promise<{ video: ProjectVideoAsset; videos: ProjectVideoAsset[] }> {
  const data = await readJsonResponse<ProjectVideosResponse>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/videos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    }),
  );

  if (!data.video) {
    throw new Error("PROJECT_VIDEO_CREATE_FAILED");
  }

  return {
    video: data.video,
    videos: Array.isArray(data.videos) ? data.videos : [data.video],
  };
}

export async function updateProjectVideoFile(
  projectId: string,
  videoId: string,
  file: File,
): Promise<{ video: ProjectVideoAsset; videos: ProjectVideoAsset[] }> {
  const formData = new FormData();
  formData.append("videoId", videoId);
  formData.append("file", file);

  const data = await readJsonResponse<ProjectVideosResponse>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/videos`, {
      method: "PUT",
      body: formData,
    }),
  );

  if (!data.video) {
    throw new Error("PROJECT_VIDEO_UPDATE_FAILED");
  }

  return {
    video: data.video,
    videos: Array.isArray(data.videos) ? data.videos : [data.video],
  };
}

export async function storeGeneratedProjectVideo(
  projectId: string,
  params: {
    cover?: string;
    duration?: string;
    name?: string;
    resultUrl: string;
    source?: string;
    status?: string;
    storyboardId?: string;
    videoId: string;
  },
): Promise<{ video: ProjectVideoAsset; videos: ProjectVideoAsset[] }> {
  const data = await readJsonResponse<ProjectVideosResponse>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/videos`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "store-generated", ...params }),
    }),
  );

  if (!data.video) {
    throw new Error("PROJECT_VIDEO_STORE_GENERATED_FAILED");
  }

  return {
    video: data.video,
    videos: Array.isArray(data.videos) ? data.videos : [data.video],
  };
}

export async function addProjectVideoToStoryboard(
  projectId: string,
  storyboardId: string,
  videoId: string,
): Promise<void> {
  await readJsonResponse<{ storyboards?: ProjectStoryboard[] }>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/videos`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ storyboardId, videoId }),
    }),
  );
}

export async function selectProjectStoryboardVideo(
  projectId: string,
  storyboardId: string,
  videoId: string,
): Promise<void> {
  await readJsonResponse<{ storyboards?: ProjectStoryboard[] }>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/videos`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "select", storyboardId, videoId }),
    }),
  );
}

export async function clearProjectStoryboardSelectedVideo(
  projectId: string,
  storyboardId: string,
  videoId: string,
): Promise<void> {
  await readJsonResponse<{ storyboards?: ProjectStoryboard[] }>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/videos`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "clear-selection", storyboardId, videoId }),
    }),
  );
}

export async function deleteProjectVideo(
  projectId: string,
  videoId: string,
): Promise<ProjectVideoAsset[]> {
  const data = await readJsonResponse<ProjectVideosResponse>(
    await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/videos?videoId=${encodeURIComponent(videoId)}`,
      {
        method: "DELETE",
        cache: "no-store",
      },
    ),
  );

  return Array.isArray(data.videos) ? data.videos : [];
}

export async function mergeProjectVideos(
  projectId: string,
  videoIds: string[],
): Promise<Blob> {
  // The merge endpoint streams the ffmpeg output back as binary; the caller is
  // responsible for writing it to the user-picked folder.
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/videos/merge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ videoIds }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as ProjectVideosResponse;
    throw new Error(data.message || "PROJECT_VIDEO_MERGE_FAILED");
  }

  return response.blob();
}

export async function uploadProjectTempImages(
  projectId: string,
  files: File[],
): Promise<ProjectTempImage[]> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });

  const data = await readJsonResponse<{ images?: ProjectTempImage[] }>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/temp`, {
      method: "POST",
      body: formData,
    }),
  );

  return Array.isArray(data.images) ? data.images : [];
}

export async function createProjectSkillContext(
  projectId: string,
  params: {
    attachments: Array<{
      fileName?: string;
      id: string;
      kind?: string;
      label?: string;
      name?: string;
      type?: string;
      url?: string;
    }>;
    text: string;
  },
): Promise<ProjectSkillContext> {
  const data = await readJsonResponse<Partial<ProjectSkillContext>>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/skill-context`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    }),
  );

  if (
    !data.contextDir ||
    !data.manifestPath ||
    !Array.isArray(data.files) ||
    !Array.isArray(data.references)
  ) {
    throw new Error("PROJECT_SKILL_CONTEXT_CREATE_FAILED");
  }

  return {
    contextDir: data.contextDir,
    files: data.files,
    manifestPath: data.manifestPath,
    references: data.references,
  };
}

export async function deleteProjectSkillContext(
  projectId: string,
  contextDir: string,
  options?: { keepalive?: boolean },
): Promise<void> {
  await readJsonResponse<{ success?: boolean }>(
    await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/skill-context?contextDir=${encodeURIComponent(contextDir)}`,
      {
        keepalive: options?.keepalive,
        method: "DELETE",
      },
    ),
  );
}

export async function fetchCurrentProject(): Promise<ProjectDetail | null> {
  const data = await fetchJsonOnce<ProjectResponse>("/api/projects/current");

  return data.project ?? null;
}

export async function updateCurrentProject(projectId: string): Promise<ProjectDetail> {
  const data = await readJsonResponse<ProjectResponse>(
    await fetch("/api/projects/current", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ projectId }),
    }),
  );

  if (!data.project) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  return data.project;
}

export async function deleteCurrentProject() {
  await readJsonResponse<{ ok?: boolean }>(
    await fetch("/api/projects/current", {
      method: "DELETE",
    }),
  );
}
