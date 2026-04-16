# SKILL.md — Building a Project Explainer with Code Explorer

> A reusable methodology for turning any codebase into an interactive, self-contained
> educational document for non-technical stakeholders (product managers, designers, investors).
> Produces a single `.html` file that works offline, needs no server, and adapts to any project.

---

## Overview

A **Project Explainer** is a structured HTML document that walks a non-technical reader through
a codebase from the outside in — starting with what the project does, then how it's structured,
then how its key mechanics work, then its development history and engineering challenges.

A **Code Explorer** is an interactive widget embedded in the explainer that lets readers click
any named feature and immediately see the real source code behind it, annotated with plain-language
explanations of every term and decision.

Together they answer the questions a PM actually has:
- *What does this do and why does it exist?*
- *How do the pieces connect?*
- *What was hard to build?*
- *Where is the code that makes X work?*

---

## When to Use This Skill

- Onboarding a new product manager, designer, or business stakeholder to a technical project
- Documenting an unfamiliar codebase you were asked to take over
- Creating educational materials for a technical talk or workshop
- Wrapping up a project as a living reference for the future team
- Any time a README is not enough but a full wiki is too much

---

## Step 1 — Codebase Audit (Before Writing Anything)

Use an `Explore` subagent with this prompt:

```
Explore the entire codebase at [PATH] thoroughly. I need:

1. Complete directory and file structure with the purpose of each file
2. Full or summarised content of all key source files
3. Git log (last 50+ commits, grouped by theme if possible)
4. package.json / dependency manifest
5. How the system is layered: frontend / backend / database / external services
6. The core algorithm or engine — the most important logic in the project
7. Communication patterns: API, WebSocket, events, queues
8. Test structure: what is tested and how
9. Deployment configuration and non-obvious infrastructure requirements
10. Non-obvious design decisions visible in comments or code

Be very thorough — this output will be used to build educational documentation.
```

**What to extract from the audit:**

| What | Where to look | Why it matters |
|---|---|---|
| File responsibilities | Directory tree + imports | Gives readers a mental map |
| Shared modules | Files imported by 2+ pages | These are the core abstractions |
| Git narrative | Commit log grouped by theme | Shows how the project grew |
| The golden rule | Core engine / algorithm | The constraint everything else respects |
| Communication protocol | All message types sent/received | Explains real-time behaviour |
| Significant bugs | Commit messages with "fix:" | Shows engineering credibility |
| Deployment gotchas | Config files + comments | Saves the next person's time |

---

## Step 2 — Explainer Structure

A complete explainer has **13 sections** in this order.
The ordering goes: broad context → system design → core mechanics → history → process.

| # | Section | Question it answers | PM value |
|---|---|---|---|
| 1 | **Hero** | What is this? Key numbers? | First impression, quick orientation |
| 2 | **What Is It** | What are the components? What's the user flow? | Mental model of the system |
| 3 | **Tech Stack** | What technologies? Why each one? Why NOT others? | Vocabulary, tradeoff awareness |
| 4 | **Architecture** | How do the pieces connect? What are the shared modules? | Systems thinking |
| 5 | **Core Mechanic** | What is the most important algorithm or rule? | Understanding the constraint |
| 6 | **Key Feature A** | How does [most complex feature] work internally? | Technical depth |
| 7 | **Key Feature B** | How does [second most complex feature] work? | Technical depth |
| 8 | **Real-Time / Comms** | How do parts of the system talk to each other? | Understanding latency, reliability |
| 9 | **UI / Design** | How did the visual design evolve? Why these choices? | Design decision traceability |
| 10 | **Development Journey** | What were the phases? What got rebuilt? | Project history, team context |
| 11 | **Bug Log** | What broke? Why? How was it fixed? | Engineering credibility |
| 12 | **Testing** | What is tested? How is quality enforced? | Process confidence |
| 13 | **Deployment** | How does it run in production? What are the gotchas? | Infrastructure awareness |

**Ordering principle:**
- Sections 1–4: Context. Any reader can follow.
- Sections 5–8: Mechanics. Readers who want depth read these.
- Sections 9–10: History. Readers who want context read these.
- Sections 11–13: Process. Readers who want to evaluate the team read these.

---

## Step 3 — Writing Each Section

### Hero
- One sentence: what the system does from the user's perspective
- The two or three components (not implementation details)
- 4 key numbers in stat boxes (grid size, latency, file count, character count — whatever is distinctive)
- Tech tags: short stack labels as pills

