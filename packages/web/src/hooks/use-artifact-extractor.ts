import { useEffect, useRef } from "react";
import { usePreviewStore, type PreviewArtifact } from "@/lib/stores/preview-store";
import type { Message } from "@/components/session/message-feed";

// Non-global regexes for boolean detection (no lastIndex issues)
const SVG_TEST = /<svg[\s>]/i;
const HTML_DOC_TEST = /<!doctype\s+html|<html[\s>]/i;
const BASE64_IMAGE_TEST = /data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/i;

/** Check if a tool result looks like visual output (HTML/SVG/image) */
function isVisualContent(content: string): "html" | "svg" | "image" | null {
  if (BASE64_IMAGE_TEST.test(content)) return "image";
  if (SVG_TEST.test(content)) return "svg";
  if (HTML_DOC_TEST.test(content)) return "html";
  return null;
}

function extractFromToolResults(msg: Message): PreviewArtifact[] {
  if (!msg.toolResultBlocks?.length) return [];

  const found: PreviewArtifact[] = [];
  let idx = 0;

  for (const result of msg.toolResultBlocks) {
    if (result.isError || !result.content) continue;

    const type = isVisualContent(result.content);
    if (!type) continue;

    // Find the tool name from toolUseBlocks for better labeling
    const tool = msg.toolUseBlocks?.find((t) => t.id === result.toolUseId);
    const toolName = tool?.name ?? "Tool";

    if (type === "image") {
      // Fresh global regex per call to extract all base64 images
      const imageRe = /data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+/g;
      let match: RegExpExecArray | null;
      while ((match = imageRe.exec(result.content)) !== null) {
        found.push({
          id: `${msg.id}-tr-${idx++}`,
          type: "image",
          content: match[0],
          label: `${toolName} — Screenshot`,
          timestamp: msg.timestamp,
        });
      }
    } else {
      found.push({
        id: `${msg.id}-tr-${idx++}`,
        type,
        content: result.content,
        label: `${toolName} — ${type.toUpperCase()} Output`,
        timestamp: msg.timestamp,
      });
    }
  }

  return found;
}

/**
 * Watches messages for visual tool outputs (HTML/SVG/images from MCP tools)
 * and adds them to the preview store automatically.
 */
export function useArtifactExtractor(messages: Message[]) {
  const addArtifact = usePreviewStore((s) => s.addArtifact);
  const processedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const msg of messages) {
      if (msg.isStreaming || processedRef.current.has(msg.id)) continue;
      if (msg.role !== "assistant") continue;

      const artifacts = extractFromToolResults(msg);
      for (const artifact of artifacts) {
        addArtifact(artifact);
      }

      processedRef.current.add(msg.id);
    }
  }, [messages, addArtifact]);
}
