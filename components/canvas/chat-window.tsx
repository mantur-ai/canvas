"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { mergeAttributes, Node as TiptapNode, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ArrowUp, Clapperboard, ImagePlus, Plus, Sparkles, Square, Timer, X } from "lucide-react";
import { ModelProviderIcon } from "@/components/model-provider-icon";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uploadProjectTempImages, type ProjectTempImage } from "@/lib/project-api";
import { resolveModelProvider } from "@/lib/model-providers";
import { cn } from "@/lib/utils";

export type ChatWindowReferenceImage = {
  categoryKey?: string;
  categoryLabel?: string;
  id: string;
  label: string;
  name: string;
  url: string;
};

type ChatWindowAttachment = ProjectTempImage | ChatWindowReferenceImage;

export type ChatWindowVideoOptions = {
  durationSeconds?: number;
  shotType?: string;
};

export type ChatWindowSubmitPayload = {
  attachments: ChatWindowAttachment[];
  html: string;
  text: string;
  videoOptions?: ChatWindowVideoOptions;
};

export type ChatWindowModelOption = {
  id: string;
  name: string;
  providerId?: string;
};

export type ChatWindowCommandStatus = "error" | "loading" | "success";

type MentionRange = {
  from: number;
  to: number;
};

type MentionMenuPosition = {
  left: number;
  top: number;
};

const ASSET_CATEGORY_ORDER = ["character", "scene", "prop", "reference"];
const ENCODED_MENTION_PATTERN = /@\{([^}]+)\}/g;

function normalizeAttachmentCategoryKey(categoryKey: string) {
  if (categoryKey === "characters") return "character";
  if (categoryKey === "scenes") return "scene";
  if (categoryKey === "props") return "prop";
  if (categoryKey === "references") return "reference";
  return categoryKey;
}

function getAttachmentMentionCategory(attachment: ChatWindowAttachment) {
  if ("fileName" in attachment) return "temp";
  return normalizeAttachmentCategoryKey(
    attachment.categoryKey?.trim() || attachment.categoryLabel?.trim() || "reference",
  );
}

function encodeAttachmentMention(attachment: ChatWindowAttachment) {
  return `@{${attachment.id}}`;
}

function getEncodedMentionIds(text: string) {
  return [...text.matchAll(ENCODED_MENTION_PATTERN)]
    .map((match) => match[1] ?? "")
    .filter(Boolean);
}

function mergeMentionAttachments(params: {
  attachments: ChatWindowAttachment[];
  mentionSource: ChatWindowAttachment[];
  text: string;
}) {
  const mentionIds = new Set(getEncodedMentionIds(params.text));
  const seenIds = new Set<string>();
  const merged: ChatWindowAttachment[] = [];
  const pushAttachment = (attachment: ChatWindowAttachment) => {
    if (seenIds.has(attachment.id)) return;
    seenIds.add(attachment.id);
    merged.push(attachment);
  };

  params.attachments.forEach(pushAttachment);
  params.mentionSource
    .filter((attachment) => mentionIds.has(attachment.id))
    .forEach(pushAttachment);

  return merged;
}

function createInlineMentionNode(attachment: ChatWindowAttachment): JSONContent {
  return {
    type: "chatInlineTag",
    attrs: {
      kind: "mention",
      label: `@${attachment.label}`,
      mentionCategory: getAttachmentMentionCategory(attachment),
      mentionId: attachment.id,
      mentionUrl: attachment.url || "",
    },
  };
}

function createFallbackMentionNode(id: string, category: string): JSONContent {
  return {
    type: "chatInlineTag",
    attrs: {
      kind: "mention",
      label: `@{${id}}${category}`,
      mentionCategory: category,
      mentionId: id,
    },
  };
}

