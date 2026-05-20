"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { fetchConfigCached, setConfigCache } from "@/lib/client-data-cache";
import type {
  AppConfig,
  ImageBedConfig,
  ImageModelConfig,
  VideoModelConfig,
} from "@/lib/config-schema";
import { inferModelProviderId } from "@/lib/model-providers";

import { ConfigList } from "./components/config-list";
import { SectionTabs } from "./components/section-tabs";
import { SettingsConfigForm } from "./components/settings-config-form";
import { EMPTY_CONFIG, EMPTY_FORM_VALUES } from "./constants";
import type { ConfigItem, ConfigSection, FeedbackKey, SettingsFormValues } from "./types";
import { getSectionItems, normalizeImageBeds, toFormValues } from "./utils";

export function SettingsPanel() {
  const [activeSection, setActiveSection] = useState<ConfigSection>("image");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig>(EMPTY_CONFIG);
  const [feedbackKey, setFeedbackKey] = useState<FeedbackKey>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const form = useForm<SettingsFormValues>({
    defaultValues: EMPTY_FORM_VALUES,
    mode: "onChange",
  });
  const watchedValues = useWatch({ control: form.control });

  const activeItems = useMemo(
    () => getSectionItems(config, activeSection),
    [activeSection, config],
  );
  const selectedItem = activeItems.find((item) => item.id === selectedId);
  const isCreateMode = false;
  const canSave =
    Boolean(watchedValues.name?.trim()) &&
    Boolean(watchedValues.apiKey?.trim()) &&
    Boolean(watchedValues.example?.trim()) &&
    !isSaving;

  const resetForm = useCallback(
    (section: ConfigSection, item?: ConfigItem) => {
      form.reset(toFormValues(section, item));
      setFeedbackKey("");
    },
    [form],
  );

  useEffect(() => {
    let isMounted = true;

    const loadConfig = async () => {
      try {
        const payload = await fetchConfigCached();
        if (!isMounted) return;

        if (payload) {
          setConfig(payload);
          const firstItem = getSectionItems(payload, activeSection)[0];
          if (firstItem) {
            setSelectedId(firstItem.id);
            resetForm(activeSection, firstItem);
          }
        }
        setFeedbackKey("");
      } catch {
        if (isMounted) setFeedbackKey("modelManager.feedback.loadError");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void loadConfig();

    return () => {
      isMounted = false;
    };
  }, [activeSection, resetForm]);

  const persistConfig = async (nextConfig: AppConfig) => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: nextConfig }),
      });
      if (!response.ok) throw new Error("CONFIG_SAVE_FAILED");

      const payload = (await response.json()) as { config: AppConfig };
      setConfig(payload.config);
      setConfigCache(payload.config);
      setFeedbackKey("modelManager.feedback.saved");
      return true;
    } catch {
      setFeedbackKey("modelManager.feedback.saveError");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const selectSection = (section: ConfigSection) => {
    setActiveSection(section);
    const firstItem = getSectionItems(config, section)[0];
    setSelectedId(firstItem?.id ?? null);
    resetForm(section, firstItem);
  };

  const selectItem = (item: ConfigItem | null) => {
    setSelectedId(item?.id ?? null);
    resetForm(activeSection, item ?? undefined);
  };

  const buildNextConfig = (id: string, values: SettingsFormValues): AppConfig => {
    const name = values.name.trim();
    const apiKey = values.apiKey.trim();
    const example = values.example.trim();
    const providerId = inferModelProviderId(name, example);

    if (activeSection === "image") {
      const record: ImageModelConfig = {
        id,
        name,
        apiKey,
        example,
        ...(providerId ? { providerId } : {}),
      };
      const imageModels = isCreateMode
        ? [record, ...config.imageModels]
        : config.imageModels.map((model) => (model.id === id ? record : model));

      return { ...config, imageModels };
    }

    if (activeSection === "video") {
      const record: VideoModelConfig = {
        id,
        name,
        apiKey,
        example,
        videoReferenceMode: values.videoReferenceMode,
        ...(providerId ? { providerId } : {}),
      };
      const videoModels = isCreateMode
        ? [record, ...config.videoModels]
        : config.videoModels.map((model) => (model.id === id ? record : model));

      return { ...config, videoModels };
    }

    const record: ImageBedConfig = {
      id,
      name,
      apiKey,
      example,
      isDefault: values.isDefault,
    };
    const imageBeds = isCreateMode
      ? [record, ...config.imageBeds]
      : config.imageBeds.map((imageBed) => (imageBed.id === id ? record : imageBed));
    const normalizedImageBeds = normalizeImageBeds(
      imageBeds.map((imageBed) => ({
        ...imageBed,
        isDefault: record.isDefault && imageBed.id !== record.id ? false : imageBed.isDefault,
      })),
    );

    return { ...config, imageBeds: normalizedImageBeds };
  };

  const handleSubmit = async (values: SettingsFormValues) => {
    const id = selectedId ?? getSectionItems(config, activeSection)[0]?.id;
    if (!id) {
      setFeedbackKey("modelManager.feedback.saveError");
      return;
    }
    const nextConfig = buildNextConfig(id, values);
    const saved = await persistConfig(nextConfig);
    if (!saved) return;

    setSelectedId(id);
    const savedItem = getSectionItems(nextConfig, activeSection).find(
      (item) => item.id === id,
    );
    resetForm(activeSection, savedItem);
  };

  const handleInvalidSubmit = () => {
    setFeedbackKey("modelManager.feedback.saveError");
  };

  const handleDefaultImageBedChange = async (itemId: string, checked: boolean) => {
    if (activeSection !== "imageBed" || !checked) return;

    const imageBeds = config.imageBeds.map((imageBed) => ({
      ...imageBed,
      isDefault: imageBed.id === itemId,
    }));
    const saved = await persistConfig({ ...config, imageBeds });
    if (!saved) return;

    if (selectedId !== null) {
      form.setValue("isDefault", selectedId === itemId, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  };

  return (
    <div className="grid min-h-140 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col rounded-lg border bg-background">
        <div className="border-b p-3">
          <SectionTabs activeSection={activeSection} onSelectSection={selectSection} />
        </div>

        <ConfigList
          activeItems={activeItems}
          activeSection={activeSection}
          isLoading={isLoading}
          selectedId={selectedId}
          onDefaultChange={(itemId, checked) => void handleDefaultImageBedChange(itemId, checked)}
          onSelectItem={selectItem}
        />
      </aside>

      <SettingsConfigForm
        activeSection={activeSection}
        canSave={canSave}
        feedbackKey={feedbackKey}
        form={form}
        isApiKeyVisible={isApiKeyVisible}
        isCreateMode={isCreateMode}
        isSaving={isSaving}
        selectedItem={selectedItem}
        onInvalidSubmit={handleInvalidSubmit}
        onSubmit={handleSubmit}
        onToggleApiKeyVisibility={() => setIsApiKeyVisible((current) => !current)}
      />
    </div>
  );
}
