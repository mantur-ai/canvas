"use client"

import { useCallback, useEffect, useState } from "react"
import { Edit3, Loader2, LogIn, Plus, Trash2, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { fetchProjects, updateCurrentProject } from "@/lib/project-api"
import { deleteProject, updateProject } from "@/lib/services/project-service"
import type { ProjectListItem } from "@/lib/project-types"
import { useCanvasStore } from "@/store/use-canvas-store"

import { AddScriptForm, type ProjectEditableFormValues } from "./components/add-script-form"

function SamplePreviewDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("Projects")
  const [sampleContent, setSampleContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadSample = useCallback(async () => {
    setSampleContent(null)
    setLoading(true)
    try {
      const response = await fetch("/sample.md")
      const text = await response.text()
      setSampleContent(text)
    } catch {
      toast.error(t("addScript.sampleLoadError"))
    } finally {
      setLoading(false)
    }
  }, [t])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-60 max-h-[85vh] w-[min(92vw,800px)]"
        aria-describedby={undefined}
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={() => {
          void loadSample()
        }}
      >
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>{t("addScript.sampleTitle")}</DialogTitle>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </Button>
          </DialogClose>
        </DialogHeader>

        <div className="overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : sampleContent ? (
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-xs leading-relaxed">
              {sampleContent}
            </pre>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AddScriptDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (projectId: string) => Promise<void> | void
}) {
  const t = useTranslations("Projects")
  const [sampleOpen, setSampleOpen] = useState(false)

  const handleClose = () => {
    onOpenChange(false)
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) handleClose()
        }}
      >
        <DialogContent
          className="flex max-h-[85vh] flex-col"
          aria-describedby={undefined}
          showCloseButton={false}
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle>{t("addScript.title")}</DialogTitle>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </Button>
            </DialogClose>
          </DialogHeader>

          <AddScriptForm
            onCancel={handleClose}
            onCreated={async (projectId) => {
              await onCreated(projectId)
              handleClose()
            }}
            onViewSample={() => setSampleOpen(true)}
          />
        </DialogContent>
      </Dialog>

      <SamplePreviewDialog open={sampleOpen} onOpenChange={setSampleOpen} />
    </>
  )
}

