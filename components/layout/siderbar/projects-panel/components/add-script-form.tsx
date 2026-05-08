"use client"

import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react"
import { AlertCircle, Eye, FileText, Loader2, Plus, Upload } from "lucide-react"
import { useTranslations } from "next-intl"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { parseScriptMD } from "@/lib/script-parser"
import { createProject } from "@/lib/services/project-service"

const ASPECT_RATIOS = [
  { value: "16:9", w: 32, h: 18 },
  { value: "4:3", w: 24, h: 18 },
  { value: "1:1", w: 20, h: 20 },
  { value: "3:4", w: 18, h: 24 },
  { value: "9:16", w: 14, h: 24 },
  { value: "21:9", w: 36, h: 15 },
] as const

const RESOLUTIONS = ["480p", "720p", "1080p"] as const

const DESCRIPTION_RECIPES = [
  { key: "cinematic", palette: "from-sky-500 via-cyan-300 to-slate-900" },
  { key: "anime", palette: "from-indigo-500 via-fuchsia-400 to-violet-900" },
  { key: "noir", palette: "from-zinc-200 via-zinc-600 to-zinc-950" },
  { key: "portrait", palette: "from-rose-300 via-stone-300 to-zinc-700" },
] as const

type ParseState = "idle" | "loading" | "success" | "error"

type AddScriptFormValues = {
  projectName: string
  description: string
  aspectRatio: string
  resolution: string
  generateAudio: boolean
  generateSubtitles: boolean
}

export type ProjectEditableFormValues = Pick<
  AddScriptFormValues,
  "description" | "aspectRatio" | "resolution" | "generateAudio" | "generateSubtitles"
>

type BaseFormProps = {
  onCancel: () => void
}

type CreateScriptFormProps = BaseFormProps & {
  mode?: "create"
  onCreated: (projectId: string) => Promise<void> | void
  onViewSample: () => void
}

type EditScriptFormProps = BaseFormProps & {
  mode: "edit"
  initialValues: ProjectEditableFormValues
  onSaved: (values: ProjectEditableFormValues) => Promise<boolean>
}

type AddScriptFormProps = CreateScriptFormProps | EditScriptFormProps

