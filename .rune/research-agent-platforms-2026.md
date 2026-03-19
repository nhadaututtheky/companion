# Research: AI Agent Platforms & Multi-Agent Orchestration
> Compiled: 2026-03-18 | Model: claude-sonnet-4-6

---

## 1. Existing Agent Platforms — What They Get Right and Wrong

### LangGraph (LangChain)

**What it gets right:**
- Graph-based state machines give deterministic, auditable execution paths
- LangGraph Studio: first dedicated "agent IDE" — visual node graph, step-through debugging, fork-and-edit threads, hot code reloading, state manipulation mid-run
- Reached v1.0 in late 2025; now the default runtime for all LangChain agents
- Best for: financial compliance, supply chain, any workflow requiring explicit audit trails
- Strong human-in-the-loop with `interrupt()` — pauses mid-graph, resumes with full context

**What it gets wrong:**
- Steep learning curve; requires thinking in explicit states and transitions upfront
- State schema must be fully defined at design time — becomes rigid as requirements change
- Not suitable for non-technical users; primarily programmatic
- Overkill for simple linear workflows

**Agent-to-agent communication:** State-based message passing through directed graph edges. Each node reads/writes shared typed state.

**UI/UX pattern:** LangGraph Studio — visual graph editor + live state inspector. LangSmith provides production monitoring with waterfall trace views.

---

### CrewAI

**What it gets right:**
- Role-based model maps naturally to real business org structures (researcher, writer, analyst)
- Fastest time-to-prototype: hours not weeks
- 60%+ of Fortune 500 reportedly using it by late 2025
- Over 1.1 billion agent actions orchestrated in Q3 2025 alone
- CrewAI Agent Operations Platform (AOP): dashboards, governance, audit logs, role-based access — designed for non-technical oversight

**What it gets wrong:**
- "Logging is a huge pain" — normal print/log statements don't work inside Task; debugging concurrent conversations is hard
- Built on LangChain dependency; upstream changes cause breakage
- Designed for small agent teams (5–10), not 100+ agent swarms
- Error propagation: one agent's wrong assumption cascades silently to the next

**Agent-to-agent communication:** Natural language messaging routed by framework based on role definitions. Supports human-in-the-loop approval checkpoints between tasks.

**UI/UX pattern:** CrewAI Studio — drag-and-drop visual workflows for non-developers. AOP adds monitoring dashboards with execution traces.

---

### AutoGen (Microsoft)

**What it gets right:**
- Conversational paradigm excels at iterative loops (code gen → test → debug → repeat)
- Visible reasoning steps create maximum transparency for auditing
- Built-in Docker sandboxed code execution — safety by default
- Strong human-in-the-loop: humans can interject at any conversation turn
- .NET support + no-code Studio — broader team access

**What it gets wrong:**
- Non-deterministic by design — agents can enter unproductive loops without exit conditions
- "Many API calls" accumulate costs quickly; multi-turn conversations are expensive without caching
- Free-form output harder to parse downstream; requires extra validation logic
- Context window limits require periodic conversation summarization — loses detail

**Agent-to-agent communication:** Natural language turn-taking dialogue. Framework manages routing. Humans participate as equal "agents" in the conversation.

**UI/UX pattern:** Chat-transcript style — all reasoning visible as conversation. Human oversight via direct message injection, not dashboards.

---

### OpenAI Agents SDK (successor to Swarm)

**What it gets right:**
- Clean, minimal handoff abstraction: `transfer_to_<agent>` as a tool call
- Full conversation history passes to receiving agent (configurable via `input_filter`)
- `on_handoff` callback enables side effects (data fetching) the moment handoff triggers
- Input validation via typed schema on handoff tool parameters
- Production-ready as of March 2025; well-documented

**What it gets wrong:**
- Sequential handoffs only — no parallel workers, no shared inbox
- Guardrails apply only to first and last agent; middle agents unguarded
- No native scheduling, priority queues, or budget controls

**Agent-to-agent communication:** One-way sequential handoff. State = full conversation history. Receiving agent gets context and owns execution from that point.

