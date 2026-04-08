# Design System: Companion
Last Updated: 2026-04-08
Platform: web (desktop Tauri + browser)
Domain: Developer Tools — AI Agent Orchestrator
Style: Glassmorphism + Minimalism hybrid (floating glass 3D blocks, clean SaaS)

## Domain Classification

**Developer Tools / AI Coding Assistant** — wraps Claude Code CLI into a visual orchestration layer. Users are developers who value information density, keyboard shortcuts, and dark mode. The glass blocks create spatial hierarchy without obscuring the underlying session grid.

## Color Tokens

### Primitive (brand)
```css
--brand-orange:    #ff5722   /* deep orange — warm, energetic, not generic */
--brand-orange-10: rgba(255, 87, 34, 0.10)
--brand-orange-20: rgba(255, 87, 34, 0.20)
--brand-orange-35: rgba(255, 87, 34, 0.35)
```

### Semantic (default theme — Companion)
```css
/* Light mode */
--bg-base:        #f5f3ef   /* warm cream page bg */
--bg-card:        #ffffff   /* card surface */
--bg-elevated:    #f0ede8   /* elevated panels */
--bg-sidebar:     #fafaf8   /* sidebar rail */
--bg-hover:       #ede9e3   /* hover state */
--text-primary:   #1f2d3d   /* primary text */
--text-secondary: #4b5563   /* secondary text */
--text-muted:     #9ca3af   /* muted/disabled text */
--border:         #e5e0d8   /* default border */
--border-strong:  #d0cac0   /* emphasized border */
--accent:         #ff5722   /* brand deep orange */
--success:        #34a853   /* positive/success */
--danger:         #ea4335   /* error/destructive */
--warning:        #fbbc04   /* caution */

/* Dark mode */
--bg-base:        #0a0a0a   /* near-black, not pure #000 */
--bg-card:        #111111   /* card surface */
--bg-elevated:    #1a1a1a   /* elevated panels */
--bg-sidebar:     #0d0d0d   /* sidebar rail */
--bg-hover:       #1e1e1e   /* hover state */
--text-primary:   #f0f0f0   /* primary text */
--text-secondary: #aaaaaa   /* secondary text */
--text-muted:     #707070   /* muted text */
--border:         #1e1e1e   /* default border */
--border-strong:  #2e2e2e   /* emphasized border */
```

### Glass Tokens
```css
/* Light */
--glass-bg:       rgba(255, 255, 255, 0.82)
--glass-bg-heavy: rgba(255, 255, 255, 0.92)
--glass-border:   rgba(255, 255, 255, 0.5)
--glass-blur:     16px

/* Dark */
--glass-bg:       rgba(20, 20, 20, 0.75)
--glass-bg-heavy: rgba(20, 20, 20, 0.88)
--glass-border:   rgba(255, 255, 255, 0.1)
```

