"use client";

import { useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ArrowUp, File, Paperclip, Plus, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadProjectTempImages, type ProjectTempImage } from "@/lib/project-api";
import { cn } from "@/lib/utils";

export type GlobalChatAttachment = ProjectTempImage & {
  kind: "file" | "image";
};

type GlobalChatComposerProps = {
  addAttachmentLabel: string;
  attachmentFallbackLabel: (index: number, file: ProjectTempImage) => string;
  attachmentListLabel: string;
  className?: string;
  inputLabel: string;
  isExecuting?: boolean;
  placeholder: string;
  projectId: string;
  removeAttachmentLabel: string;
  sendLabel: string;
  stopLabel: string;
  onStop?: () => void;
  onSubmit: (payload: { attachments: GlobalChatAttachment[]; html: string; text: string }) => void;
};

export function GlobalChatComposer({
  addAttachmentLabel,
  attachmentFallbackLabel,
  attachmentListLabel,
  className,
  inputLabel,
  isExecuting = false,
  placeholder,
  projectId,
  removeAttachmentLabel,
  sendLabel,
  stopLabel,
  onStop,
  onSubmit,
}: GlobalChatComposerProps) {
  const [isEmpty, setIsEmpty] = useState(true);
  const [attachments, setAttachments] = useState<GlobalChatAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        orderedList: false,
      }),
    ],
    editorProps: {
      attributes: {
        "aria-label": inputLabel,
        class:
          "min-h-18 max-h-38 w-full overflow-y-auto outline-none text-sm leading-6 text-foreground caret-primary",
      },
    },
    immediatelyRender: false,
    onUpdate: ({ editor: updatedEditor }) => {
      setIsEmpty(updatedEditor.isEmpty);
    },
  });

  const handleSubmit = () => {
    if (isExecuting) {
      onStop?.();
      return;
    }

    if (!editor || (editor.isEmpty && attachments.length === 0)) return;

    onSubmit({
      attachments,
      html: editor.getHTML(),
      text: editor.getText(),
    });

    editor.commands.clearContent();
    setAttachments([]);
    setIsEmpty(true);
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;

    event.preventDefault();
    if (isExecuting) return;

    handleSubmit();
  };

  const handleFilesChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!projectId || files.length === 0) return;

    try {
      const uploadedFiles = await uploadProjectTempImages(projectId, files);
      setAttachments((currentAttachments) => [
        ...currentAttachments,
        ...uploadedFiles.map((file, index) => ({
          ...file,
          kind: file.type.startsWith("image/") ? ("image" as const) : ("file" as const),
          label: attachmentFallbackLabel(currentAttachments.length + index + 1, file),
        })),
      ]);
    } catch {
      // Temporary upload is best-effort; users can retry from the attachment button.
    }
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachments((currentAttachments) =>
      currentAttachments.filter((attachment) => attachment.id !== attachmentId),
    );
  };

  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card px-3 py-3 shadow-[0_10px_36px_rgba(0,0,0,0.28)]",
        className,
      )}
    >
      {attachments.length > 0 ? (
        <div
          className="mb-3 flex max-w-full items-center gap-2 overflow-x-auto pb-1"
          aria-label={attachmentListLabel}
        >
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="group relative size-11 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary"
              title={attachment.name}
            >
              {attachment.kind === "image" ? (
                <div
                  className="size-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${attachment.url})` }}
                  aria-hidden="true"
                />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-0.5 bg-background px-1 text-muted-foreground">
                  <File className="size-4" />
                  <span className="w-full truncate text-[9px] leading-none">{attachment.name}</span>
                </div>
              )}
              <button
                type="button"
                className="absolute right-1 top-1 hidden size-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm group-hover:flex"
                aria-label={removeAttachmentLabel}
                onClick={() => removeAttachment(attachment.id)}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="relative">
        {isEmpty ? (
          <div className="pointer-events-none absolute left-0 top-0 text-sm leading-6 text-muted-foreground">
            {placeholder}
          </div>
        ) : null}
        <EditorContent
          editor={editor}
          className="min-h-18 max-h-38 overflow-hidden [&_.ProseMirror]:min-h-18 [&_.ProseMirror]:max-h-38 [&_.ProseMirror]:overflow-y-auto [&_.ProseMirror_p]:m-0"
          onKeyDownCapture={handleEditorKeyDown}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            aria-label={addAttachmentLabel}
            disabled={!projectId}
            onClick={() => fileInputRef.current?.click()}
          >
            {attachments.length === 0 ? <Paperclip className="size-4" /> : <Plus className="size-4" />}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            aria-label={addAttachmentLabel}
            onChange={handleFilesChange}
          />
        </div>

        <Button
          type="button"
          size="icon-sm"
          className="size-8 rounded-full"
          aria-label={isExecuting ? stopLabel : sendLabel}
          disabled={!isExecuting && (!editor || (isEmpty && attachments.length === 0))}
          onClick={handleSubmit}
        >
          {isExecuting ? (
            <Square className="size-4 fill-current" />
          ) : (
            <ArrowUp className="size-5" />
          )}
        </Button>
      </div>
    </section>
  );
}