**UI/UX pattern:** SDK + OpenAI dashboard traces. No dedicated visual IDE.

---

### Anthropic Claude Code Agent Teams (Swarm Mode, 2026)

**What it gets right:**
- Git Worktree Isolation: each agent works in a separate git worktree, preventing file conflicts; merges only when tests pass
- Context efficiency: single agent uses 80–90% context before reset; agent teams use ~40%
- TeammateTool with 13 operations for spawning and coordinating agents
- Four proven orchestration patterns: Leader, Swarm, Pipeline, Watchdog
- Native to Claude Code — no separate framework needed

**What it gets wrong:**
- Early-stage (released early 2026); production maturity unclear
- Primarily for coding workflows; less applicable to general business automation

---

### Framework Comparison Summary

| Dimension | LangGraph | CrewAI | AutoGen | OpenAI SDK |
|-----------|-----------|--------|---------|------------|
| Control | Deterministic | Semi-structured | Non-deterministic | Sequential |
| Learning curve | High | Low | Medium | Low |
| Debug quality | Excellent (Studio) | Poor (concurrent) | Good (visible reasoning) | Good (traces) |
| Scale | Medium | Small teams | Small-medium | Medium |
| Non-technical users | No | Yes (AOP) | Partial (Studio) | No |
| HITL maturity | Native + robust | Bolted-on | Native | Basic |

---

## 2. Agent Communication Protocols

### MCP (Model Context Protocol)

Introduced by Anthropic in November 2024. By March 2025, adopted by OpenAI, Google Gemini, Microsoft Copilot, Cursor, and VS Code.

**How it works:**
- Client-server architecture: AI app = MCP client; each external integration = MCP server
- Servers expose: tools (functions), resources (data), prompt templates
- Universal interface for file reading, function execution, contextual prompts
- Solves the N×M integration problem — one standard replaces custom connectors per tool

**2025 spec additions:** async operations, stateless Streamable HTTP transport, OAuth 2.1, `.well-known` server discovery, structured tool annotations (read-only vs. write).

**Scale:** 97M monthly SDK downloads, 10,000+ active servers as of late 2025.

**What it enables for agents:** An agent can discover and use any MCP-compatible tool without custom integration. Fleet management via MCP means controlling what agents *can do* through server capabilities, not by hardcoding permissions.

---

### A2A (Agent-to-Agent Protocol, Google → Linux Foundation)

Released April 2025; v0.3 released July 31, 2025 (added gRPC, signed security cards, extended Python SDK). Now managed by Linux Foundation with 150+ supporting organizations.

**How it works:**
- **Agent Cards**: JSON documents agents publish to advertise capabilities — like a service discovery manifest
- **Task lifecycle**: client agent creates task → remote agent executes → produces "artifacts" → task reaches terminal state
- **Communication**: HTTP + SSE + JSON-RPC; supports async long-running tasks via SSE streaming
- **Auth**: OAuth 2.1 parity with OpenAPI schemes
- **Parts system**: messages contain typed "parts" enabling content-type negotiation between agents

**Relationship with MCP:**
- MCP = agent ↔ tool (vertical: agent gets capabilities)
- A2A = agent ↔ agent (horizontal: agents coordinate with each other)
- They are designed to be complementary, not competing

**What's proven:** 50+ enterprise technology partners at launch (Salesforce, SAP, Atlassian, ServiceNow, etc.) signals real enterprise buy-in. The Linux Foundation stewardship signals long-term stability.

---

### OpenAI Handoff Pattern

- Handoff = tool call named `transfer_to_<agent>`
- Full conversation history transfers to receiving agent
- `input_filter` allows pruning/transforming history the receiver sees
- `on_handoff` callback fires immediately when handoff invoked (useful for prefetching)
- One-way: original agent exits; receiver owns execution completely
- Event-driven internally: handoff triggers `session.update` event with new instructions + tools

**Key constraint:** No parallel execution. Pure sequential chain. Good for triage workflows (router → specialist), bad for parallel data gathering.

---

### Event-Driven vs. Request-Response