### What Is It
- Component-by-component breakdown with bullet points
- A "no X required" callout box (no accounts, no database, no app install — whatever is notable)
- Each component: what it shows/does, what the URL is, what technologies it uses

### Tech Stack
- Group into: Backend, Frontend, Tooling
- For each technology: name, what it does in this project, why it was chosen over alternatives
- "Why no framework?" or "Why no database?" — always explain the notable absences

### Architecture
- A visual component diagram (use CSS grid + colored boxes, no external tools)
- File tree with inline comments
- "Key architectural decisions" card: the 3–5 most important choices and the reasoning

### Core Mechanic
- State the golden rule in a highlight box at the top
- Show the constant / configuration that defines it
- Show the distance / step calculation
- Build a live interactive demo if the mechanic can be demonstrated in ~40 lines of JS
- Explain why breaking the rule would ruin the experience

### Key Features (2 of them, your deepest technical areas)
- Explain the architecture before showing the code
- Use the 4-panel / layered structure: static holders + animating parts
- Show the CSS/keyframes separately from the JS orchestration
- Always end with a highlight box for any non-obvious surface detail

### Real-Time / Comms
- Full sequence diagram as a step-by-step flow (`.ws-step` components)
- Tab between: Flow / Messages / Edge Cases (reconnection, errors)
- Show both directions: what the client sends, what the server sends back

### UI / Design
- Show evolution in a 3-card grid: v1 (problem) → v2 (partial) → v3 ✓ (solution)
- Always include the "why was v1 wrong" explanation — not just "v3 is better"
- Input/interaction evolution is usually more interesting than visual evolution

### Development Journey
- Tab between: Phases / Timeline / Feature Breakdown
- Phases: each phase is a card with name, key commits, and what was learned
- Timeline: use a vertical timeline with color-coded dots (feat/fix/perf)
- Feature breakdown: two-column grid of checkmarked features per component

### Bug Log
Each bug card has a fixed structure:
1. **Bug badge** + title (what broke, from user perspective)
2. **Root cause** (the technical reason it happened)
3. **Symptoms** (what users/developers observed)
4. **Fix** (what changed, why that fixed it)

Categories to always include if they exist:
- Platform compatibility (iOS Safari, Edge, Android)
- Race conditions (timing-dependent failures)
- Security vulnerabilities (randomness, injection, unbounded input)
- Performance regressions (O(N) → O(1) changes)

### Testing
- Unit tests: what engine / tool, what is tested, sample test assertions
- Integration / E2E: what scenario is covered
- Visual / screenshot automation: what tool, what it captures
- Coverage enforcement: is it required on PRs?

### Deployment
- Hosting platforms with config file names
- Every environment variable with: name, purpose, required/optional
- Non-obvious infrastructure requirements as 3-column cards
- Optional services: what works without them, what breaks

---

## Step 4 — The Code Explorer Widget

### Architecture

```
[floating button] → [full-screen modal]
                       ├── [left: feature list]    ← grouped list, click to select
                       └── [right: detail pane]    ← code + callouts for selected feature
```

The modal is triggered by a fixed-position button (bottom-right).
Clicking a feature in the list renders the detail pane with annotated code.
A "jump to section" link in the detail pane closes the modal and scrolls the explainer to context.

**Modal centering:** The modal must be centered within the content area (right of the nav), not the full viewport:
```css
#explorer-modal {
  left: calc(200px + (100vw - 200px) / 2);
  transform: translateX(-50%) translateY(12px) scale(0.97); /* closed state */
}
#explorer-modal.visible {
  transform: translateX(-50%) translateY(0) scale(1);        /* open state */
}
```
Without this, the modal overlaps the left nav. The `200px` offset must match the nav width.

### Feature Data Structure

Each feature in the `FEATURES[]` array follows this schema:

```js
{
  id: 'unique-slug',           // used as list item identifier
  icon: '🔁',                  // emoji cue for quick scanning
  label: 'Feature Name',       // shown in the left column list
  file: 'path/to/source.js',   // the source file this comes from
  section: '#section-id',      // explainer section to jump to (hash anchor)
  badge: 'engine',             // category — controls badge color
                               //   engine / ui / comms / audio / server / storage

  summary: `Multi-line plain-language description.
