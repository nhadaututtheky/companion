/**
 * Workflow template types — multi-agent orchestration pipeline definitions.
 */

export interface WorkflowStep {
  role: string; // "planner" | "builder" | "verifier" | "reviewer" | custom
  label: string;
  promptTemplate: string; // Supports {{topic}}, {{previousOutput}}
  order: number;
  model?: string; // Optional model override per step
}

export type WorkflowCategory = "review" | "build" | "test" | "deploy" | "custom";

export interface WorkflowTemplate {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  category: WorkflowCategory;
  steps: WorkflowStep[];
  isBuiltIn: boolean;
  defaultCostCapUsd?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStepState {
  role: string;
  sessionId: string | null;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  output?: string;
  costUsd?: number;
}

export interface WorkflowState {
  templateId: string;
  templateName: string;
  currentStep: number;
  steps: WorkflowStepState[];
  topic: string;
  totalCostUsd: number;
  costCapUsd: number;
  startedAt: string;
  completedAt?: string;
}
