/**
 * Brain system prompts for multi-brain workspace orchestration.
 * Injected as identityPrompt when a session is designated as "coordinator".
 */

export const BRAIN_COORDINATOR_PROMPT = `You are the Brain — a task orchestrator and coordinator.

## Your Role
You analyze user requests, break them into specialist tasks, and delegate to agent sessions.
You do NOT write code or do the work yourself — you coordinate.

## Available Commands
- \`/spawn <name> --role <specialist|researcher|reviewer> --model <model> --prompt "<task>"\` — Create a new agent session
- \`@<agent-shortId> <message>\` — Send a task or message to an agent
- \`/status\` — Check all agent statuses

## Workflow
1. **Analyze** — understand the user's request fully before spawning agents
2. **Plan** — decide what specialists are needed and what each should do
3. **Spawn** — create agents with clear, focused tasks. Each agent should have ONE clear responsibility
4. **Monitor** — check progress, answer agent questions, unblock them
5. **Synthesize** — when all agents complete, combine their outputs into a coherent response

## Model Selection Guide
- **Opus** — architecture decisions, complex reasoning, security review
- **Sonnet** — most coding tasks, implementation, refactoring (best cost/quality)
- **Haiku** — simple lookups, verification, formatting, quick checks

## Rules
1. Never do the work yourself — always delegate to specialist agents
2. Give each agent a focused, specific task with clear acceptance criteria
3. Use the cheapest effective model for each task
4. Wait for agent completion signals before synthesizing
5. If an agent errors, assess whether to re-spawn or adjust the task
6. Keep the user informed of progress at key milestones`;

export const WORKSPACE_TEMPLATES = [
  {
    id: "full-stack",
    name: "Full-Stack Development",
    icon: "🏗️",
    description: "Backend + Frontend + Testing team",
    agents: [
      {
        name: "Backend Engineer",
        role: "specialist" as const,
        model: "claude-sonnet-4-6",
        promptTemplate: "Implement the backend: {task}",
      },
      {
        name: "Frontend Dev",
        role: "specialist" as const,
        model: "claude-sonnet-4-6",
        promptTemplate: "Build the frontend UI: {task}",
      },
      {
        name: "QA Tester",
        role: "reviewer" as const,
        model: "claude-haiku-4-5",
        promptTemplate: "Write tests and verify: {task}",
      },
    ],
  },
  {
    id: "code-review",
    name: "Code Review Team",
    icon: "🔍",
    description: "Security + Performance + Style reviewers",
    agents: [
      {
        name: "Security Reviewer",
        role: "reviewer" as const,
        model: "claude-opus-4-6",
        promptTemplate: "Security audit: {task}",
      },
      {
        name: "Performance Reviewer",
        role: "reviewer" as const,
        model: "claude-sonnet-4-6",
        promptTemplate: "Performance review: {task}",
      },
      {
        name: "Style Reviewer",
        role: "reviewer" as const,
        model: "claude-haiku-4-5",
        promptTemplate: "Code style and best practices review: {task}",
      },
    ],
  },
  {
    id: "research",
    name: "Research Team",
    icon: "📚",
    description: "Researcher + Fact-checker",
    agents: [
      {
        name: "Researcher",
        role: "researcher" as const,
        model: "claude-opus-4-6",
        promptTemplate: "Research thoroughly: {task}",
      },
      {
        name: "Fact Checker",
        role: "reviewer" as const,
        model: "claude-sonnet-4-6",
        promptTemplate: "Verify findings and check for errors: {task}",
      },
    ],
  },
  {
    id: "refactor",
    name: "Refactoring Team",
    icon: "♻️",
    description: "Analyst + Implementer + Verifier",
    agents: [
      {
        name: "Analyst",
        role: "researcher" as const,
        model: "claude-opus-4-6",
        promptTemplate: "Analyze code and plan refactoring: {task}",
      },
      {
        name: "Implementer",
        role: "specialist" as const,
        model: "claude-sonnet-4-6",
        promptTemplate: "Execute the refactoring plan: {task}",
      },
      {
        name: "Verifier",
        role: "reviewer" as const,
        model: "claude-haiku-4-5",
        promptTemplate: "Verify refactoring didn't break anything: {task}",
      },
    ],
  },
] as const;

export type WorkspaceTemplate = (typeof WORKSPACE_TEMPLATES)[number];
export type WorkspaceTemplateId = WorkspaceTemplate["id"];
