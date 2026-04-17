import type { Suggestion, SuggestionContext, SuggestionProvider } from "./types.js";

const TOP_N = 3;

export class SuggestionEngine {
  private providers = new Map<string, SuggestionProvider>();

  registerProvider(provider: SuggestionProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregisterProvider(id: string): void {
    this.providers.delete(id);
  }

  async suggest(ctx: SuggestionContext): Promise<Suggestion[]> {
    const results = await Promise.all(
      Array.from(this.providers.values()).map(async (provider) => {
        try {
          return await provider.suggest(ctx);
        } catch {
          // One failing provider must not break the others
          return [] as Suggestion[];
        }
      }),
    );

    const flat = results.flat();

    // Dedupe by "source:id"
    const seen = new Set<string>();
    const deduped: Suggestion[] = [];
    for (const s of flat) {
      const key = `${s.source}:${s.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(s);
      }
    }

    // Sort by score descending, return top N
    return deduped.sort((a, b) => b.score - a.score).slice(0, TOP_N);
  }
}

/** Singleton engine — providers register once at app startup */
export const suggestionEngine = new SuggestionEngine();