What does this feature do? Why does it exist?
What would break if it were removed?
Written so a PM with no code background can follow it.`,

  blocks: [
    {
      title: 'descriptive title — what this specific block does',
      file: 'path/to/source.js',        // can differ from parent (helper module etc.)
      code: [
        { t: 'cm', v: '// comment — use for section headers and explanations' },
        { t: 'hl', v: 'highlighted line — the key line the reader must understand' },
        { t: 'kw', v: 'const ' },       // keyword: purple  (#B888E8)
        { t: 'fn', v: 'functionName' }, // function name: yellow (#F0C070)
        { t: 'nm', v: 'varName' },      // variable/property: blue (#5FC1D5)
        { t: 'st', v: '\'string\'' },   // string literal: orange (#E8A870)
        { t: 'vl', v: '42' },           // value/number: green (#90D870)
        { t: 'tp', v: 'TypeName' },     // type/class name: pink (#E88890)
        { t: '',   v: 'plain code\n' }, // uncoloured, must end with \n
      ],
      callouts: [
        {
          term: 'Concept or term name',
          desc: 'Plain-language explanation. Why does this exist? What would happen '
              + 'without it? What is the non-obvious behaviour? Write for someone '
              + 'who has never seen this code before. 2–4 sentences.'
        },
      ],
    },
  ],
}
```

### Code Annotation Guidelines

**What to highlight (`.hl` lines):**
- The single most important line in a block
- The line that enforces the core constraint
- The line that was the hardest to get right
- The line that fixed a bug described elsewhere

**What to put in callouts:**
- Every piece of non-obvious vocabulary (API names, patterns, algorithms)
- The reason for a specific value (why 60ms? why 20s? why 500ms?)
- The alternative that was rejected and why
- The edge case being handled
- The connection to another part of the system

**How many callouts per block:** 2–4. Fewer = not enough explanation. More = overwhelming.

**How many blocks per feature:** 1–3. One block = the key function. Two blocks = key function + supporting detail. Three blocks = rare, only when two interconnected functions must both be shown.

**How many features total:** 12–20. Fewer = incomplete picture. More = hard to navigate.

### Feature Grouping

Organise features into 5–6 groups that map to the architecture:

```
Core Engine     ← the algorithm / data model that everything else depends on
Rendering       ← how output is produced (DOM, canvas, CSS)
Communication   ← how parts of the system talk to each other
Storage         ← how state is persisted (localStorage, DB, cache)
Platform        ← mobile, browser-specific, deployment-specific behaviour
Server          ← backend routing, session management, security
```

---

## Step 5 — HTML Template Design System

All styling is driven by CSS custom properties in `:root`.
To adapt for any project, change only these variables:

```css
:root {
  /* Colors — Primary green (brand) */
  --accent:       #53BD1D;   /* primary brand green — main CTAs and interactive elements */
  --accent-hover: #3F9314;   /* one shade darker for hover states */
  --accent-dim:   #1A4505;   /* deep green for subtle tinted backgrounds */
  --green:        #68E926;   /* bright green for success states and feature badges */
  --red:          #E6A461;   /* quaternary warm — warnings, highlights, error badges */

  /* Colors — Secondary blue */
  --blue:         #35727E;   /* secondary blue for links and informational elements */
  --blue-dim:     #102C31;   /* deep blue for secondary tinted backgrounds */

  /* Surfaces — dark theme derived from brand dark neutrals */
  --surface:      #000000;   /* page background — pure black */
  --card:         #092301;   /* card background — deepest primary green */
  --card2:        #263B10;   /* elevated card / hover state — mid-dark green */
  --border:       #495D3D;   /* default border — mid tertiary green */
  --border-light: #678357;   /* hover border — lighter tertiary green */

  /* Text — neutral grey scale */
  --white:        #EFF1EE;   /* headings and labels — lightest neutral */
  --text-strong:  #C9CFC8;   /* subheadings and important body copy */
  --text:         #A3A8A2;   /* body copy */
  --muted:        #5C5E5B;   /* metadata, labels, disabled states */

  /* UI tokens */
  --radius:       10px;                          /* default card border-radius */
  --seam:         #000;                          /* tile seam line color */
  --transition:   0.3s cubic-bezier(0.4,0,0.2,1); /* standard ease-in-out */
}
```

**Full color palette reference** (for cards, badges, and tinted surfaces):

| Family | Purpose | Shades (light → dark) |
|---|---|---|
| Primary green | CTAs, success, brand | `#CBFFBF` `#68E926` `#53BD1D` `#3F9314` `#2C6B0C` `#1A4505` `#092301` |
| Secondary blue | Links, info, secondary actions | `#A0E6F7` `#5FC1D5` `#4999A8` `#35727E` `#224D56` `#102C31` `#051316` |
| Tertiary green | Subtle accents, muted surfaces | `#DCF7CE` `#A9D38F` `#87AA73` `#678357` `#495D3D` `#2D3B25` `#131B0F` |
| Quaternary warm | Highlights, notifications, badges | `#F5D3BA` `#E6A461` `#B6814B` `#885F36` `#5C4022` `#342310` `#190F05` |
| Neutrals | Text, borders, UI chrome | `#EFF1EE` `#C9CFC8` `#A3A8A2` `#7E827E` `#5C5E5B` `#3B3D3A` `#1D1E1D` |

