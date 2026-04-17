"use client";

import { useRef } from "react";
import { UploadSimple, X } from "@phosphor-icons/react";
import type { ThemeColors, ThemeDefinition } from "@companion/shared";
import { toast } from "sonner";

interface AddThemeModalProps {
  onClose: () => void;
  onImport: (theme: ThemeDefinition) => void;
}

function parseVscodeTheme(json: Record<string, unknown>): ThemeColors | null {
  const colors = json.colors as Record<string, string> | undefined;
  if (!colors) return null;

  return {
    bgBase: colors["editor.background"] ?? "#1e1e1e",
    bgCard: colors["sideBar.background"] ?? colors["editor.background"] ?? "#252526",
    bgElevated: colors["editorWidget.background"] ?? "#2d2d2d",
    bgSidebar: colors["sideBar.background"] ?? "#252526",
    bgHover: colors["list.hoverBackground"] ?? "#2a2d2e",
    textPrimary: colors["editor.foreground"] ?? "#d4d4d4",
    textSecondary: colors["descriptionForeground"] ?? "#cccccc",
    textMuted: colors["editorLineNumber.foreground"] ?? "#858585",
    border: colors["panel.border"] ?? colors["editorGroup.border"] ?? "#404040",
    borderStrong: colors["contrastBorder"] ?? "#505050",
    accent: colors["focusBorder"] ?? colors["button.background"] ?? "#007acc",
    success: colors["terminal.ansiGreen"] ?? "#4ec9b0",
    danger: colors["errorForeground"] ?? colors["terminal.ansiRed"] ?? "#f44747",
    warning: colors["editorWarning.foreground"] ?? colors["terminal.ansiYellow"] ?? "#cca700",
  };
}

export function AddThemeModal({ onClose, onImport }: AddThemeModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const colors = parseVscodeTheme(json);
      if (!colors) {
        toast.error("Could not parse VS Code theme — missing 'colors' key");
        return;
      }
      const name = (json.name as string) ?? file.name.replace(/\.json$/, "");
      const id = `custom-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
      onImport({
        id,
        name,
        author: "VS Code Import",
        light: colors,
        dark: colors,
      });
      toast.success(`Imported "${name}"`);
      onClose();
    } catch {
      toast.error("Failed to parse theme file");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "var(--overlay-light)" }}
      onClick={onClose}
    >
      <div
        className="bg-bg-card flex w-full max-w-md flex-col gap-4 rounded-2xl p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ fontFamily: "Outfit, sans-serif" }}>
            Add Custom Theme
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-text-secondary text-xs leading-relaxed">
          Upload a VS Code theme JSON file. The theme&apos;s <code>colors</code> key maps to
          Companion&apos;s CSS variables for both light and dark modes.
        </p>

        <label className="text-text-primary bg-bg-elevated hover:bg-[var(--color-bg-hover)] flex cursor-pointer items-center justify-center gap-2 rounded-xl p-4 text-sm font-semibold transition-colors">
          <UploadSimple size={18} weight="bold" />
          Choose VS Code Theme (.json)
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            onChange={handleFile}
            style={{ display: "none" }}
          />
        </label>

        <button
          type="button"
          onClick={onClose}
          className="text-text-secondary bg-bg-elevated border-border cursor-pointer rounded-xl border py-2 text-sm font-semibold"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
