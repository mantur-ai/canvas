"use client";

import { useEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from "react";
import { Folder, Upload } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { VISIBLE_SKILL_FOLDER_CATEGORIES, type SkillFolderCategory } from "@/lib/skill-categories";
import type { SkillFolder } from "@/lib/services/skill-service";

type DirectoryFile = File & {
  webkitRelativePath?: string;
};

type DirectoryInputProps = InputHTMLAttributes<HTMLInputElement> & {
  webkitdirectory?: string;
  directory?: string;
};

type FeedbackKey =
  | "Skills.feedback.loadError"
  | "Skills.feedback.uploadError"
  | "Skills.feedback.uploadSuccess"
  | "";

const DIRECTORY_INPUT_PROPS: DirectoryInputProps = {
  webkitdirectory: "",
  directory: "",
};

export function SkillsPanel() {
  const t = useTranslations();
  const fileInputRefs = useRef<Partial<Record<SkillFolderCategory, HTMLInputElement | null>>>({});
  const [skills, setSkills] = useState<SkillFolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadingCategory, setUploadingCategory] = useState<SkillFolderCategory | null>(null);
  const [feedbackKey, setFeedbackKey] = useState<FeedbackKey>("");

  const loadSkills = async () => {
    try {
      const response = await fetch("/api/skills");
      if (!response.ok) throw new Error("SKILL_LOAD_FAILED");
      const payload = (await response.json()) as { skills: SkillFolder[] };

      setSkills(payload.skills);
      setFeedbackKey("");
    } catch {
      setFeedbackKey("Skills.feedback.loadError");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    void fetch("/api/skills")
      .then((response) => {
        if (!response.ok) throw new Error("SKILL_LOAD_FAILED");
        return response.json() as Promise<{ skills: SkillFolder[] }>;
      })
      .then((payload) => {
        if (!isMounted) return;
        setSkills(payload.skills);
        setFeedbackKey("");
      })
      .catch(() => {
        if (isMounted) setFeedbackKey("Skills.feedback.loadError");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleUpload = async (
    category: SkillFolderCategory,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFiles = Array.from(event.target.files ?? []) as DirectoryFile[];
    if (selectedFiles.length === 0) return;

    const formData = new FormData();
    formData.append("category", category);
    selectedFiles.forEach((file) => {
      formData.append("files", file);
      formData.append("paths", file.webkitRelativePath || file.name);
    });

    setUploadingCategory(category);
    try {
      const response = await fetch("/api/skills", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("SKILL_UPLOAD_FAILED");

      setFeedbackKey("Skills.feedback.uploadSuccess");
      await loadSkills();
    } catch {
      setFeedbackKey("Skills.feedback.uploadError");
    } finally {
      setUploadingCategory(null);
      event.target.value = "";
    }
  };

  return (
    <div className="flex h-[min(68vh,560px)] min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{t("Skills.title")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("Skills.description")}</p>
        </div>
      </div>

      {feedbackKey ? (
        <p
          className={cn(
            "text-xs",
            feedbackKey === "Skills.feedback.uploadSuccess"
              ? "text-muted-foreground"
              : "text-destructive",
          )}
        >
          {t(feedbackKey)}
        </p>
      ) : null}

      <ScrollArea className="min-h-0 flex-1 pr-3">
        {isLoading ? (
          <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-8 text-center">
            <p className="text-xs text-muted-foreground">{t("Skills.feedback.loading")}</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {VISIBLE_SKILL_FOLDER_CATEGORIES.map((category) => {
              const skill = skills.find((item) => item.name === category) ?? {
                fileCount: 0,
                name: category,
              };
              const isUploading = uploadingCategory === category;
              return (
                <div
                  key={skill.name}
                  className="flex items-center gap-3 rounded-lg border bg-background p-3"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Folder className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {t(`Skills.categories.${category}`)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {skill.fileCount > 0
                        ? t("Skills.fileCount", { count: skill.fileCount })
                        : t("Skills.emptyCategory")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => fileInputRefs.current[category]?.click()}
                    disabled={uploadingCategory !== null}
                    className="shrink-0"
                  >
                    <Upload className="size-4" />
                    {isUploading ? t("Skills.actions.uploading") : t("Skills.actions.upload")}
                  </Button>
                  <input
                    ref={(element) => {
                      fileInputRefs.current[category] = element;
                    }}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => void handleUpload(category, event)}
                    {...DIRECTORY_INPUT_PROPS}
                  />
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