**Code Explorer hardcoded backgrounds** (do not use CSS vars — these are the darkest tones in the UI):

| Element | Color | Notes |
|---|---|---|
| Modal background | `#131B0F` | Darkest green-tinted surface |
| Feature list (left column) | `#0D110A` | One step darker than modal |
| Annotated code block body | `#060A10` | Near-black blue-tinted |
| Annotated code block header | `#0A0E18` | Slightly lighter blue-tinted |

**Typography:**
- All text: `Roboto Mono Variable` (Google Fonts, `family=Roboto+Mono:ital,wght@0,300..700;1,300..700`) — headings, body, labels, buttons, and code blocks
- Fallback stack: `'SF Mono', 'Fira Code', monospace`
- Heading scale: `h1: 3rem/700`, `h2: 1.85rem/700`, `h3: 1.05rem/600`, `h4: 0.9rem/600`
- Body: `p` at default size, `line-height: 1.6` on body; section body copy typically `0.82rem–0.88rem`
- `em` elements: `color: var(--accent); font-style: normal` — used for inline emphasis without italics
- `strong` elements: `color: var(--white)` — white for maximum contrast
- Available weights: Light (300), Regular (400), Medium (500), Semi Bold (600), Bold (700)
- No project-specific display fonts in UI chrome (keep those only for content demos)

**Page layout — fixed left nav:**
- `nav`: `position: fixed; left: 0; top: 0; bottom: 0; width: 200px; background: var(--card)`
- `body`: `margin-left: 200px` to leave room for the nav
- Nav contains: `.logo` (project name + accent dot) at top, then `<a>` links with `border-left` active indicator
- Active link: `color: var(--accent); border-left: 2px solid var(--accent); background: rgba(83,189,29,0.06)`
- **Responsive**: shrinks to 160px at 860px; collapses to a horizontal top bar (sticky, `height: auto`, `flex-direction: row`, `overflow-x: auto`) at 640px — body `margin-left` goes to 0

**Scroll progress bar:**
- `position: fixed; top: 0; left: 200px; height: 2px; background: var(--accent); z-index: 200`
- Must use `left: 200px` (not 0) so it starts after the nav sidebar, not behind it
- Width driven by a `scroll` event handler: `el.style.width = (scrollY / (scrollH - innerH) * 100) + '%'`

**Button variants** (use for CTAs and interactive controls):
- **Primary** — `background: #53BD1D` (brand green), white text — main actions
- **Secondary** — `background: #35727E` (brand blue) — secondary actions
- **Tertiary** — muted green border + light green text — low-emphasis actions
- **Quaternary** — `background: #E6A461` (warm orange) — highlights and exports
- **Outline** — transparent with white border — alternative to ghost
- **Ghost** — no background, white text — lowest emphasis

**Component library included in the template:**

| Component | CSS class(es) | Purpose |
|---|---|---|
| Section label | `.section-label` | Small uppercase category above h2 |
| Stat box | `.stat-box`, `.stat-num`, `.stat-label` | Key numbers in hero / sections |
| Card | `.card`, `.card-accent/.green/.red/.blue` | Content grouping with colored top border |
| Tag pill | `.tag` | Tech stack labels (pill shape, `border-radius: 20px`) |
| Highlight box | `.highlight-box` | Accent-tinted callout: `rgba(83,189,29,0.06)` bg + green border |
| Flow diagram | `.flow`, `.flow-node`, `.flow-arrow` | Left-to-right sequence; node variants: `.highlight`, `.server`, `.phone` |
| WS step | `.ws-step`, `.ws-step-num.tv/.phone/.server`, `.ws-step-msg`, `.ws-step-desc` | Numbered comms flow with color-coded actor circles |
| Timeline | `.timeline`, `.timeline-item.feat/.fix/.perf` | Vertical git history with color-coded dots |
| Bug card | `.bug-card`, `.bug-header`, `.bug-badge`, `.fix-badge`, `.bug-title`, `.bug-body`, `.bug-fix` | Bug log entries |
| Tab strip | `.tabs`, `.tab-btn[data-tab]`, `.tab-panel` | Multi-view sections; JS scoped to nearest section ancestor |
| Grid layouts | `.grid-2`, `.grid-3`, `.grid-4` | Responsive columns (collapse to 1 col at 700px) |
| Arch diagram box | `.arch-box.tv/.phone/.server/.db` | Color-coded component boxes for architecture diagrams |
| Panel diagram | `.panel-diagram`, `.panel-tile`, `.panel-half.top/.bottom`, `.layer-label` | Split-flap tile cross-section diagrams |
| Color swatch row | `.color-row`, `.cswatch` | Inline row of colored swatches (32×32px, rounded) |
| `pre` code block | `pre .comment/.key/.val/.fn/.str/.kw` | Syntax-highlighted static code snippets |
| Footer | `footer` | Centered, muted, `border-top: 1px solid var(--border)` |

