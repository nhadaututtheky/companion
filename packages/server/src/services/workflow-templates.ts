/**
 * Workflow Templates — seed built-in templates and provide CRUD operations.
 */

import { getDb } from "../db/client.js";
import { workflowTemplates } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { WorkflowStep } from "@companion/shared";

interface BuiltInTemplate {
  name: string;
  slug: string;
  description: string;
  icon: string;
  category: string;
  steps: WorkflowStep[];
  defaultCostCapUsd: number;
}

const BUILT_IN: BuiltInTemplate[] = [
  // ── REVIEW ─────────────────────────────────────────────────────────────
  {
    name: "Plan Review",
    slug: "plan-review",
    description: "Planner proposes an approach, Reviewer critiques and suggests improvements.",
    icon: "📋",
    category: "review",
    defaultCostCapUsd: 0.5,
    steps: [
      {
        role: "planner",
        label: "Planner",
        order: 1,
        promptTemplate:
          "You are the Planner. Analyze the following topic and propose a detailed implementation plan with steps, risks, and trade-offs.\n\nTopic: {{topic}}",
      },
      {
        role: "reviewer",
        label: "Reviewer",
        order: 2,
        promptTemplate:
          "You are the Reviewer. Critically evaluate the plan below. Identify gaps, risks, and suggest concrete improvements.\n\nTopic: {{topic}}\n\nPlan from Planner:\n{{previousOutput}}",
      },
    ],
  },
  {
    name: "Code Review",
    slug: "code-review",
    description: "Author explains code changes, Reviewer audits for issues and suggests fixes.",
    icon: "🔍",
    category: "review",
    defaultCostCapUsd: 0.5,
    steps: [
      {
        role: "author",
        label: "Author",
        order: 1,
        promptTemplate:
          "You are the Author. Explain the code changes, design decisions, and any areas of concern.\n\nContext: {{topic}}",
      },
      {
        role: "reviewer",
        label: "Reviewer",
        order: 2,
        promptTemplate:
          "You are the Code Reviewer. Review the changes described below for bugs, security issues, performance problems, and code quality. Provide actionable feedback.\n\nContext: {{topic}}\n\nAuthor's explanation:\n{{previousOutput}}",
      },
    ],
  },
  {
    name: "PR Review",
    slug: "pr-review",
    description: "Summarize a PR, then audit with a structured checklist.",
    icon: "📝",
    category: "review",
    defaultCostCapUsd: 0.5,
    steps: [
      {
        role: "author",
        label: "PR Author",
        order: 1,
        promptTemplate:
          "You are the PR Author. Summarize the PR: what changed, why, and what to watch out for.\n\nPR: {{topic}}",
      },
      {
        role: "auditor",
        label: "Auditor",
        order: 2,
        promptTemplate:
          "You are the PR Auditor. Using the checklist below, audit the PR:\n- [ ] Breaking changes identified?\n- [ ] Tests added/updated?\n- [ ] Security implications?\n- [ ] Performance impact?\n- [ ] Documentation updated?\n\nPR: {{topic}}\n\nAuthor's summary:\n{{previousOutput}}",
      },
    ],
  },
  // ── BUILD ──────────────────────────────────────────────────────────────
  {
    name: "Fix Bug",
    slug: "fix-bug",
    description: "Diagnoser analyzes root cause, Fixer implements the solution.",
    icon: "🐛",
    category: "build",
    defaultCostCapUsd: 1.0,
    steps: [
      {
        role: "diagnoser",
        label: "Diagnoser",
        order: 1,
        promptTemplate:
          "You are the Diagnoser. Analyze the bug below. Identify the root cause, affected code paths, and propose a fix strategy.\n\nBug: {{topic}}",
      },
      {
        role: "fixer",
        label: "Fixer",
        order: 2,
        promptTemplate:
          "You are the Fixer. Implement the fix based on the diagnosis below. Write the code changes and verify they resolve the issue.\n\nBug: {{topic}}\n\nDiagnosis:\n{{previousOutput}}",
      },
    ],
  },
  {
    name: "Implement Feature",
    slug: "implement-feature",
    description: "Planner designs the approach, Builder implements it.",
    icon: "🚀",
    category: "build",
    defaultCostCapUsd: 1.5,
    steps: [
      {
        role: "planner",
        label: "Planner",
        order: 1,
        promptTemplate:
          "You are the Planner. Design an implementation approach for the feature below. Include file structure, key interfaces, and implementation order.\n\nFeature: {{topic}}",
      },
      {
        role: "builder",
        label: "Builder",
        order: 2,
        promptTemplate:
          "You are the Builder. Implement the feature following the plan below. Write clean, tested code.\n\nFeature: {{topic}}\n\nImplementation plan:\n{{previousOutput}}",
      },
    ],
  },
  {
    name: "Multi-Agent Build",
    slug: "multi-agent-build",
    description: "Planner designs, Builder implements, Verifier tests and validates.",
    icon: "🏗️",
    category: "build",
    defaultCostCapUsd: 2.0,
    steps: [
      {
        role: "planner",
        label: "Planner",
        order: 1,
        promptTemplate:
          "You are the Planner. Design a comprehensive implementation plan for:\n\n{{topic}}\n\nInclude: architecture, file structure, interfaces, test strategy, and risk areas.",
      },
      {
        role: "builder",
        label: "Builder",
        order: 2,
        promptTemplate:
          "You are the Builder. Implement the feature following the plan. Write production-quality code with proper error handling.\n\nFeature: {{topic}}\n\nPlan:\n{{previousOutput}}",
      },
      {
        role: "verifier",
        label: "Verifier",
        order: 3,
        promptTemplate:
          "You are the Verifier. Review the implementation, run tests, and verify correctness. Report any issues found.\n\nFeature: {{topic}}\n\nBuilder's output:\n{{previousOutput}}",
      },
    ],
  },
  // ── TEST ───────────────────────────────────────────────────────────────
  {
    name: "Write Tests",
    slug: "write-tests",
    description: "Analyzer identifies test gaps, Writer creates a comprehensive test suite.",
    icon: "🧪",
    category: "test",
    defaultCostCapUsd: 0.75,
    steps: [
      {
        role: "analyzer",
        label: "Analyzer",
        order: 1,
        promptTemplate:
          "You are the Test Analyzer. Examine the code/feature below and identify all test gaps — missing unit tests, edge cases, integration scenarios.\n\nTarget: {{topic}}",
      },
      {
        role: "writer",
        label: "Test Writer",
        order: 2,
        promptTemplate:
          "You are the Test Writer. Write a comprehensive test suite covering all the gaps identified below.\n\nTarget: {{topic}}\n\nTest gaps identified:\n{{previousOutput}}",
      },
    ],
  },
  {
    name: "Review & Test",
    slug: "review-and-test",
    description: "Reviewer finds issues, Tester writes tests for the findings.",
    icon: "🔬",
    category: "test",
    defaultCostCapUsd: 0.75,
    steps: [
      {
        role: "reviewer",
        label: "Reviewer",
        order: 1,
        promptTemplate:
          "You are the Reviewer. Review the code below for bugs, edge cases, and potential issues.\n\nCode: {{topic}}",
      },
      {
        role: "tester",
        label: "Tester",
        order: 2,
        promptTemplate:
          "You are the Tester. Write tests that verify the issues found by the reviewer are properly handled.\n\nCode: {{topic}}\n\nReviewer's findings:\n{{previousOutput}}",
      },
    ],
  },
];

