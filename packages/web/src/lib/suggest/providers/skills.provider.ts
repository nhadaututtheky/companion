import type { Suggestion, SuggestionContext, SuggestionProvider } from "../types";
import { matchKeywords } from "../intent";
import { useRegistryStore } from "../registry-store";

export const skillsProvider: SuggestionProvider = {
  id: "skills",

  suggest(ctx: SuggestionContext): Suggestion[] {
    const skills = useRegistryStore.getState().skills;
    if (skills.length === 0) return [];

    const suggestions: Suggestion[] = [];

    for (const skill of skills) {
      const triggers: string[] = skill.suggestTriggers ?? [skill.name];
      const { matched, keyword } = matchKeywords(ctx.prompt, triggers);
      if (!matched || !keyword) continue;

      // Word-boundary match → 0.8, substring-only partial → 0.5
      // e.g. "ship this" → keyword "ship" matches as whole word → 0.8
      // e.g. "workshop" → keyword "shop" is substring but not whole word → 0.5
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const wordBoundary = new RegExp(`\\b${escapedKeyword}\\b`, "i");
      const isExact = wordBoundary.test(ctx.prompt);
      const score = isExact ? 0.8 : 0.5;

      suggestions.push({
        id: skill.name,
        source: "skills",
        label: `/${skill.name}`,
        description: skill.description,
        score,
        action: {
          type: "insert-text",
          payload: `/${skill.name} `,
        },
        icon: "Sparkle",
      });
    }

    return suggestions;
  },
};