| Model | Best For | Platforms |
|-------|----------|-----------|
| Request-response | Short, synchronous tasks; human-triggered | OpenAI SDK, CrewAI |
| Event-driven | Long-running, async, real-world integrations | Temporal, n8n, A2A via SSE |
| State machine | Auditable, branching workflows | LangGraph |
| Conversational | Iterative reasoning, negotiation | AutoGen |

**Verdict:** Event-driven (via Temporal or A2A+SSE) is the only proven architecture for agents that run longer than a few minutes or that need real-world system integration. Request-response works for bounded, synchronous tasks.

---

## 3. Agent Observability & Debugging

### How to Debug a Wrong Agent Decision

The core challenge: agents are non-deterministic — the same prompt can produce different outputs on different runs.

**Proven approach (LangSmith + LangGraph Studio):**
1. Capture full trace: user input → each prompt → model output → tool calls → results → final output
2. Replay step-by-step: identify which node/step produced the wrong output
3. Modify state at that point and re-run from that checkpoint (Fork and Edit Threads)
4. Slice traces by attribute (user segment, input type, time window) to find systematic failure patterns

**LangGraph Studio specific features that work:**
- Step-through debug mode: pauses after each node
- State injection: modify agent state mid-run, resume with new state
- Hot code reload: edit node logic and replay without restarting session
- Fork: create alternative timeline from any checkpoint

**Other proven tools:**
- **Braintrust**: step-by-step playback of agent reasoning
- **Arize Phoenix**: slice failure analysis by attribute — identifies "mistakes concentrate in X topic or Y user segment"
- **Opik / Langfuse**: open-source alternatives with strong evaluation + trace pairing

---

### Trace Visualization Approaches

All mature platforms use nested trace hierarchies showing:
```
User Input
└── Agent: Router
    ├── Tool Call: search_database → result
    ├── Tool Call: fetch_context → result
    └── Handoff → Agent: Specialist
        ├── Tool Call: generate_response → result
        └── Output
```

Key visualization patterns:
- **Waterfall view**: timeline of all tool calls with durations and token counts
- **Graph overlay**: for LangGraph, execution path highlights which nodes were traversed
- **Diff view**: compare two runs side-by-side to spot regressions

---

### Cost Attribution in Multi-Agent Systems

Proven approach:
- Tag every LLM call with: agent_id, workflow_id, user_id, step_name
- Aggregate: cost per agent, per workflow, per user, per time window
- Alert on: cost spikes per component (e.g., one agent suddenly consuming 10x normal tokens)
- Identify expensive sub-tasks for targeted optimization (caching, prompt compression)

Tools that do this well: LangSmith (LangChain-native), Helicone (provider-agnostic), Arize.

---

### Key Performance Metrics

**Quality:** Task completion rate, outcome correctness, hallucination rate, user satisfaction
**Technical:** Latency per step, total tokens consumed, error rate, retry frequency
**Business:** Goal achievement rate (did the agent actually solve the problem?), cost-per-task
**Reliability:** Output consistency across runs, adherence to output schema, safety violations

**The most important metric in practice:** Did the agent achieve its end goal? Most platforms still measure process metrics (tokens, latency) rather than outcome metrics. The shift to goal-completion measurement is the frontier.

---

## 4. Real-World Agent Fleet Management

### Managing 10+ Concurrent Agents

**The proven architecture (Temporal):**
- Temporal Workflows = orchestration layer (deterministic, durable)
- Temporal Activities = actual work (LLM calls, tool invocations — non-deterministic allowed here)
- State persists across crashes: agents survive process failures, infra outages, restarts
- Concurrent execution is native — spawn N child workflows, collect results
- Native integration with OpenAI Agents SDK (announced 2025)

**Key Temporal primitives for fleet management:**
- `workflow.wait_condition(lambda: ..., timeout=...)` — pause until human approval or condition met
- Automatic retry with exponential backoff on Activity failures
- Workflow cancellation cascades to all child activities — clean kill switch
- Signal workflows externally to inject human decisions mid-run
- Query workflow state without interrupting execution

