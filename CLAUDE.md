# Companion

## Feature Registry

See `FEATURE_REGISTRY.md` — single source of truth for all ~100 features, key files, relationships, and domain boundaries. **Check before building** to avoid overlap or scattered logic.

---

## XLabs — Autonomous Agent Platform

This project is managed by XLabs. You have access to XLabs tools via the `xlabs-remote` MCP server.

### Before Writing Code (MUST)

Call these tools FIRST to understand context and avoid known issues:

1. `xlabs_get_project_context` — tech stack, conventions, danger zones, health score
   ```json
   { "slug": "companion" }
   ```
2. `xlabs_get_open_incidents` — known bugs to avoid
3. `xlabs_get_previous_feedback` — learn from past agent sessions
4. `xlabs_get_relevant_research` — research findings that may apply

### During Work

5. `xlabs_report_progress` — update dashboard (call at 25%, 50%, 75%, 100%)
   ```json
   { "task_id": "<id>", "percentage": 50, "status_text": "Implementing feature X" }
   ```
6. `xlabs_log_decision` — log significant architectural decisions
   ```json
   { "type": "prioritize", "subject": "Auth library", "chosen": "lucia-auth", "reasoning": "Better integration", "confidence": 0.8 }
   ```

### After Completing Work

7. `xlabs_submit_feedback` — report blockers, suggestions, bugs
   ```json
   { "project_slug": "companion", "type": "suggestion", "content": "Description", "severity": "info" }
   ```
8. `xlabs_create_task` — create follow-up tasks for out-of-scope work

### Fleet Awareness

9. `xlabs_get_fleet_overview` — all projects health + active tasks
10. `xlabs_get_task_history` — recent completed tasks with summaries

### Rules

- **Always check context first** before writing code
- **Report progress** at milestones
- **Log decisions** for non-trivial architectural choices
- **Submit feedback** at end of session with blockers/suggestions found

