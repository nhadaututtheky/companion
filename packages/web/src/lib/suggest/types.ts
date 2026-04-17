export interface SuggestionAction {
  type: "insert-text" | "set-model" | "invoke-command";
  payload: unknown;
}

export interface Suggestion {
  /** Stable per suggestion ("skill:ship", "agent:planner") */
  id: string;
  /** Provider id ("skills", "agents", "mcp") */
  source: string;
  /** Displayed text */
  label: string;
  /** Tooltip / expanded view */
  description?: string;
  /** 0-1, higher = more confident */
  score: number;
  action: SuggestionAction;
  /** Phosphor icon name (optional) */
  icon?: string;
}

export interface SuggestionContext {
  prompt: string;
  cursorPosition: number;
  // Future: session info, model, project
}

export interface SuggestionProvider {
  id: string;
  suggest(ctx: SuggestionContext): Promise<Suggestion[]> | Suggestion[];
}
