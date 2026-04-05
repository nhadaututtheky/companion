# Feature: Expert Modes (Persona Engine)

## Overview
Transform shallow "Templates" into deep "Expert Modes" — personas that change HOW Claude thinks, not just what it does. Each persona has mental models, decision frameworks, red flags, communication style, and blind spots. Integrates with Debate Engine for multi-persona panels.

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Foundation | ✅ Done | plan-expert-modes-phase1.md | Types, built-in personas, avatar component, UI rename |
| 2 | Session Integration | ✅ Done | plan-expert-modes-phase2.md | Wire personas into session creation + mid-session switch |
| 3 | Debate Integration | ✅ Done | plan-expert-modes-phase3.md | Persona × Model matrix in debate engine |
| 4 | Custom Personas | ✅ Done | plan-expert-modes-phase4.md | User-created personas with guided builder |

## Key Decisions
- Rename "Templates" → "Expert Modes" across UI
- Built-in personas are read-only, shipped with app
- Custom personas extend the same schema
- Avatars are SVG-based stylized portraits (no real photos)
- Personas compose with debate engine: each agent slot = model + persona