/** Seed built-in workflow templates on startup (idempotent). */
export function seedWorkflowTemplates(): void {
  const db = getDb();

  for (const tmpl of BUILT_IN) {
    const existing = db
      .select({ id: workflowTemplates.id })
      .from(workflowTemplates)
      .where(eq(workflowTemplates.slug, tmpl.slug))
      .get();

    if (existing) {
      // Update existing built-in template (may have new prompts)
      db.update(workflowTemplates)
        .set({
          name: tmpl.name,
          description: tmpl.description,
          icon: tmpl.icon,
          category: tmpl.category,
          steps: tmpl.steps,
          defaultCostCapUsd: tmpl.defaultCostCapUsd,
          isBuiltIn: true,
          updatedAt: new Date(),
        })
        .where(eq(workflowTemplates.id, existing.id))
        .run();
    } else {
      db.insert(workflowTemplates)
        .values({
          id: randomUUID(),
          name: tmpl.name,
          slug: tmpl.slug,
          description: tmpl.description,
          icon: tmpl.icon,
          category: tmpl.category,
          steps: tmpl.steps,
          isBuiltIn: true,
          defaultCostCapUsd: tmpl.defaultCostCapUsd,
        })
        .run();
    }
  }
}

/** List all workflow templates, optionally filtered by category. */
export function listWorkflowTemplates(category?: string) {
  const db = getDb();
  const query = db.select().from(workflowTemplates);
  const rows = category ? query.where(eq(workflowTemplates.category, category)).all() : query.all();

  return rows.map(formatTemplate);
}

/** Get a single template by ID. */
export function getWorkflowTemplate(id: string) {
  const db = getDb();
  const row = db.select().from(workflowTemplates).where(eq(workflowTemplates.id, id)).get();
  return row ? formatTemplate(row) : null;
}

/** Create a custom workflow template. */
export function createWorkflowTemplate(data: {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  category?: string;
  steps: WorkflowStep[];
  defaultCostCapUsd?: number;
}) {
  const db = getDb();
  const id = randomUUID();
  db.insert(workflowTemplates)
    .values({
      id,
      name: data.name,
      slug: data.slug,
      description: data.description ?? "",
      icon: data.icon ?? "🔄",
      category: data.category ?? "custom",
      steps: data.steps,
      isBuiltIn: false,
      defaultCostCapUsd: data.defaultCostCapUsd ?? 1.0,
    })
    .run();
  return id;
}

/** Update a custom template (built-in cannot be modified). */
export function updateWorkflowTemplate(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    icon: string;
    category: string;
    steps: WorkflowStep[];
    defaultCostCapUsd: number;
  }>,
): boolean {
  const db = getDb();
  const existing = db
    .select({ isBuiltIn: workflowTemplates.isBuiltIn })
    .from(workflowTemplates)
    .where(eq(workflowTemplates.id, id))
    .get();

  if (!existing) return false;
  if (existing.isBuiltIn) return false;

  db.update(workflowTemplates)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(workflowTemplates.id, id))
    .run();
  return true;
}

/** Delete a custom template (built-in cannot be deleted). */
export function deleteWorkflowTemplate(id: string): boolean {
  const db = getDb();
  const existing = db
    .select({ isBuiltIn: workflowTemplates.isBuiltIn })
    .from(workflowTemplates)
    .where(eq(workflowTemplates.id, id))
    .get();

  if (!existing || existing.isBuiltIn) return false;

  db.delete(workflowTemplates).where(eq(workflowTemplates.id, id)).run();
  return true;
}

function formatTemplate(row: typeof workflowTemplates.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    category: row.category,
    steps: row.steps,
    isBuiltIn: row.isBuiltIn,
    defaultCostCapUsd: row.defaultCostCapUsd,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date(row.createdAt as number).toISOString(),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : new Date(row.updatedAt as number).toISOString(),
  };
}
