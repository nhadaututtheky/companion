/**
 * Task Classifier — Analyzes user messages to determine the best orchestration
 * pattern (single session, workflow, debate, or mention routing).
 *
 * Uses Haiku for AI classification with regex fallback when AI is unavailable.
 */

import { createLogger } from "../logger.js";
import { callAI, isAIConfigured } from "./ai-client.js";
import type {
  TaskClassification,
  OrchestrationPattern,
  TaskComplexity,
  DebateFormat,
  StepSuggestion,
} from "@companion/shared/types";

const log = createLogger("task-classifier");

// ── Regex-based fallback rules ──────────────────────────────────────────────

interface ClassifierRule {
  pattern: RegExp;
  intent: string;
  orchestration: OrchestrationPattern;
  complexity: TaskComplexity;
  template?: string;
  debateFormat?: DebateFormat;
  model?: string;
  steps?: StepSuggestion[];
  confidence: number;
}

const MENTION_PATTERN = /@([a-z][a-z0-9-]*)/;

const FILE_PATTERN = /(?:^|\s)([\w.-]+(?:\/[\w.-]+)+\.\w+)/;

const RULES: ClassifierRule[] = [
  // Debate patterns (highest priority — explicit intent)
  {
    pattern: /\b(?:debate|compare|pros?\s*(?:and|&|vs)\s*cons?|versus|vs\.?)\b/i,
    intent: "compare_options",
    orchestration: "debate",
    complexity: "medium",
    debateFormat: "pro_con",
    confidence: 0.85,
  },
  {
    pattern: /\b(?:red\s*team|attack|adversarial|challenge|poke\s*holes?)\b/i,
    intent: "red_team",
    orchestration: "debate",
    complexity: "medium",
    debateFormat: "red_team",
    confidence: 0.8,
  },
  {
    pattern: /\b(?:brainstorm|ideate|ideas?\s+for|creative|explore\s+options?)\b/i,
    intent: "brainstorm",
    orchestration: "debate",
    complexity: "medium",
    debateFormat: "brainstorm",
    confidence: 0.75,
  },

  // Multi-step workflow patterns
  {
    pattern: /\b(?:review|check|audit)\b.*\b(?:then|rồi|xong|after\s+that|and\s+(?:then\s+)?fix)\b/i,
    intent: "review_then_fix",
    orchestration: "workflow",
    complexity: "medium",
    template: "review-and-test",
    confidence: 0.85,
    steps: [
      { role: "reviewer", model: "sonnet", task: "Review and identify issues" },
      { role: "fixer", model: "sonnet", task: "Fix issues found in review" },
    ],
  },
  {
    pattern: /\b(?:implement|build|create|add)\b.*\b(?:feature|module|component|page|endpoint)\b/i,
    intent: "implement_feature",
    orchestration: "workflow",
    complexity: "complex",
    template: "implement-feature",
    confidence: 0.7,
  },
  {
    pattern: /\b(?:write|add|create)\s+tests?\b/i,
    intent: "write_tests",
    orchestration: "workflow",
    complexity: "medium",
    template: "write-tests",
    confidence: 0.75,
  },

  // Review patterns (single-step workflow)
  {
    pattern: /\b(?:review|audit|check)\s+(?:this\s+)?(?:PR|pull\s*request|MR|merge\s*request)\b/i,
    intent: "review_pr",
    orchestration: "workflow",
    complexity: "medium",
    template: "pr-review",
    confidence: 0.8,
  },
  {
    pattern: /\b(?:code\s*review|review\s+(?:the\s+)?code)\b/i,
    intent: "code_review",
    orchestration: "workflow",
    complexity: "medium",
    template: "code-review",
    confidence: 0.75,
  },

  // Single session — complex (needs strong model)
  {
    pattern: /\b(?:plan|architect|design|restructure|redesign)\b.*\b(?:architecture|system|infra|migration)\b/i,
    intent: "architecture",
    orchestration: "single",
    complexity: "complex",
    model: "opus",
    confidence: 0.7,
  },
  {
    pattern: /\b(?:refactor|restructure|reorganize|rewrite)\b/i,
    intent: "refactor",
    orchestration: "single",
    complexity: "complex",
    model: "sonnet",
    confidence: 0.65,
  },

  // Single session — medium
  {
    pattern: /\b(?:fix|debug|resolve|troubleshoot)\s+(?:the\s+)?(?:bug|error|issue|problem|crash)\b/i,
    intent: "fix_bug",
    orchestration: "single",
    complexity: "medium",
    model: "sonnet",
    confidence: 0.75,
  },
  {
    pattern: /\b(?:fix|sửa|update|change|modify|edit|thêm|thay)\b/i,
    intent: "modify_code",
    orchestration: "single",
    complexity: "medium",
    model: "sonnet",
    confidence: 0.6,
  },

  // Single session — simple (cheap model)
  {
    pattern: /\b(?:explain|what\s+is|what\s+does|how\s+does|giải\s+thích|là\s+gì)\b/i,
    intent: "explain",
    orchestration: "single",
    complexity: "simple",
    model: "haiku",
    confidence: 0.7,
  },
  {
    pattern: /\b(?:find|search|where\s+is|look\s+for|tìm)\b/i,
    intent: "search",
    orchestration: "single",
    complexity: "simple",
    model: "haiku",
    confidence: 0.65,
  },
];

// ── Regex classifier ────────────────────────────────────────────────────────

function extractFiles(message: string): string[] {
  const globalPattern = new RegExp(FILE_PATTERN.source, "g");
  const matches = [...message.matchAll(globalPattern)];
  return [...new Set(matches.map((m) => m[1]!.trim()))];
}

