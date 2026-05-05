"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";

import { ModelProviderIcon } from "@/components/model-provider-icon";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { resolveModelProvider } from "@/lib/model-providers";
import { cn } from "@/lib/utils";

import {
  VIDEO_REFERENCE_MODES,
  WORKFLOW_PRIMARY_SKILLS,
  WORKFLOW_UPLOAD_SKILLS,
} from "../constants";
import type { ConfigItem, ConfigSection, FeedbackKey, SettingsFormValues } from "../types";

type SettingsConfigFormProps = {
  activeSection: ConfigSection;
  canSave: boolean;
  feedbackKey: FeedbackKey;
  form: UseFormReturn<SettingsFormValues>;
  isApiKeyVisible: boolean;
  isCreateMode: boolean;
  isSaving: boolean;
  selectedItem?: ConfigItem;
  onInvalidSubmit: () => void;
  onSubmit: (values: SettingsFormValues) => void | Promise<void>;
  onToggleApiKeyVisibility: () => void;
};

export function SettingsConfigForm({
  activeSection,
  canSave,
  feedbackKey,
  form,
  isApiKeyVisible,
  isCreateMode,
  isSaving,
  selectedItem,
  onInvalidSubmit,
  onSubmit,
  onToggleApiKeyVisibility,
}: SettingsConfigFormProps) {
  const t = useTranslations("Settings");
  const selectedProviderId =
    selectedItem && "providerId" in selectedItem ? selectedItem.providerId : undefined;
  const previewProvider =
    activeSection === "imageBed" || activeSection === "workflowSkill"
      ? undefined
      : resolveModelProvider(selectedProviderId, form.watch("name"), form.watch("example"));

  return (
    <Form {...form}>
      <form
        className="flex min-h-0 flex-col rounded-lg border bg-background"
        onSubmit={form.handleSubmit(onSubmit, onInvalidSubmit)}
      >
        <div className="grid flex-1 content-start gap-4 p-4">
          {activeSection === "workflowSkill" ? (
            <>
              <div className="grid gap-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("modelManager.workflowSkill.feature")}
                </p>
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  {selectedItem
                    ? t(`modelManager.workflowFeature.${selectedItem.name}`)
                    : t("modelManager.workflowSkill.selectFeature")}
                </p>
              </div>

              <FormField
                control={form.control}
                name="primarySkill"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">
                      {t("modelManager.workflowSkill.primarySkill")}
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {WORKFLOW_PRIMARY_SKILLS.map((skill) => (
                          <SelectItem key={skill} value={skill}>
                            {skill}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="uploadSkill"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">
                      {t("modelManager.workflowSkill.uploadSkill")}
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">{t("modelManager.workflowSkill.none")}</SelectItem>
                        {WORKFLOW_UPLOAD_SKILLS.map((skill) => (
                          <SelectItem key={skill} value={skill}>
                            {skill}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </>
          ) : (
            <>
              <FormField
                control={form.control}
                name="name"
                rules={{ required: t("modelManager.validation.nameRequired") }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">
                      {activeSection === "imageBed"
                        ? t("modelManager.form.imageBedName")
                        : t("modelManager.form.name")}
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          placeholder={
                            activeSection === "imageBed"
                              ? t("modelManager.form.imageBedNamePlaceholder")
                              : t("modelManager.form.namePlaceholder")
                          }
                          className={previewProvider ? "pr-10" : undefined}
                        />
                        {previewProvider ? (
                          <span
                            className="absolute top-1/2 right-2 flex -translate-y-1/2"
                            aria-label={t("modelManager.form.providerIcon")}
                          >
                            <ModelProviderIcon provider={previewProvider} />
                          </span>
                        ) : null}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="apiKey"
                rules={{ required: t("modelManager.validation.apiKeyRequired") }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t("modelManager.form.apiKey")}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={isApiKeyVisible ? "text" : "password"}
                          placeholder={t("modelManager.form.apiKeyPlaceholder")}
                          className="pr-9"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={onToggleApiKeyVisibility}
                          aria-label={
                            isApiKeyVisible
                              ? t("modelManager.actions.hideApiKey")
                              : t("modelManager.actions.showApiKey")
                          }
                          className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {isApiKeyVisible ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}

          {activeSection === "video" && (
            <FormField
              control={form.control}
              name="videoReferenceMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">
                    {t("modelManager.form.videoReferenceMode")}
                  </FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-2 gap-2">
                      {VIDEO_REFERENCE_MODES.map((mode) => (
                        <Button
                          key={mode}
                          type="button"
                          variant={field.value === mode ? "default" : "secondary"}
                          size="sm"
                          onClick={() => field.onChange(mode)}
                          className={cn(
                            "h-8",
                            field.value !== mode && "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {t(`modelManager.videoReferenceModes.${mode}`)}
                        </Button>
                      ))}
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />
          )}

          {activeSection !== "workflowSkill" && (
            <FormField
              control={form.control}
              name="example"
              rules={{ required: t("modelManager.validation.exampleRequired") }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">{t("modelManager.form.example")}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder={
                        activeSection === "imageBed"
                          ? t("modelManager.form.imageBedExamplePlaceholder")
                          : t("modelManager.form.examplePlaceholder")
                      }
                      className="h-40 resize-none"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {feedbackKey && (
            <p
              className={cn(
                "text-xs",
                feedbackKey === "modelManager.feedback.saved"
                  ? "text-muted-foreground"
                  : "text-destructive",
              )}
            >
              {t(feedbackKey)}
            </p>
          )}

          {!isCreateMode && selectedItem ? (
            <p className="text-xs text-muted-foreground">
              {t("modelManager.form.editing", {
                name:
                  activeSection === "workflowSkill"
                    ? t(`modelManager.workflowFeature.${selectedItem.name}`)
                    : selectedItem.name,
              })}
            </p>
          ) : null}
        </div>

        <div className="mt-auto flex justify-end border-t px-4 py-3">
          <Button type="submit" size="sm" disabled={!canSave}>
            {isSaving ? t("modelManager.actions.saving") : t("modelManager.actions.save")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