function serializePromptContent(content: JSONContent): string {
  if (content.type === "text") return content.text ?? "";

  if (content.type === "chatInlineTag") {
    const attrs = content.attrs ?? {};
    const label = typeof attrs.label === "string" ? attrs.label : "";
    const kind = typeof attrs.kind === "string" ? attrs.kind : "";
    const mentionId = typeof attrs.mentionId === "string" ? attrs.mentionId : "";

    if (kind === "mention" && mentionId) return `@{${mentionId}}`;
    return label;
  }

  const childText = (content.content ?? []).map(serializePromptContent).join("");
  return content.type === "paragraph" ? childText : childText;
}

function serializePromptText(content: JSONContent): string {
  return (content.content ?? [])
    .map(serializePromptContent)
    .join("\n");
}

function createPromptLineContent(
  line: string,
  mentionTags: ChatWindowReferenceImage[],
): JSONContent[] {
  const tags = mentionTags
    .filter((tag) => tag.label.trim().length > 0)
    .sort((first, second) => second.label.length - first.label.length);
  const content: JSONContent[] = [];
  let cursor = 0;

  while (cursor < line.length) {
    ENCODED_MENTION_PATTERN.lastIndex = cursor;
    const encodedMatch = ENCODED_MENTION_PATTERN.exec(line);
    const nextMatch = tags.reduce<
      | {
          attachment: ChatWindowReferenceImage;
          index: number;
          length: number;
        }
      | null
    >((match, tag) => {
      const candidates = [`@${tag.label}`, tag.label].flatMap((token) => {
        const index = line.indexOf(token, cursor);
        return index >= 0 ? [{ attachment: tag, index, length: token.length }] : [];
      });
      const candidate = candidates.sort((first, second) => first.index - second.index)[0];
      if (!candidate) return match;
      if (!match || candidate.index < match.index) return candidate;
      if (candidate.index === match.index && candidate.length > match.length) return candidate;
      return match;
    }, null);
    const nextEncodedMatch = encodedMatch
      ? {
          id: encodedMatch[1] ?? "",
          index: encodedMatch.index,
          length: encodedMatch[0].length,
        }
      : null;
    const shouldUseEncodedMatch =
      nextEncodedMatch && (!nextMatch || nextEncodedMatch.index <= nextMatch.index);

    if (!nextMatch && !nextEncodedMatch) {
      content.push({ type: "text", text: line.slice(cursor) });
      break;
    }

    const matchIndex = shouldUseEncodedMatch ? nextEncodedMatch.index : nextMatch?.index ?? cursor;
    if (matchIndex > cursor) {
      content.push({ type: "text", text: line.slice(cursor, matchIndex) });
    }

    if (shouldUseEncodedMatch) {
      const matchedTag = tags.find((tag) => tag.id === nextEncodedMatch.id);
      content.push(
        matchedTag
          ? createInlineMentionNode(matchedTag)
          : createFallbackMentionNode(nextEncodedMatch.id, ""),
      );
      cursor = nextEncodedMatch.index + nextEncodedMatch.length;
    } else if (nextMatch) {
      content.push(createInlineMentionNode(nextMatch.attachment));
      cursor = nextMatch.index + nextMatch.length;
    }
  }

  return content;
}

function createPromptContent(
  prompt: string,
  mentionTags: ChatWindowReferenceImage[] = [],
): JSONContent {
  const lines = prompt.split(/\r?\n/);

  return {
    type: "doc",
    content:
      prompt.trim().length === 0 && mentionTags.length > 0
        ? [
            {
              type: "paragraph",
              content: mentionTags.flatMap((tag) => [
                createInlineMentionNode(tag),
                {
                  type: "text",
                  text: " ",
                },
              ]),
            },
          ]
        : lines.map((line) => ({
        type: "paragraph",
        ...(line ? { content: createPromptLineContent(line, mentionTags) } : {}),
      })),
  };
}

const VIDEO_DURATION_MAX = 15;
const VIDEO_SHOT_TYPES = [
  "static",
  "push-in",
  "pull-out",
  "pan",
  "tilt",
  "tracking",
  "orbit",
  "handheld",
] as const;
const VIDEO_DURATION_OPTIONS = Array.from({ length: VIDEO_DURATION_MAX }, (_, index) => index + 1);