function hasMentions(message: string): boolean {
  // Exclude email-like patterns (word@mention)
  const emailStripped = message.replace(/\S+@/g, "  ");
  return MENTION_PATTERN.test(emailStripped);
}

export function classifyByRules(message: string): TaskClassification {
  // Mentions take absolute priority — pass through to mention router
  if (hasMentions(message)) {
    return {
      intent: "mention",
      pattern: "mention",
      complexity: "simple",
      relevantFiles: extractFiles(message),
      confidence: 0.95,
    };
  }

  const files = extractFiles(message);

  // Try rules in order (first match wins — rules are priority-ordered)
  for (const rule of RULES) {
    if (rule.pattern.test(message)) {
      return {
        intent: rule.intent,
        pattern: rule.orchestration,
        complexity: rule.complexity,
        suggestedTemplate: rule.template,
        suggestedDebateFormat: rule.debateFormat,
        steps: rule.steps,
        relevantFiles: files,
        confidence: rule.confidence,
        suggestedModel: rule.model,
      };
    }
  }

  // Default fallback: single session, medium complexity
  return {
    intent: "general",
    pattern: "single",
    complexity: "medium",
    relevantFiles: files,
    confidence: 0.4,
    suggestedModel: "sonnet",
  };
}

// ── AI classifier (Haiku) ───────────────────────────────────────────────────

const CLASSIFIER_SYSTEM_PROMPT = `You are a task classifier for an AI orchestration platform. Given a user message, determine the best execution pattern.

Available patterns:
- "single": One AI session handles the task
- "workflow": Sequential multi-step pipeline (planner→builder→verifier)
- "debate": Parallel multi-agent discussion (pros/cons, red team, brainstorm, review)
- "mention": Message contains @mentions to route to other sessions (ONLY if @ syntax present)

Available workflow templates: plan-review, code-review, pr-review, fix-bug, implement-feature, multi-agent-build, write-tests, review-and-test

Available debate formats: pro_con, red_team, review, brainstorm

Complexity levels:
- "simple": Explanation, search, quick question → use fast/cheap model
- "medium": Bug fix, single feature, code review → use standard model
- "complex": Architecture, multi-file refactor, system design → use strong model

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "intent": "<short_intent_label>",
  "pattern": "<single|workflow|debate|mention>",
  "complexity": "<simple|medium|complex>",
  "suggestedTemplate": "<template_slug or null>",
  "suggestedDebateFormat": "<format or null>",
  "relevantFiles": ["<extracted file paths>"],
  "confidence": <0.0-1.0>,
  "suggestedModel": "<haiku|sonnet|opus or null>"
}`;

const VALID_PATTERNS = new Set<OrchestrationPattern>(["single", "workflow", "debate", "mention"]);
const VALID_COMPLEXITIES = new Set<TaskComplexity>(["simple", "medium", "complex"]);
const VALID_DEBATE_FORMATS = new Set<DebateFormat>(["pro_con", "red_team", "review", "brainstorm"]);
const VALID_MODELS = new Set(["haiku", "sonnet", "opus"]);

async function classifyByAI(message: string): Promise<TaskClassification | null> {
  try {
    const result = await callAI({
      systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: message }],
      tier: "fast",
      maxTokens: 256,
    });

    const parsed = JSON.parse(result.text);

    // Validate required fields and enum values
    if (typeof parsed.confidence !== "number") {
      log.warn("AI classifier returned invalid confidence", { parsed });
      return null;
    }
    if (!VALID_PATTERNS.has(parsed.pattern)) {
      log.warn("AI classifier returned invalid pattern", { pattern: parsed.pattern });
      return null;
    }
    if (!VALID_COMPLEXITIES.has(parsed.complexity)) {
      log.warn("AI classifier returned invalid complexity", { complexity: parsed.complexity });
      return null;
    }

    const debateFormat = parsed.suggestedDebateFormat;
    const model = parsed.suggestedModel;

    return {
      intent: parsed.intent ?? "unknown",
      pattern: parsed.pattern,
      complexity: parsed.complexity,
      suggestedTemplate: parsed.suggestedTemplate ?? undefined,
      suggestedDebateFormat: debateFormat && VALID_DEBATE_FORMATS.has(debateFormat) ? debateFormat : undefined,
      relevantFiles: Array.isArray(parsed.relevantFiles) ? parsed.relevantFiles : [],
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
      suggestedModel: model && VALID_MODELS.has(model) ? model : undefined,
    };
  } catch (err) {
    log.warn("AI classification failed, falling back to rules", { error: String(err) });
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface ClassifierContext {
  /** Project name for scoping */
  projectSlug?: string;
  /** Active session shortIds (for mention detection) */
  activeShortIds?: string[];
}

/**
 * Classify a user message into an orchestration pattern.
 *
 * Strategy: try AI (Haiku) first, fall back to regex rules.
 * Mentions are detected instantly without AI.
 */
export async function classifyTask(
  message: string,
  _context?: ClassifierContext,
): Promise<TaskClassification> {
  // Fast path: mentions don't need AI
  if (hasMentions(message)) {
    return classifyByRules(message);
  }

  // Try AI classification if configured
  if (isAIConfigured()) {
    const aiResult = await classifyByAI(message);
    if (aiResult) {
      log.debug("AI classified task", {
        intent: aiResult.intent,
        pattern: aiResult.pattern,
        confidence: aiResult.confidence,
      });
      return aiResult;
    }
  }

  // Fallback to regex rules
  const ruleResult = classifyByRules(message);
  log.debug("Rule-based classification", {
    intent: ruleResult.intent,
    pattern: ruleResult.pattern,
    confidence: ruleResult.confidence,
  });
  return ruleResult;
}