function AspectRatioIcon({ w, h }: { w: number; h: number }) {
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="opacity-60">
      <rect x="1" y="1" width={w - 2} height={h - 2} rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function ProjectEditableFields({
  control,
}: {
  control: ReturnType<typeof useForm<AddScriptFormValues>>["control"]
}) {
  const t = useTranslations("Projects")

  return (
    <>
      <FormField
        control={control}
        name="aspectRatio"
        render={({ field }) => (
          <FormItem className="mb-5">
            <FormLabel>{t("addScript.aspectRatio")}</FormLabel>
            <FormControl>
              <div className="flex gap-2">
                {ASPECT_RATIOS.map(({ value, w, h }) => (
                  <Button
                    key={value}
                    type="button"
                    variant={field.value === value ? "default" : "secondary"}
                    onClick={() => field.onChange(value)}
                    className={cn(
                      "flex h-auto flex-1 flex-col items-center gap-1 px-3 py-2",
                      field.value !== value && "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <div className="flex flex-1 items-center justify-center">
                      <AspectRatioIcon w={w} h={h} />
                    </div>
                    <span className="text-xs">{value}</span>
                  </Button>
                ))}
              </div>
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="resolution"
        render={({ field }) => (
          <FormItem className="mb-5">
            <FormLabel>{t("addScript.resolution")}</FormLabel>
            <FormControl>
              <div className="flex flex-wrap gap-2">
                {RESOLUTIONS.map((resolution) => (
                  <Button
                    key={resolution}
                    type="button"
                    variant={field.value === resolution ? "default" : "secondary"}
                    onClick={() => field.onChange(resolution)}
                    className={cn(
                      "h-auto px-3 py-1.5 text-sm",
                      field.value !== resolution && "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {resolution}
                  </Button>
                ))}
              </div>
            </FormControl>
          </FormItem>
        )}
      />

      <div className="mb-5 grid gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <FormField
          control={control}
          name="generateAudio"
          render={({ field }) => (
            <FormItem className="flex items-center gap-3">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
              </FormControl>
              <FormLabel className="text-sm font-normal">{t("addScript.generateAudio")}</FormLabel>
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="generateSubtitles"
          render={({ field }) => (
            <FormItem className="flex items-center gap-3">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
              </FormControl>
              <FormLabel className="text-sm font-normal">
                {t("addScript.generateSubtitles")}
              </FormLabel>
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name="description"
        render={({ field }) => (
          <FormItem className="mb-5">
            <FormControl>
              <div className="rounded-lg border border-border bg-muted/40 p-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <FormLabel className="text-xs text-muted-foreground">
                    {t("addScript.recipePack")}
                  </FormLabel>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("addScript.addRecipe")}
                    className="size-6 rounded-md border border-border bg-background/80 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      const nextValue = [field.value, t("addScript.customRecipePrompt")]
                        .filter(Boolean)
                        .join("\n")
                      field.onChange(nextValue)
                    }}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>

                <ScrollArea
                  orientation="horizontal"
                  className="mb-2 w-full overflow-hidden"
                  scrollBarClassName="h-1.5 border-0 p-0"
                  thumbClassName="bg-muted-foreground/40"
                >
                  <div className="flex w-max gap-2 pb-2">
                    {DESCRIPTION_RECIPES.map((recipe) => (
                      <button
                        key={recipe.key}
                        type="button"
                        className="grid w-12 shrink-0 gap-1 text-center"
                        onClick={() => {
                          const nextValue = [field.value, t(`addScript.recipes.${recipe.key}.prompt`)]
                            .filter(Boolean)
                            .join("\n")
                          field.onChange(nextValue)
                        }}
                      >
                        <span
                          className={cn(
                            "block aspect-square rounded-md border border-border bg-linear-to-br shadow-sm transition-transform hover:scale-105",
                            recipe.palette,
                          )}
                        />
                        <span className="truncate text-[10px] leading-none text-muted-foreground">
                          {t(`addScript.recipes.${recipe.key}.label`)}
                        </span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>

                <Textarea
                  {...field}
                  placeholder={t("addScript.descriptionPlaceholder")}
                  className="min-h-20 resize-none border-0 bg-background/55 text-xs shadow-none focus-visible:ring-0"
                />
              </div>
            </FormControl>
          </FormItem>
        )}
      />
    </>
  )
}

export function AddScriptForm(props: AddScriptFormProps) {
  const t = useTranslations("Projects")
  const isEditMode = props.mode === "edit"
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [parseState, setParseState] = useState<ParseState>(isEditMode ? "success" : "idle")
  const [parseError, setParseError] = useState("")
  const [creating, setCreating] = useState(false)
  const form = useForm<AddScriptFormValues>({
    defaultValues: {
      projectName: "",
      description: isEditMode ? props.initialValues.description : "",
      aspectRatio: isEditMode ? props.initialValues.aspectRatio : "16:9",
      resolution: isEditMode ? props.initialValues.resolution : "1080p",
      generateAudio: isEditMode ? props.initialValues.generateAudio : true,
      generateSubtitles: isEditMode ? props.initialValues.generateSubtitles : true,
    },
    mode: "onChange",
  })
  const {
    formState: { isValid },
    handleSubmit,
    reset,
    setValue,
  } = form
  const projectName = useWatch({ control: form.control, name: "projectName" })

  const resetUpload = () => {
    setParseState("idle")
    setParseError("")
    setSelectedFile(null)
    reset()
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleFileSelect = async (file: File) => {
    setSelectedFile(null)

    if (!file.name.endsWith(".md")) {
      setParseState("error")
      setParseError(t("addScript.invalidFormat"))
      return
    }

    setParseState("loading")
    setParseError("")
    setValue("projectName", "", { shouldDirty: true, shouldValidate: true })

    try {
      const content = await file.text()
      const parsed = parseScriptMD(content)
      setValue("projectName", parsed.name || file.name.replace(/\.md$/i, ""), {
        shouldDirty: true,
        shouldValidate: true,
      })
      setSelectedFile(file)
      setParseState("success")
    } catch {
      setParseState("error")
      setParseError(t("addScript.parseError"))
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file) void handleFileSelect(file)
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) void handleFileSelect(file)
  }

  const handleCancel = () => {
    if (!isEditMode) {
      resetUpload()
    }
    props.onCancel()
  }

  const onSubmit = async (values: AddScriptFormValues) => {
    if (isEditMode) {
      setCreating(true)
      try {
        await props.onSaved({
          description: values.description.trim(),
          aspectRatio: values.aspectRatio,
          resolution: values.resolution,
          generateAudio: values.generateAudio,
          generateSubtitles: values.generateSubtitles,
        })
      } finally {
        setCreating(false)
      }
      return
    }

    if (parseState !== "success" || !values.projectName.trim()) return

    setCreating(true)
    try {
      if (!selectedFile) {
        toast.error(t("addScript.fileMissing"))
        return
      }

      const fileContent = await selectedFile.text()
      const result = await createProject({
        fileName: values.projectName.trim(),
        fileContent,
        description: values.description.trim(),
        aspectRatio: values.aspectRatio,
        resolution: values.resolution,
        generateAudio: values.generateAudio,
        generateSubtitles: values.generateSubtitles,
      })

      if (result.success) {
        await props.onCreated(result.projectId)
        toast.success(t("addScript.createSuccess"))
        resetUpload()
      } else {
        toast.error(t("addScript.createError"))
      }
    } catch {
      toast.error(t("addScript.createError"))
    } finally {
      setCreating(false)
    }
  }

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    void handleSubmit(onSubmit)(event)
  }

  return (
    <Form {...form}>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleFormSubmit}>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {/* Parse the uploaded markdown first, then let react-hook-form own the editable project metadata. */}
          {!isEditMode ? (
            <>
              <div className="mb-5 flex flex-col gap-2">
                <Label className="text-sm text-muted-foreground" htmlFor="script-file">
                  {t("addScript.uploadLabel")}
                </Label>
                <p className="text-xs leading-relaxed text-muted-foreground" id="script-file-description">
                  {t("addScript.uploadDescription")}
                </p>
                <div
                  onClick={() => parseState === "idle" && fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={(event) => event.preventDefault()}
                  className={cn(
                    "flex h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors",
                    parseState === "idle"
                      ? "border-border bg-muted/50 hover:border-primary/50"
                      : "border-primary/30 bg-primary/5",
                  )}
                >
                  {parseState === "idle" && (
                    <>
                      <Upload className="size-6 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{t("addScript.uploadHint")}</span>
                    </>
                  )}

                  {parseState === "loading" && (
                    <div className="flex items-center gap-2">
                      <Loader2 className="size-5 animate-spin text-primary" />
                      <span className="text-xs text-primary">{t("addScript.parsing")}</span>
                    </div>
                  )}

                  {parseState === "success" && (
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-2">
                        <FileText className="size-5 text-primary" />
                        <span className="text-sm font-medium">{projectName}</span>
                      </div>
                    </div>
                  )}

                  {parseState === "error" && (
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle className="size-5 text-destructive" />
                      <span className="text-xs text-destructive">{parseError}</span>
                      <Button
                        type="button"
                        variant="link"
                        onClick={(event) => {
                          event.stopPropagation()
                          props.onViewSample()
                        }}
                        className="h-auto gap-1 p-0 text-xs"
                      >
                        <Eye className="size-3" />
                        {t("addScript.viewSample")}
                      </Button>
                    </div>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  id="script-file"
                  accept=".md"
                  aria-describedby="script-file-description"
                  className="hidden"
                  onChange={handleInputChange}
                />
              </div>

              <FormField
                control={form.control}
                name="projectName"
                rules={{ required: true, validate: (value) => value.trim().length > 0 }}
                render={({ field }) => (
                  <FormItem className="mb-5">
                    <FormLabel>{t("addScript.projectName")}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t("addScript.projectNamePlaceholder")} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </>
          ) : null}

          <ProjectEditableFields control={form.control} />
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-border bg-card px-6 py-4">
          <Button type="button" variant="secondary" onClick={handleCancel}>
            {t("addScript.cancel")}
          </Button>
          {(isEditMode || parseState === "success") && (
            <Button type="submit" disabled={creating || !isValid}>
              {creating ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  {isEditMode ? t("saving") : t("addScript.creating")}
                </span>
              ) : (
                isEditMode ? t("save") : t("addScript.confirm")
              )}
            </Button>
          )}
        </div>
      </form>
    </Form>
  )
}