function getAttachmentCategoryKey(attachment: ChatWindowAttachment) {
  if ("fileName" in attachment) return "temp";
  return normalizeAttachmentCategoryKey(attachment.categoryKey ?? "");
}

function getAttachmentCategoryLabel(attachment: ChatWindowAttachment) {
  return "categoryLabel" in attachment ? attachment.categoryLabel : "";
}

function getAttachmentCategoryOrder(attachment: ChatWindowAttachment) {
  const categoryKey = getAttachmentCategoryKey(attachment) ?? "";
  const orderIndex = ASSET_CATEGORY_ORDER.indexOf(categoryKey);

  return orderIndex >= 0 ? orderIndex : ASSET_CATEGORY_ORDER.length;
}

const ChatInlineTag = TiptapNode.create({
  name: "chatInlineTag",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  addAttributes() {
    return {
      label: {
        default: "",
      },
      kind: {
        default: "default",
      },
      mentionCategory: {
        default: "",
      },
      mentionId: {
        default: "",
      },
      mentionUrl: {
        default: "",
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-chat-inline-tag]",
      },
    ];
  },
  renderHTML({ HTMLAttributes, node }) {
    const kindClass =
      node.attrs.kind === "shot"
        ? "bg-primary/20 text-primary"
        : node.attrs.kind === "duration"
          ? "bg-accent text-accent-foreground"
          : node.attrs.kind === "mention"
            ? "bg-secondary text-secondary-foreground"
            : "bg-muted text-muted-foreground";

    const mentionUrl = node.attrs.mentionUrl || "";

    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-chat-inline-tag": "true",
        class: cn(
          "mx-0.5 my-1 inline-flex items-center gap-1 rounded-3xl px-2 py-1 text-xs font-medium leading-none align-baseline",
          kindClass,
        ),
        contenteditable: "false",
      }),
      ...(mentionUrl
        ? [
            [
              "span",
              {
                class: "inline-block size-3 shrink-0 rounded-sm bg-cover bg-center",
                style: `background-image: url(${mentionUrl})`,
              },
            ],
          ]
        : []),
      node.attrs.label,
    ];
  },
  renderText({ node }) {
    return node.attrs.label;
  },
});

type ChatWindowProps = {
  className?: string;
  commandStatus?: ChatWindowCommandStatus;
  initialPrompt?: string;
  initialPromptKey?: string;
  initialMentionTags?: ChatWindowReferenceImage[];
  projectId: string;
  emptyModelLabel: string;
  placeholder: string;
  inputLabel: string;
  addAttachmentLabel: string;
  attachmentFallbackLabel: (index: number) => string;
  attachmentListLabel: string;
  removeAttachmentLabel: string;
  firstFrameLabel: string;
  lastFrameLabel: string;
  promptPairSeparator: string;
  modelSelectLabel: string;
  modelOptions: ChatWindowModelOption[];
  mediaMentionImages: ChatWindowReferenceImage[];
  preferMediaMentions: boolean;
  referenceImages: ChatWindowReferenceImage[];
  requiresFirstLastFrame: boolean;
  selectedModelId: string;
  sendLabel: string;
  stopLabel: string;
  showVideoOptions: boolean;
  videoDurationLabel: string;
  videoDurationUnitLabel: string;
  videoShotLabel: string;
  videoShotLabels: Record<(typeof VIDEO_SHOT_TYPES)[number], string>;
  onModelChange: (modelId: string) => void;
  onSubmit?: (payload: ChatWindowSubmitPayload) => void;
  onStop?: () => void;
};