function EditProjectDialog({
  project,
  onClose,
  onUpdated,
}: {
  project: ProjectListItem | null
  onClose: () => void
  onUpdated: () => void
}) {
  const t = useTranslations("Projects")
  const currentProject = useCanvasStore((state) => state.currentProject)
  const setCurrentProject = useCanvasStore((state) => state.setCurrentProject)

  const handleSave = async (values: ProjectEditableFormValues) => {
    if (!project) return false
    try {
      const result = await updateProject({
        projectId: project.id,
        description: values.description.trim(),
        aspectRatio: values.aspectRatio,
        resolution: values.resolution,
        generateAudio: values.generateAudio,
        generateSubtitles: values.generateSubtitles,
      })

      if (result.success) {
        if (currentProject?.id === result.project.id) {
          setCurrentProject(result.project)
        }
        toast.success(t("editSuccess"))
        onUpdated()
        onClose()
        return true
      } else {
        toast.error(t("editError"))
      }
    } catch {
      toast.error(t("editError"))
    }
    return false
  }

  return (
    <Dialog open={!!project} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[85vh] w-[min(92vw,520px)] flex-col"
        aria-describedby={undefined}
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>{t("editTitle")}</DialogTitle>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </Button>
          </DialogClose>
        </DialogHeader>

        {project ? (
          <AddScriptForm
            mode="edit"
            initialValues={{
              description: project.description,
              aspectRatio: project.aspectRatio,
              resolution: project.resolution,
              generateAudio: project.generateAudio,
              generateSubtitles: project.generateSubtitles,
            }}
            onCancel={onClose}
            onSaved={handleSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function DeleteProjectDialog({
  project,
  onClose,
  onDeleted,
}: {
  project: ProjectListItem | null
  onClose: () => void
  onDeleted: () => void
}) {
  const t = useTranslations("Projects")
  const currentProject = useCanvasStore((state) => state.currentProject)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!project) return
    if (currentProject?.id === project.id) {
      toast.error(t("deleteCurrentDisabled"))
      onClose()
      return
    }

    setDeleting(true)
    try {
      const result = await deleteProject(project.id)
      if (result.success) {
        toast.success(t("deleteSuccess"))
        onDeleted()
        onClose()
      } else {
        toast.error(t("deleteError"))
      }
    } catch {
      toast.error(t("deleteError"))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={!!project} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(92vw,420px)]" aria-describedby={undefined} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("deleteTitle")}</DialogTitle>
          <DialogDescription className="mt-2">{t("deleteDescription", { name: project?.name ?? "" })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("addScript.cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? t("deleting") : t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ProjectsPanel({ onEnteredProject }: { onEnteredProject?: () => void }) {
  const t = useTranslations("Projects")
  const currentProject = useCanvasStore((state) => state.currentProject)
  const projects = useCanvasStore((state) => state.projects)
  const setCommandStatuses = useCanvasStore((state) => state.setCommandStatuses)
  const setCurrentProject = useCanvasStore((state) => state.setCurrentProject)
  const setProjects = useCanvasStore((state) => state.setProjects)
  const [addScriptOpen, setAddScriptOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<ProjectListItem | null>(null)
  const [deletingProject, setDeletingProject] = useState<ProjectListItem | null>(null)
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [enteringProjectId, setEnteringProjectId] = useState<string | null>(null)

  const refreshProjects = useCallback(async () => {
    setLoadingProjects(true)
    try {
      const nextProjects = await fetchProjects()
      setProjects(nextProjects)
    } catch {
      toast.error(t("loadError"))
    } finally {
      setLoadingProjects(false)
    }
  }, [setProjects, t])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refreshProjects()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [refreshProjects])

  const handleEnterProject = async (project: ProjectListItem) => {
    setEnteringProjectId(project.id)
    try {
      const projectDetail = await updateCurrentProject(project.id)
      setCommandStatuses({})
      setCurrentProject(projectDetail)
      toast.success(t("enterSuccess", { name: projectDetail.name }))
      onEnteredProject?.()
    } catch {
      toast.error(t("loadError"))
    } finally {
      setEnteringProjectId(null)
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <ScrollArea className="min-h-[calc(((min(92vw,960px)-2rem)-1.5rem)/3*2+0.75rem)] max-h-[60vh]">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          <Button
            type="button"
            variant="outline"
            className="flex aspect-square h-auto w-full flex-col items-center justify-center rounded-lg border-dashed border-muted bg-background p-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => setAddScriptOpen(true)}
          >
            <div className="flex size-10 items-center justify-center rounded-lg transition-colors group-hover:scale-125">
              <Plus className="size-5 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
            <span className="text-xs text-muted-foreground transition-colors group-hover:text-foreground">
              {t("newProject")}
            </span>
          </Button>

          {loadingProjects ? (
            <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span className="text-xs">{t("loading")}</span>
            </div>
          ) : null}

          <TooltipProvider>
            {projects.map((project) => {
              const isCurrentProject = currentProject?.id === project.id

              return (
                <div
                  key={project.id}
                  className="group relative flex aspect-square w-full flex-col items-start justify-between overflow-hidden rounded-lg border border-border bg-background p-3 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                >
              <div className="flex w-full flex-col gap-2 ">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="truncate text-sm font-medium">{project.name}</p>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {project.name}
                  </TooltipContent>
                </Tooltip>
                {project.description ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{project.description}</p>
                ) : null}
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t("enter")}
                onClick={() => handleEnterProject(project)}
                disabled={enteringProjectId === project.id}
                className="absolute top-1/2 left-1/2 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 shadow-lg transition-all hover:scale-110 group-hover:opacity-100"
              >
                {enteringProjectId === project.id ? (
                  <Loader2 className="size-6 animate-spin" />
                ) : (
                  <LogIn className="size-6" />
                )}
              </Button>
              <div className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{t("episodeCount", { count: project.episodeCount })}</span>
                <span>{project.aspectRatio}</span>
              </div>
              <div className="absolute top-1/2 right-2 flex -translate-y-1/2 flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("edit")}
                  onClick={() => setEditingProject(project)}
                  className="size-6 bg-background/90 text-muted-foreground shadow-sm hover:text-foreground"
                >
                  <Edit3 className="size-3.5" />
                </Button>
                <span title={isCurrentProject ? t("deleteCurrentDisabled") : undefined}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={isCurrentProject ? t("deleteCurrentDisabled") : t("delete")}
                    onClick={() => setDeletingProject(project)}
                    disabled={isCurrentProject}
                    className="size-6 bg-background/90 text-muted-foreground shadow-sm hover:text-destructive disabled:opacity-40"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </span>
              </div>
              </div>
              )
            })}
          </TooltipProvider>
        </div>
      </ScrollArea>

      <AddScriptDialog
        open={addScriptOpen}
        onOpenChange={setAddScriptOpen}
        onCreated={async (projectId) => {
          await refreshProjects()
          const projectDetail = await updateCurrentProject(projectId)
          setCommandStatuses({})
          setCurrentProject(projectDetail)
          window.dispatchEvent(new CustomEvent("mantur:onboarding-refresh"))
          onEnteredProject?.()
        }}
      />
      <EditProjectDialog
        key={editingProject?.id ?? "edit-project"}
        project={editingProject}
        onClose={() => setEditingProject(null)}
        onUpdated={refreshProjects}
      />
      <DeleteProjectDialog
        project={deletingProject}
        onClose={() => setDeletingProject(null)}
        onDeleted={() => {
          void refreshProjects()
        }}
      />
    </div>
  )
}