**What Temporal gets right vs others:**
- Workflows survive months — critical for agents with multi-day tasks
- No lost state on crashes — differentiator vs in-memory frameworks
- Built-in execution history for audit trails

---

### Permission & Approval Workflows

**Proven pattern (from Permit.io + LangGraph):**

1. **Policy-driven approvals**: permissions as declarative rules, not hardcoded logic
   - Role: "Reviewer" can approve financial actions > $1000
   - Declarative + version-controlled → scales across agent fleet

2. **LangGraph interrupt/resume**:
   - `interrupt()` pauses graph at approval checkpoint
   - Human reviews summarized context (not raw JSON)
   - Graph resumes with approval decision injected into state

3. **HumanLayer SDK**: async multi-channel approvals via Slack, email, dashboard
   - Agents don't block while waiting — async approval queue
   - Time-bounded: auto-escalate if not approved within N minutes

4. **The key rule**: Ask humans for approval with clear, summarized context. Raw JSON dumps cause decision fatigue and rubber-stamping.

**HITL framework maturity ranking:**
| Framework | HITL Quality | Notes |
|-----------|-------------|-------|
| LangGraph | Native, robust | `interrupt()`/resume is production-proven |
| Temporal | Excellent | Signals + wait conditions = clean async HITL |
| Permit.io | Policy-layer | Complements any framework |
| HumanLayer | Good | Best for async, multi-channel |
| CrewAI | Basic | Feels bolted-on; limited customization |

---

### Budget Controls & Kill Switches

**Proven patterns:**

**Confidence-gated execution (Temporal):**
```python
if confidence_score >= 0.95:
    proceed_autonomously()
else:
    await human_approval()
```

**Token budget enforcement:**
- Set hard limits per agent per workflow execution
- Track cumulative token spend via LLM middleware (Helicone, LangSmith)
- On budget exceeded: pause workflow, notify operator, require manual resume

**Kill switches:**
- Temporal: cancel parent workflow → cascades to all child activities automatically
- LangGraph: interrupt node that every path passes through → manual resume required
- n8n/CrewAI: execution halt via dashboard; less reliable for in-flight tasks

**MCP-based permission control (emerging best practice):**
- Control agent capabilities via MCP server permissions, not agent code
- Revoke an MCP server's tool → all agents lose that capability immediately
- More maintainable than per-agent permission hardcoding

---

### Scheduling & Priority Queues

**Temporal approach:**
- Task queues: route workflows to worker pools by priority
- Workers poll specific queues — high-priority queue workers separate from batch workers
- Rate limiting: workers configured with max concurrent activities
- Scheduling: cron workflows for recurring agent tasks

**What's missing industry-wide:**
- No standardized priority queue spec for multi-framework agent systems
- Most frameworks treat scheduling as an afterthought
- Temporal is the only production-proven option for complex scheduling needs

---

## 5. Emerging Patterns

### Agent-as-a-Service (AaaS)

**What's proven:** Agents exposed via HTTP/A2A as callable services with Agent Cards advertising capabilities. Enterprise SaaS vendors (Salesforce Agentforce, ServiceNow, SAP) are embedding agents as discoverable microservices within their platforms.

**The pattern:**
- Agent publishes capability manifest (Agent Card in A2A)
- Other agents/systems discover via `.well-known` URL
- Invoke via standard HTTP + JSON-RPC — no SDK dependency
- Auth via OAuth 2.1

**Why it matters for Companion:** This is the architectural model that enables a fleet of specialized agents to be managed, discovered, and composed without tight coupling.

---

### Agent Skill Registries

**Technical structure (proven via Spring AI + production systems):**

```
Skill/
├── SKILL.md          # Manifest: name, description, capabilities, constraints
├── skill_logic.py    # Execution logic and pipelines
├── prompts/          # Specialized LLM guidance templates
└── config.yaml       # Timeouts, retry policies, safety requirements
```

**Registry operations:**
1. **Register**: store skill with metadata + version; prevents version conflicts
2. **Discover**: find by capability tag or natural language query
3. **Load**: dynamic on-demand initialization with LRU eviction under memory pressure
4. **Route**: `SkillRouter` matches requests to skills via rules or capability matching