export function ChatWindow({
  className,
  commandStatus,
  initialPrompt = "",
  initialPromptKey = "",
  initialMentionTags = [],
  projectId,
  emptyModelLabel,
  placeholder,
  inputLabel,
  addAttachmentLabel,
  attachmentFallbackLabel,
  attachmentListLabel,
  removeAttachmentLabel,
  firstFrameLabel,
  lastFrameLabel,
  promptPairSeparator,
  modelSelectLabel,
  modelOptions,
  mediaMentionImages,
  preferMediaMentions,
  referenceImages,
  requiresFirstLastFrame,
  selectedModelId,
  sendLabel,
  stopLabel,
  showVideoOptions,
  videoDurationLabel,
  videoDurationUnitLabel,
  videoShotLabel,
  videoShotLabels,
  onModelChange,
  onSubmit,
  onStop,
}: ChatWindowProps) {
  const [isEmpty, setIsEmpty] = useState(true);
  const [attachments, setAttachments] = useState<ChatWindowAttachment[]>([]);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [shotType, setShotType] = useState<(typeof VIDEO_SHOT_TYPES)[number] | null>(null);
  const [selectedReferenceImageIds, setSelectedReferenceImageIds] = useState<string[]>([]);
  const [mentionRange, setMentionRange] = useState<MentionRange | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionMenuPosition, setMentionMenuPosition] = useState<MentionMenuPosition>({
    left: 0,
    top: 28,
  });
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const editorShellRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadedInitialPromptSignatureRef = useRef<string | null>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const mentionOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mentionQueryRef = useRef("");
  const mentionSourceRef = useRef<ChatWindowAttachment[]>([]);
  const selectedReferenceImages = useMemo(
    () => referenceImages.filter((image) => selectedReferenceImageIds.includes(image.id)),
    [referenceImages, selectedReferenceImageIds],
  );
  const activeAttachments = requiresFirstLastFrame ? selectedReferenceImages : attachments;
  const mentionSource = useMemo(
    () => {
      if (!preferMediaMentions) return attachments;

      const seenIds = new Set<string>();
      return [...attachments, ...mediaMentionImages].filter((attachment) => {
        if (seenIds.has(attachment.id)) return false;
        seenIds.add(attachment.id);
        return true;
      });
    },
    [attachments, mediaMentionImages, preferMediaMentions],
  );
  const selectedModel = modelOptions.find((model) => model.id === selectedModelId);
  const selectedProvider = selectedModel
    ? resolveModelProvider(selectedModel.providerId, selectedModel.name)
    : undefined;
  const isCommandLoading = commandStatus === "loading";
  const mentionOptions = useMemo(
    () =>
      mentionSource
        .filter((attachment) =>
          attachment.label.toLowerCase().includes(mentionQuery.toLowerCase()),
        )
        .sort((first, second) => {
          const categoryOrder = getAttachmentCategoryOrder(first) - getAttachmentCategoryOrder(second);
          if (categoryOrder !== 0) return categoryOrder;

          return first.label.localeCompare(second.label);
        }),
    [mentionQuery, mentionSource],
  );
  const mentionMenuOpen = Boolean(mentionRange && mentionOptions.length > 0);
  const visibleMentionIndex = Math.min(activeMentionIndex, Math.max(mentionOptions.length - 1, 0));
  const updateMentionState = (currentEditor: NonNullable<ReturnType<typeof useEditor>>) => {
    const cursorPosition = currentEditor.state.selection.from;
    const textBeforeCursor = currentEditor.state.doc.textBetween(0, cursorPosition, "\n", "\n");
    const mentionMatch = /@([^\s@]*)$/.exec(textBeforeCursor);

    const currentMentionSource = mentionSourceRef.current;

    if (!mentionMatch || currentMentionSource.length === 0) {
      setMentionRange(null);
      setMentionQuery("");
      setActiveMentionIndex(0);
      return;
    }

    const query = mentionMatch[1] ?? "";
    const mentionFrom = cursorPosition - query.length - 1;
    const caretPosition = currentEditor.view.coordsAtPos(mentionFrom);
    const shellRect = editorShellRef.current?.getBoundingClientRect();

    if (shellRect) {
      setMentionMenuPosition({
        left: Math.max(0, caretPosition.left - shellRect.left),
        top: Math.max(0, caretPosition.bottom - shellRect.top + 4),
      });
    }

    setMentionRange({
      from: mentionFrom,
      to: cursorPosition,
    });
    if (query !== mentionQueryRef.current) setActiveMentionIndex(0);
    setMentionQuery(query);
  };
  const editor = useEditor({
    extensions: [
      ChatInlineTag,
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
          "h-36 max-h-36 w-full resize-none overflow-y-auto pr-1 outline-none text-sm leading-6 text-card-foreground caret-primary",
      },
    },
    immediatelyRender: false,
    onUpdate: ({ editor: updatedEditor }) => {
      setIsEmpty(updatedEditor.isEmpty);
      updateMentionState(updatedEditor);
    },
    onSelectionUpdate: ({ editor: updatedEditor }) => {
      updateMentionState(updatedEditor);
    },
  });
  const submitDisabled =
    isCommandLoading || !selectedModelId || !editor || (isEmpty && activeAttachments.length === 0);

  useLayoutEffect(() => {
    mentionQueryRef.current = mentionQuery;
    mentionSourceRef.current = mentionSource;
  }, [mentionQuery, mentionSource]);

  useEffect(() => {
    if (!editor || mentionSource.length === 0) return;

    updateMentionState(editor);
  }, [editor, mentionSource]);

  useEffect(() => {
    if (!editor) return;

    const mentionSignature = initialMentionTags.map((tag) => tag.id).join(",");
    const promptSignature = `${initialPromptKey}:${initialPrompt}:${mentionSignature}`;
    if (loadedInitialPromptSignatureRef.current === promptSignature) return;

    loadedInitialPromptSignatureRef.current = promptSignature;
    if (initialPrompt || initialMentionTags.length > 0) {
      editor.commands.setContent(createPromptContent(initialPrompt, initialMentionTags));
    } else {
      editor.commands.clearContent();
    }
    setAttachments([]);
    setSelectedReferenceImageIds([]);
    setMentionRange(null);
    setMentionQuery("");
    setActiveMentionIndex(0);
    setIsEmpty(initialPrompt.trim().length === 0 && initialMentionTags.length === 0);
  }, [editor, initialMentionTags, initialPrompt, initialPromptKey]);

  useEffect(() => {
    mentionListRef.current?.scrollTo({ top: 0 });
  }, [mentionQuery, mentionOptions.length]);

  useEffect(() => {
    if (!mentionMenuOpen) return;

    mentionOptionRefs.current[visibleMentionIndex]?.scrollIntoView({
      block: "nearest",
    });
  }, [mentionMenuOpen, visibleMentionIndex]);

  const handleSubmit = () => {
    if (isCommandLoading) {
      onStop?.();
      return;
    }

    if (submitDisabled || !editor) return;

    const textPrefix =
      requiresFirstLastFrame && activeAttachments.length > 0
        ? [
            activeAttachments[0]
              ? `${firstFrameLabel}${promptPairSeparator}${encodeAttachmentMention(activeAttachments[0])}`
              : "",
            activeAttachments[1]
              ? `${lastFrameLabel}${promptPairSeparator}${encodeAttachmentMention(activeAttachments[1])}`
              : "",
          ]
            .filter(Boolean)
            .join("\n")
        : "";
    const text = [textPrefix, serializePromptText(editor.getJSON())].filter(Boolean).join("\n");
    const submittedAttachments = mergeMentionAttachments({
      attachments: activeAttachments,
      mentionSource,
      text,
    });

    onSubmit?.({
      attachments: submittedAttachments,
      html: editor.getHTML(),
      text,
      videoOptions: showVideoOptions
        ? {
            ...(durationSeconds === null ? {} : { durationSeconds }),
            ...(shotType === null ? {} : { shotType }),
          }
        : undefined,
    });

    setMentionRange(null);
    setMentionQuery("");
    setActiveMentionIndex(0);
  };

  const handleFilesChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    event.target.value = "";
    if (requiresFirstLastFrame || !projectId || imageFiles.length === 0) return;

    try {
      const uploadedImages = await uploadProjectTempImages(projectId, imageFiles);
      setAttachments((currentAttachments) => [
        ...currentAttachments,
        ...uploadedImages.map((image, index) => ({
          ...image,
          label: attachmentFallbackLabel(currentAttachments.length + index + 1),
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

  const toggleReferenceImage = (imageId: string) => {
    setSelectedReferenceImageIds((currentIds) => {
      if (currentIds.includes(imageId)) return currentIds.filter((id) => id !== imageId);
      return [...currentIds, imageId].slice(-2);
    });
  };

  const insertInlineTag = (label: string, kind: "duration" | "mention" | "shot") => {
    if (!editor) return;

    const shouldPrefixSpace = editor.getText().trim().length > 0;
    const chain = editor.chain().focus();

    if (mentionRange) {
      chain.deleteRange(mentionRange);
    }

    chain
      .insertContent([
        ...(shouldPrefixSpace && !mentionRange
          ? [
              {
                type: "text",
                text: " ",
              },
            ]
          : []),
        {
          type: "chatInlineTag",
          attrs: { kind, label },
        },
        {
          type: "text",
          text: " ",
        },
      ])
      .run();
    setMentionRange(null);
    setMentionQuery("");
    setActiveMentionIndex(0);
  };

  const selectShotType = (value: string) => {
    if (!VIDEO_SHOT_TYPES.some((type) => type === value)) return;

    const nextShotType = value as (typeof VIDEO_SHOT_TYPES)[number];
    setShotType(nextShotType);
    insertInlineTag(`${videoShotLabel}${promptPairSeparator}${videoShotLabels[nextShotType]}`, "shot");
  };

  const selectDuration = (value: string) => {
    const numericValue = Number.parseInt(value, 10);
    if (Number.isNaN(numericValue)) return;

    setDurationSeconds(numericValue);
    insertInlineTag(
      `${videoDurationLabel}${promptPairSeparator}${numericValue}${videoDurationUnitLabel}`,
      "duration",
    );
  };

  const insertAttachmentReference = (attachment: ChatWindowAttachment) => {
    if (!editor || !mentionRange) return;

    editor
      .chain()
      .focus()
      .deleteRange(mentionRange)
      .insertContent([
        {
          type: "chatInlineTag",
          attrs: {
            kind: "mention",
            label: `@${attachment.label}`,
            mentionCategory: getAttachmentMentionCategory(attachment),
            mentionId: attachment.id,
            mentionUrl: attachment.url || "",
          },
        },
        {
          type: "text",
          text: " ",
        },
      ])
      .run();
    setMentionRange(null);
    setMentionQuery("");
    setActiveMentionIndex(0);
  };

  const handleMentionKeyDown = (event: React.KeyboardEvent) => {
    if (!mentionMenuOpen) {
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        if (isCommandLoading) return;

        handleSubmit();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveMentionIndex((currentIndex) =>
        Math.min(currentIndex + 1, mentionOptions.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveMentionIndex((currentIndex) => Math.max(currentIndex - 1, 0));
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const activeAttachment = mentionOptions[visibleMentionIndex];
      if (activeAttachment) insertAttachmentReference(activeAttachment);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setMentionRange(null);
      setMentionQuery("");
      setActiveMentionIndex(0);
    }
  };

  return (
    <section
      className={cn(
        "pointer-events-auto relative flex h-66 w-full max-w-160 flex-col rounded-2xl border border-border bg-card/95 px-4 py-3 text-card-foreground shadow-2xl backdrop-blur",
        className,
      )}
    >
        <div
          className="mb-3 flex min-h-10 max-w-full items-center gap-2 overflow-x-auto pb-1"
          aria-label={attachmentListLabel}
        >
          {requiresFirstLastFrame ? (
            referenceImages.map((image) => {
              const selectedIndex = selectedReferenceImageIds.indexOf(image.id);
              const isSelected = selectedIndex >= 0;

              return (
                <button
                  key={image.id}
                  type="button"
                  className={cn(
                    "relative size-10 shrink-0 overflow-hidden rounded-md border border-border bg-secondary transition-colors hover:border-primary",
                    isSelected ? "border-primary ring-2 ring-primary" : null,
                  )}
                  title={image.name}
                  aria-pressed={isSelected}
                  onClick={() => toggleReferenceImage(image.id)}
                >
                  <span
                    className="block size-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${image.url})` }}
                    aria-hidden="true"
                  />
                  {isSelected ? (
                    <span className="absolute inset-x-0 bottom-0 bg-primary/90 px-0.5 py-0.5 text-[9px] leading-none text-primary-foreground">
                      {selectedIndex === 0 ? firstFrameLabel : lastFrameLabel}
                    </span>
                  ) : null}
                </button>
              );
            })
          ) : (
            <>
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="group relative size-10 shrink-0 overflow-hidden rounded-md border border-border bg-secondary"
                  title={attachment.name}
                >
                  <div
                    className="size-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${attachment.url})` }}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    className="absolute right-0.5 top-0.5 hidden size-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm group-hover:flex"
                    aria-label={removeAttachmentLabel}
                    onClick={() => removeAttachment(attachment.id)}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                aria-label={addAttachmentLabel}
                disabled={!projectId}
                onClick={() => fileInputRef.current?.click()}
              >
                {attachments.length === 0 ? <ImagePlus className="size-4" /> : <Plus className="size-4" />}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                aria-label={addAttachmentLabel}
                onChange={handleFilesChange}
              />
            </>
          )}
        </div>

        <div ref={editorShellRef} className="relative z-20 h-36 max-h-36 overflow-visible">
          {isEmpty ? (
            <div className="pointer-events-none absolute left-0 top-0 text-sm leading-6 text-muted-foreground">
              {placeholder}
            </div>
          ) : null}
          <EditorContent
            editor={editor}
            className="h-36 max-h-36 overflow-hidden [&_.ProseMirror]:h-36 [&_.ProseMirror]:max-h-36 [&_.ProseMirror]:overflow-y-auto [&_.ProseMirror_p]:m-0"
            onKeyDownCapture={handleMentionKeyDown}
          />
          {mentionMenuOpen ? (
            <div
              ref={mentionListRef}
              className="absolute z-70 max-h-56 min-w-40 overflow-y-auto rounded-2xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
              style={{
                left: mentionMenuPosition.left,
                top: mentionMenuPosition.top,
              }}
            >
              {mentionOptions.map((attachment, index) => {
                const categoryKey = getAttachmentCategoryKey(attachment);
                const categoryLabel =
                  "fileName" in attachment ? attachmentListLabel : getAttachmentCategoryLabel(attachment);
                const previousAttachment = mentionOptions[index - 1];
                const previousCategoryKey = previousAttachment
                  ? getAttachmentCategoryKey(previousAttachment)
                  : "";
                const showCategoryTitle = Boolean(
                  categoryLabel && categoryKey !== previousCategoryKey,
                );

                return (
                  <div key={attachment.id}>
                    {showCategoryTitle ? (
                      <div className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground first:pt-1">
                        {categoryLabel}
                      </div>
                    ) : null}
                    <button
                      ref={(element) => {
                        mentionOptionRefs.current[index] = element;
                      }}
                      type="button"
                      data-active={index === visibleMentionIndex}
                      className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveMentionIndex(index)}
                      onClick={() => insertAttachmentReference(attachment)}
                    >
                      {attachment.url ? (
                        <span
                          className="size-5 shrink-0 rounded-sm bg-cover bg-center"
                          style={{ backgroundImage: `url(${attachment.url})` }}
                          aria-hidden="true"
                        />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate">{attachment.label}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
         
        </div>

        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-card-foreground">
            <div className="w-56 min-w-56 max-w-56 flex-none">
              <Select
                value={selectedModelId}
                onValueChange={onModelChange}
                disabled={modelOptions.length === 0}
              >
                <SelectTrigger
                  aria-label={modelSelectLabel}
                  className="px-2! h-7 w-full rounded-3xl border-transparent bg-secondary/80! py-0 text-secondary-foreground shadow-none hover:bg-secondary focus-visible:ring-0 dark:bg-secondary/80 dark:hover:bg-secondary [&>svg:last-child]:hidden"
                  style={{
                    maxWidth: "12rem",
                    minWidth: "12rem",
                    width: "12rem",
                  }}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    {selectedProvider ? (
                      <ModelProviderIcon provider={selectedProvider} className="size-4" />
                    ) : (
                      <Sparkles className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-left">
                      {selectedModel?.name ?? emptyModelLabel}
                    </span>
                  </span>
                </SelectTrigger>
                <SelectContent
                  align="start"
                  className="z-60 w-56 p-2"
                  position="popper"
                  side="bottom"
                  sideOffset={6}
                >
                  {modelOptions.map((model) => {
                    const provider = resolveModelProvider(model.providerId, model.name);

                    return (
                      <SelectItem key={model.id} value={model.id} className="cursor-pointer">
                        <span className="flex min-w-0 items-center gap-2">
                          {provider ? (
                            <ModelProviderIcon provider={provider} className="size-4" />
                          ) : (
                            <Sparkles className="size-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="min-w-0 truncate">{model.name}</span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
            {showVideoOptions ? (
              <>
                <Select
                  value={shotType ?? ""}
                  onValueChange={selectShotType}
                >
                  <SelectTrigger
                    aria-label={videoShotLabel}
                    className="h-7 w-20 rounded-3xl border-transparent bg-secondary/80! px-2 py-0 text-secondary-foreground shadow-none hover:bg-secondary focus-visible:ring-0 dark:bg-secondary/80 dark:hover:bg-secondary [&>svg:last-child]:hidden"
                  >
                    <Clapperboard className="size-4 shrink-0 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    align="end"
                    className="z-60 w-72 p-2"
                    position="popper"
                    side="bottom"
                    sideOffset={6}
                  >
                    <div className="grid grid-flow-col grid-rows-2 gap-1">
                      {VIDEO_SHOT_TYPES.map((type) => (
                        <SelectItem
                          key={type}
                          value={type}
                          className={cn(
                            "h-8 min-w-12 cursor-pointer justify-center rounded-md border border-border bg-secondary/80 px-2 py-0 text-center text-xs text-secondary-foreground focus:bg-accent focus:text-accent-foreground [&>span:first-child]:hidden",
                            shotType === type ? "border-primary bg-primary text-primary-foreground focus:bg-primary focus:text-primary-foreground" : null,
                          )}
                        >
                          {videoShotLabels[type]}
                        </SelectItem>
                      ))}
                    </div>
                  </SelectContent>
                </Select>
                <Select
                  value={durationSeconds?.toString() ?? ""}
                  onValueChange={selectDuration}
                >
                  <SelectTrigger
                    aria-label={videoDurationLabel}
                    className="h-7 w-16 rounded-3xl border-transparent bg-secondary/80! px-2 py-0 text-secondary-foreground shadow-none hover:bg-secondary focus-visible:ring-0 dark:bg-secondary/80 dark:hover:bg-secondary [&>svg:last-child]:hidden"
                  >
                    <Timer className="size-4 shrink-0 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    align="end"
                    className="z-60 max-h-52 w-20 p-1"
                    position="popper"
                    side="bottom"
                    sideOffset={6}
                  >
                    {VIDEO_DURATION_OPTIONS.map((seconds) => (
                      <SelectItem key={seconds} value={seconds.toString()} className="cursor-pointer">
                        {seconds}{videoDurationUnitLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : null}
            <Button
              type="button"
              size="icon-sm"
              className="size-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              aria-label={isCommandLoading ? stopLabel : sendLabel}
              disabled={!isCommandLoading && submitDisabled}
              onClick={handleSubmit}
            >
              {isCommandLoading ? (
                <Square className="size-4 fill-current" />
              ) : (
                <ArrowUp className="size-5" />
              )}
            </Button>
          </div>
        </div>
      </section>
  );
}