---

## Step 6 — Interactive Elements

### Scroll Progress Bar
Fixed at the top of the page (below nav). A 1-line `scroll` event handler drives a `width` CSS property.
Gives readers orientation in a long document.

### Active Nav Highlight
`IntersectionObserver` on all `<section id="...">` elements.
When a section enters the viewport, the corresponding nav link gets the `.active` class.
No scroll event math needed.

### Fade-In on Scroll
Add `.fade-in` to any block-level element.
`IntersectionObserver` with `threshold: 0.1` adds `.visible` on entry, triggering an `opacity + translateY` transition.
10 lines of JS total.

### Tab System
Generic: any `.tab-btn[data-tab="panel-id"]` + `.tab-panel#panel-id` pair.
JS scoped to the nearest ancestor section, so multiple tab groups on one page don't interfere.

### Live Demo (for core mechanic)
- Build a minimal JS implementation of the core algorithm (~30–50 lines)
- Expose it through a simple input + button interface
- Show the output updating in real time
- This is the highest-value interactive element in the document

---

## Step 7 — Delivery

The output is a **single `.html` file**:
- No build step
- No server required
- No CDN dependencies except Google Fonts (loads from cdn.googleapis.com)
- Works offline if fonts are cached
- Shareable as an email attachment
- Opens in any browser (Chrome, Firefox, Safari, Edge)

**Recommended filename:** `explainer.html` or `[project-name]-explainer.html`

---

## Quality Checklist

### Content
- [ ] Every section has a plain-language summary before any technical content
- [ ] Every technical term introduced in a callout or inline explanation
- [ ] The golden rule / core constraint is explicitly stated
- [ ] At least 6 real bugs documented with root cause + fix
- [ ] Git history narrative covers all phases, not just recent commits
- [ ] Architecture diagram shows all components and connection types

### Code Explorer
- [ ] 12–20 features across 5–6 groups
- [ ] Every feature has 1–3 code blocks with 2–4 callouts each
- [ ] Highlighted lines (`.hl`) mark the genuinely important lines, not random ones
- [ ] Callout terms are searchable vocabulary a PM would want to know
- [ ] Every feature has a working "jump to section" link

### Design & UX
- [ ] CSS custom properties are the only thing to change when re-theming
- [ ] No project-specific fonts or colors in UI chrome
- [ ] Sticky nav highlights the active section during scroll
- [ ] Scroll progress bar visible at top
- [ ] Tab strips work correctly (no cross-contamination between groups)
- [ ] Interactive demo works on load (no manual step required)
- [ ] Code Explorer opens/closes cleanly, keyboard Escape works

### Compatibility
- [ ] File opens correctly when double-clicked (no server)
- [ ] Readable on a laptop screen (min 1024px wide)
- [ ] Code blocks scroll horizontally without breaking layout
- [ ] All `#anchor` links scroll to the correct section

---

## Anti-Patterns to Avoid

| Anti-pattern | Why it's wrong | Better approach |
|---|---|---|
| Writing the explainer before auditing the codebase | You'll miss the real constraints and architectural decisions | Always audit first |
| Explaining what code does instead of why | PMs need decisions, not transcriptions | Lead every callout with the reason, not the description |
| Only covering happy-path behaviour | PMs need to understand failure modes | Always include edge cases, disconnect handling, error states |
| Project-specific visual language in UI chrome | Makes the template non-reusable | Keep content-specific styles isolated; UI chrome uses neutral system |
| Too many callouts per block (5+) | Readers stop reading them | Cap at 4; split the block if you need more |
| Interactive demo that requires multiple steps to activate | Readers won't discover it | Auto-trigger the demo on load with an example input |
| Sections in order of implementation rather than understanding | Readers get lost | Always: context → mechanics → history → process |