**Key insight from the Rune plugin system:** This is exactly what the skills directory in Claude Code implements — SKILL.md as manifest parsed at scan time, building a lightweight registry embedded in the SkillsTool description.

---

### Collaborative Agent Workspaces

**What's proven:**
- **Claude Code Agent Teams** (2026): Git worktree isolation per agent; merge only on passing tests — solves the concurrent edit conflict problem
- **Shared state stores**: Redis/PostgreSQL as neutral ground truth between agents; no agent owns state exclusively
- **Blackboard architecture**: agents post intermediate results to shared workspace; other agents read and build on them

**What's still theoretical:**
- Real-time agent negotiation (agents arguing over conflicting conclusions)
- Emergent specialization (agents dynamically dividing work without orchestrator)

---

### Human-in-the-Loop Patterns That Scale

**Pattern 1 — Risk-tiered automation:**
- Tier 1 (low risk, high confidence): fully autonomous
- Tier 2 (medium risk or medium confidence): async notification, human can veto within N minutes
- Tier 3 (high risk or low confidence): blocking approval required before execution

**Pattern 2 — Sparse supervision:**
- Agents handle 95%+ of cases autonomously
- Humans review edge cases flagged by confidence scoring
- Human labels flow back as training signal → reduces future escalations

**Pattern 3 — Modular composition (proven combination):**
- LangGraph for routing + interrupt points
- Permit.io / ReBAC for policy-driven authorization
- HumanLayer / Slack for async approvals on non-blocking decisions
- Temporal for durable state across approval waits

**The fundamental design principle:** Design around "Would I approve this if the agent asked me first?" — if yes, automate; if no, build an explicit checkpoint. Generic HITL without defined roles, timelines, and escalation paths fails in practice (leads to rubber-stamping).

---

## Synthesis: What's PROVEN vs. THEORETICAL

### Proven (battle-tested in production)

| Capability | Proven Approach | Evidence |
|-----------|----------------|----------|
| Visual agent debugging | LangGraph Studio state inspection | Used by LangChain's own teams |
| Durable multi-agent execution | Temporal Workflows + Activities | Production OpenAI SDK integration |
| Agent tool discovery | MCP protocol | 97M SDK downloads, 10K+ servers |
| Cross-framework agent interop | A2A protocol | 150+ org adoption in 9 months |
| Role-based agent teams | CrewAI | 1.1B+ actions Q3 2025 |
| Deterministic audit workflows | LangGraph state machines | Fortune 500 compliance use cases |
| HITL interrupt/resume | LangGraph `interrupt()` | Documented, production-shipped |
| Skill registries | YAML manifest + dynamic loader | Spring AI, Rune plugin system |

### Theoretical / Early Stage

| Capability | Status | Gap |
|-----------|--------|-----|
| Emergent agent specialization | Research phase | No production examples |
| Agent negotiation/debate | Demo-quality | Not reliable at scale |
| Standardized budget controls | Fragmented | No cross-framework standard |
| Priority queues (multi-framework) | Temporal-only | No standard spec |
| Agent reputation/trust systems | Whitepaper stage | Not deployed |

---

## Implications for Companion

1. **Use A2A + MCP as the communication layer** — the only two protocols with genuine industry momentum and complementary roles

2. **Temporal for fleet orchestration** — the only proven solution for durable, concurrent, multi-agent execution with real kill-switch capabilities

3. **Skill registry via YAML manifests** — proven pattern; already partially implemented via the Rune plugin SKILL.md system

4. **LangGraph-inspired interrupt/resume for HITL** — most mature pattern; worth implementing directly or borrowing the concept

5. **Observability is table stakes** — nested trace hierarchy + cost-per-agent attribution must be built in from day one, not added later

6. **Agent Cards for capability discovery** — expose each Companion agent as an A2A service with a discoverable manifest; enables composability without tight coupling

7. **Risk-tiered HITL** — don't ask humans to approve everything; design three tiers with defined roles, timeouts, and escalation paths