### Accent Decision Log
> Chose `#ff5722` (deep orange) over `#4285f4` (Google blue) and `#6366f1` (default indigo).
> **Why**: Google blue is generic SaaS. Indigo is AI-tool default (#1 anti-pattern). Deep orange is warm, energetic, rare in dev tools — signals "different from Claude/Cursor/Linear". Passes 4.5:1 contrast on both light cream and dark surfaces.

## Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Display | Inter | 800 | 32-40px |
| H1 | Inter | 700 | 24-32px |
| H2/H3 | Inter | 600 | 18-24px |
| Body | Inter | 400 | 14-16px |
| Mono/Numbers | JetBrains Mono | 700 | 14-16px |
| Small labels | Inter | 500 | 10-12px, uppercase, tracking-wider |

**Numbers rule**: JetBrains Mono Bold for ALL numeric values — cost, tokens, turns, session counts. `font-variant-numeric: tabular-nums` always.

**Font pairing**: #4 Developer Mono from design-dna reference (JetBrains Mono headings in data contexts + Inter body). Minimal Swiss (#3) for general prose. No decorative fonts — developers distrust them.

## Spacing (8px base)
```
xs: 4px | sm: 8px | md: 16px | lg: 24px | xl: 32px | 2xl: 48px | 3xl: 64px
```

## Border Radius
```
sm: 4px | md: 6px | lg: 8px | xl: 12px | pill: 9999px
```

> **Reduced from previous**: sm: 8→4, md: 12→6, lg: 16→8, xl: 24→12. Rationale: developer tools should feel precise and technical, not bubbly. Subtle rounding softens hard edges without looking consumer-friendly. Pill shape reserved for badges/tags only.

## Effects

### Floating Glass Block (signature pattern)
Every major UI region is a separate floating glass 3D element with transparent gaps between them. The mesh gradient background shows through gaps.

```css
.glass-block {
  background: var(--glass-bg-heavy);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);  /* 12px */
  box-shadow: var(--shadow-float);
}
```

### Shadow Scale
```css
--shadow-soft:  0 2px 8px rgba(0, 0, 0, 0.06);
--shadow-float: 0 8px 30px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04);
--shadow-glow:  0 0 0 3px rgba(255, 87, 34, 0.35);  /* focus ring, accent-tinted */
```

Dark mode shadows are heavier:
```css
--shadow-float: 0 8px 30px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2);
```

### Dark Mode Background
Subtle warm gradient, not multi-colored mesh:
```css
background:
  radial-gradient(ellipse 600px 500px at 10% 10%, rgba(255, 87, 34, 0.04) 0%, transparent 70%),
  radial-gradient(ellipse 500px 500px at 90% 90%, rgba(255, 87, 34, 0.03) 0%, transparent 70%),
  var(--color-bg-base);
```

### Animation Timing
```css
--transition-fast:   150ms ease;
--transition-normal: 250ms ease;
--transition-slow:   350ms cubic-bezier(0.4, 0, 0.2, 1);
```

## Layout Architecture

### Floating Block Regions
```
┌─────────────────────────────────────────────┐
│  ┌─── Floating Header (glass bar) ────────┐ │ ← 12px margin from edges
│  └────────────────────────────────────────┘ │
│  ┌─────┐ ┌─── Session Grid ────────┐ ┌──┐  │
│  │Sidebar│ │  (glass, lighter)      │ │R │  │ ← 8px gap between blocks
│  │(glass)│ │                        │ │P │  │
│  │      │ │                        │ │  │  │
│  └─────┘ └────────────────────────┘ └──┘  │
│  ┌─── Activity Terminal (glass bar) ─────┐  │
│  └───────────────────────────────────────┘  │
│         ┌── Stats Bar (floating) ──┐        │ ← fixed bottom, z-50
│         └─────────────────────────┘        │
└─────────────────────────────────────────────┘
```

### Nav Overlay (floating pills)
- Position: fixed, left: 92px, vertically centered
- Each pill is individual glass card with gaps
- Detail card: separate glass block, width: 240px
- Click-outside-to-close

## Component Patterns

### Feature Guide (floating bottom card)
- Trigger: "Guide" text button in header (not icon)
- Appears as floating glass card at bottom center
- Category pills as horizontal row
- Click category → content slides up from below
- Active category: `#ff5722` accent, not purple
- Dismiss: click outside or X button

### Layout Menu
- Renamed from generic "Layout" to descriptive name
- Left section: floating buttons for layout presets
- Right section: theme switcher
- Top-right: 3-mode toggle (System / Dark / Light)
- Same glass pill pattern as other nav items

### Theme Switcher (3-mode)
```
[ System ] [ Dark ] [ Light ]
```
- System: follows OS `prefers-color-scheme`
- Active mode: solid accent bg, white text
- Inactive: transparent, secondary text

## Anti-Patterns (MUST NOT generate these)

### Domain-Specific (Developer Tools)
- ❌ **Decorative animations that delay tool response** — developers will close the app
- ❌ **Non-monospace font for code/command output** — breaks mental model
- ❌ **Light mode only** — developer tools default to dark
- ❌ **Visual noise around core functionality** — sessions are the content, chrome must recede
- ❌ **Purple/indigo accent** — signals "generic AI tool", Companion is an orchestrator not a chatbot
- ❌ **Gradient blob heroes** — #1 AI tell, inappropriate for dev tools
- ❌ **Uniform card grid** — session grid should vary with count (1→full, 2→split, 3→L-shape, etc.)

### Glass-Specific
- ❌ **Glassmorphism on EVERY element** — use glass for major structural blocks only (header, sidebar, panels). Inner elements use solid bg
- ❌ **Glass without fallback** — always provide solid bg-color before backdrop-filter for browsers that don't support it
- ❌ **Heavy blur on scrolling content** — performance killer, limit blur to fixed/sticky elements
- ❌ **Glass border replacing content hierarchy** — borders show structure, don't rely on glass blur alone for grouping

### Platform-Specific (Web)
- ❌ **`h-screen`** — use `min-h-[100dvh]` for iOS Safari
- ❌ **Pure `#000000`** — use `#0a0a0a` or similar off-black
- ❌ **`outline-none` without focus-visible replacement** — accessibility violation
- ❌ **Neon outer glow box-shadows** — AI fingerprint, use inner borders or tinted shadows

## UX Writing

### Developer Tools Tone
- **Direct, technical, no fluff**
- Error: `[What failed] + [Why] + [What to do]`
- Empty state: `[What's missing] + [How to fill it]`
- Loading: context-specific ("Connecting to Claude...", "Starting session...")
- Buttons: verb-first, specific ("New Session", "Resume", "Stop", "Deploy")

### Templates
```
Error:    "Session failed: Claude CLI exited with code 1. Check your API key in Settings."
Empty:    "No active sessions. Press Ctrl+N to start one."
Confirm:  "Stop session 'companion'? Unsaved context will be lost. This cannot be undone."
Loading:  "Starting Claude Opus..." / "Resuming session..."
```

## Platform Notes
- Dark mode support: required (default)
- Responsive: 375px (mobile), 768px (tablet), 1024px (desktop), 1440px (wide)
- Keyboard shortcuts: visible in UI, command palette (Ctrl+K)
- Touch targets: ≥ 44x44px with 8px gap
- `prefers-reduced-motion`: all animations have reduced-motion overrides

## Component Library
- Phosphor Icons (`@phosphor-icons/react`) — 6 weight variants
- Sonner for toasts (bottom-right)
- cmdk for command palette
- Custom glass components (no shadcn/ui dependency for layout)
- Zustand for state management

## Theme System
11 built-in themes sourced from real product design systems:
Companion (default), Linear, Vercel, Cursor, Stripe, Raycast, Claude, Supabase, Spotify, Notion, PostHog.
Each with light + dark variants. Custom VS Code theme import supported.

## Pre-Delivery Checklist
- [ ] Color contrast ≥ 4.5:1 for all text
- [ ] Focus-visible ring on ALL interactive elements
- [ ] Touch targets ≥ 44x44px with 8px gap
- [ ] All icon-only buttons have aria-label
- [ ] All inputs have associated label or aria-label
- [ ] Empty state, error state, loading state for all async data
- [ ] cursor-pointer on all clickable elements
- [ ] prefers-reduced-motion respected for all animations
- [ ] Dark mode tested and functional
- [ ] Responsive tested at 375px / 768px / 1024px / 1440px
- [ ] No console.log in production
- [ ] No hardcoded secrets
- [ ] Semantic HTML (button not div, nav, main, header landmarks)
