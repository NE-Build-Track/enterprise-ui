# 🎨 modern-css — an Agent Skill for building stunning UIs with platform-native CSS

<!-- Static badges (work anywhere, no repo required) -->
![Skill Format](https://img.shields.io/badge/format-Agent%20Skill%20(SKILL.md)-8A2BE2)
![CSS](https://img.shields.io/badge/CSS-2026%20Snapshot-1572B6?logo=css&logoColor=white)
![Baseline Verified](https://img.shields.io/badge/baseline%20verified-2026--07--22-brightgreen)
![Feature Tiers](https://img.shields.io/badge/tiers-A%20widely%20·%20B%20newly%20·%20C%20guarded-blue)
![Features Tracked](https://img.shields.io/badge/features%20tracked-120%2B-orange)
![Zero JS Hacks](https://img.shields.io/badge/JS%20hacks-replaced%20by%20CSS-success)
![Interop](https://img.shields.io/badge/Interop-2026%20aligned-informational)
![Maintenance](https://img.shields.io/badge/maintenance-re--verify%20every%206%20months-yellow)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-ff69b4)

<!-- Dynamic GitHub badges -->
![License](https://img.shields.io/badge/license-CC_BY_4.0-lightgrey)
![Last Commit](https://img.shields.io/github/last-commit/mikezupper/modern-css-skill)
![Commit Activity](https://img.shields.io/github/commit-activity/m/mikezupper/modern-css-skill)
![Issues](https://img.shields.io/github/issues/mikezupper/modern-css-skill)
![Contributors](https://img.shields.io/github/contributors/mikezupper/modern-css-skill)
![Repo Size](https://img.shields.io/github/repo-size/mikezupper/modern-css-skill)
![Stars](https://img.shields.io/github/stars/mikezupper/modern-css-skill?style=social)

A portable, harness-agnostic **Agent Skill** that teaches any AI coding agent
to build the highest-quality, performant, elegant, modern web UX/UI by
leveraging CSS and the web platform to their full current capability — instead
of reaching for the JavaScript hacks and libraries that only ever existed to
patch CSS's historical shortcomings.

---

## Table of contents

- [Motivation](#motivation)
- [Examples](#examples)
- [Overview](#overview)
- [Approach](#approach)
- [Principles](#principles)
- [Leveraging the skill](#leveraging-the-skill)
- [Keeping the skill updated](#keeping-the-skill-updated)
- [References](#references)

---

## Motivation

For two decades, frontend engineering accumulated workarounds because CSS
couldn't do the job:

- **Popper.js / Floating UI** existed because CSS couldn't anchor a tooltip to
  a button. → Now it can: **anchor positioning** (Baseline 2026).
- **Masonry.js** existed because grid couldn't waterfall. → **`display:
  grid-lanes`** is landing.
- **Scroll listeners + rAF** powered every parallax and progress bar. →
  **Scroll-driven animations** run off the main thread.
- **FLIP libraries** faked shared-element transitions. → **View transitions**
  are one line of CSS.
- **Sass** existed for nesting, variables, and `darken()`. → Native **nesting,
  custom properties, `color-mix()`, relative color syntax**.
- **jQuery's** killer feature was selecting parents. → **`:has()`** is
  Baseline.
- **autosize.js**, focus-trap libs, dropdown frameworks, ResizeObserver
  component hacks, dark-mode variable duplication, JS contrast pickers… →
  `field-sizing`, `<dialog>`, customizable `<select>`, container queries,
  `light-dark()`, `contrast-color()`.

Most agents (and most humans) still write the 2015 workaround by reflex. LLMs
are trained on a decade of that legacy code, so *by default they over-engineer*:
div-based modals, JS-positioned tooltips, hex-code soup, viewport-width media
queries for component problems. This skill inverts the reflex: **platform
first, JS last**, with a mechanical policy for how far ahead of browser
support it's safe to reach. The result is less code, faster interfaces, better
accessibility (platform primitives carry focus and ARIA semantics for free),
and visibly higher design quality.

## Examples

Four self-contained demos in [`examples/`](examples/) — each is a single HTML
file with zero external resources (open directly via `file://`), built *by an
agent using this skill*, so they double as reference output quality:

| Example | What it proves |
|---|---|
| [`01-sales-landing.html`](examples/01-sales-landing.html) | A complete SaaS landing page: subgrid pricing, `:has()`-driven highlights, scroll-snap testimonial carousel with generated `::scroll-button`s, exclusive `<details name>` FAQ, invoker-opened animated `<dialog>`, guarded scroll-driven reveals, pure-CSS theme toggle |
| [`02-ecommerce-ui.html`](examples/02-ecommerce-ui.html) | A storefront where CSS does the app work: `:has()` filter bar, container-query product cards with style-query variants, anchor-positioned size-guide popover, animated quick-view dialog + cart drawer, skeleton shimmer — ~30 lines of JS total, each line justified in a comment |
| [`03-feature-showcase.html`](examples/03-feature-showcase.html) | "The Modern CSS Show": 11 flashy live demos with code snippets — `@property` conic-gradient hero, edge-flipping anchored popovers, view-transition gallery morphs, oklch color lab with `contrast-color()`, `shape()` blobs, squircles, `sibling-index()` stagger, trig-placed dots, pure-CSS carousel |
| [`04-zen-garden.html`](examples/04-zen-garden.html) | A modern CSS Zen Garden: one semantic HTML document completely re-architected into four designs (Serene editorial / Brutalist / Terminal / Aurora glass) by a pure-CSS `:root:has()` theme switcher — different grids, nav placement, typography — **zero JavaScript** |

## Overview

```
modern-css/
├── SKILL.md                        # The skill itself — philosophy, tier policy,
│                                   #   hack-replacement table, playbooks, workflow
├── README.md                       # You are here — docs for humans
└── references/
    ├── feature-support.md          # Dated Baseline support matrix: Tier A/B/C,
    │                               #   watchlist, known traps (~120+ features)
    └── recipes.md                  # 20 copy-paste production patterns
```

| File | Loaded by the agent | Purpose |
|---|---|---|
| `SKILL.md` | Always (when triggered) | Teaches judgment: what to reach for, in what order, and why |
| `references/feature-support.md` | On demand | Ground truth for "can I use X unguarded?" — the only file that must change as browsers ship |
| `references/recipes.md` | On demand | Correct, accessible, reduced-motion-safe implementations of the common hard parts |

What the skill covers: architecture (`@layer` + oklch design tokens +
logical properties), layout (grid/subgrid/container queries/grid-lanes),
components (dialog, popover + anchor, accordion, carousel, select, forms),
motion (`@starting-style`, view transitions, scroll-driven animation),
performance (`content-visibility`, compositor-only animation, CLS
prevention), accessibility (non-negotiable section), visual craft
(typography, perceptual color, depth, detail), viewport/device reality
(`dvh`, safe-area insets, hover/pointer media queries), and a strict
anti-pattern list.

## Approach

1. **Research-driven.** The skill was built from primary sources: the
   [W3C CSS Snapshot 2026](https://www.w3.org/TR/css-2026/), the
   [Interop 2026](https://wpt.fyi/interop) focus areas,
   [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS), Baseline
   status data ([web.dev/baseline](https://web.dev/baseline),
   [webstatus.dev](https://webstatus.dev)), and browser release notes —
   cross-checked, because blog posts routinely ship stale or wrong support
   claims (e.g. `color-contrast()` "widely supported" — it never shipped;
   masonry articles teaching two dead syntaxes).
2. **A three-tier policy instead of vibes.** Every feature is assigned
   **Tier A** (Baseline Widely Available → use unguarded), **Tier B**
   (Baseline Newly Available → default choice, guard only if absence breaks
   function), or **Tier C** (limited availability → `@supports`-guarded
   progressive enhancement with a working fallback, always). This makes
   "can I use it?" a lookup, not a debate, and makes the skill safe to use
   on production work today.
3. **Teach replacements, not features.** The core artifact is the
   *hack-replacement table*: agents don't need a CSS encyclopedia, they need
   to know that the thing they were about to write in JS has a CSS name now.
4. **Separate the stable from the volatile.** Judgment and principles
   (SKILL.md) change rarely; browser support (feature-support.md) changes
   monthly. They live in separate files so updates are cheap and reviewable.
5. **Craft is in scope.** "Correct" isn't the bar. The skill encodes
   opinionated design guidance — fluid type scales, one-hue oklch palettes,
   layered shadows, purposeful motion — so output looks designed, not
   assembled.

## Principles

The five laws the skill drills into an agent (full text in
[SKILL.md](SKILL.md)):

1. **CSS first, always.** Check the replacement table before writing any UI
   JavaScript. JS is for application logic and data, not layout, positioning,
   theming, state-styling, or scroll behavior.
2. **HTML does more than you think.** `<dialog>`, `popover`,
   `<details name>`, `inert`, invoker commands — semantic, top-layer,
   focus-managed, accessible primitives before div reconstructions.
3. **Declarative beats imperative.** Smaller code, off-main-thread execution,
   no leaked listeners, free accessibility.
4. **Progressive enhancement, never broken baselines.** Tier C features may
   only add polish; unsupported browsers must get a *good* experience, not a
   degraded one. Feature-detect with `@supports`, never UA-sniff.
5. **Design like it matters.** Typographic rhythm, perceptually-even color,
   quiet depth, narrative motion, obsessive detail. Fast and correct is the
   floor, not the goal.

Plus hard non-negotiables: accessibility (focus visibility, contrast,
`prefers-reduced-motion`, reading order, hit targets) and the anti-pattern
list (`!important` fights, pixel media queries for components, div-modals,
layout-measuring JS, hand-tuned hex palettes…).

## Leveraging the skill

The skill is plain Markdown with standard Agent Skill frontmatter
(`name` + `description`), so it works in any harness that can read a file.

### Claude Code

```bash
git clone https://github.com/mikezupper/modern-css-skill.git

# Per-project
mkdir -p .claude/skills && cp -r modern-css-skill .claude/skills/modern-css

# Or globally, for every project
mkdir -p ~/.claude/skills && cp -r modern-css-skill ~/.claude/skills/modern-css
```

Claude Code auto-triggers it on matching work, or invoke explicitly:
`/modern-css`. The `description` frontmatter is the trigger — it fires on any
web UI work (pages, components, layouts, themes, animations, forms…).

### Claude Agent SDK / API

Pass the skill directory via the SDK's skills support, or simply prepend
`SKILL.md` to the system prompt and expose the two reference files for
on-demand reading (they're referenced by relative path from SKILL.md).

### Cursor / Windsurf / Copilot / other agents

Drop the contents into the harness's rules mechanism
(`.cursor/rules/modern-css.md`, `AGENTS.md`, `.github/copilot-instructions.md`,
etc.). If the harness only takes a single file, concatenate:

```bash
cat SKILL.md references/feature-support.md references/recipes.md > modern-css-bundle.md
```

### Getting the most out of it

- **Let it own greenfield UI.** The architecture section (layers → tokens →
  base) is designed to be laid down before the first component.
- **Point it at legacy code.** "Refactor this component per the modern-css
  skill" reliably deletes JS: tooltip libraries → anchor positioning, modal
  frameworks → `<dialog>`, scroll listeners → scroll-driven animations.
- **Ask for the tier when reviewing.** "What tier is every feature you just
  used?" forces the agent to justify guards and fallbacks.
- **Pair it with a design brief.** The craft section sets a quality floor;
  a one-line brand direction ("hue 255, editorial, dense") gives it a target.

## Keeping the skill updated

CSS ships monthly; Baseline moves quarterly; Interop resets yearly. The skill
is built for cheap maintenance: **~95% of updates touch only
`references/feature-support.md`** (move a row between tiers, add a row,
update the date).

### Cadence

| When | What |
|---|---|
| **Every ~6 months** (or before any big project) | Full re-verification pass (procedure below). Next due: **January 2027**. |
| Yearly (March-ish) | New Interop focus areas → refresh the "about to get safer" note |
| Yearly | New W3C CSS Snapshot → re-check §4 "safe to ship pre-CR" list |
| Opportunistic | Chrome "CSS Wrapped" (Dec), WWDC WebKit announcements (June), Firefox release notes |

### Update procedure

1. **Check Baseline movement** at [web.dev/baseline](https://web.dev/baseline)
   monthly digests and [webstatus.dev](https://webstatus.dev):
   - Newly available in all engines → promote **C → B**.
   - ~30 months interoperable (Widely Available) → promote **B → A**.
2. **Scan for new features** in the [MDN CSS reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference),
   Chrome Platform Status, WebKit/Firefox release notes, and the
   [web-features explorer](https://web-platform-dx.github.io/web-features-explorer/).
   For each: add a matrix row (tier, syntax reminder, *which hack it
   replaces*) and, if it changes best practice, a line in the relevant
   SKILL.md playbook and possibly a recipe.
3. **Re-check the Watchlist** section of `feature-support.md` — graduate
   items that shipped, prune abandoned ones.
4. **Verify the "Known traps"** are still true (dead syntaxes, stale claims).
5. **Bump `last-verified`** in SKILL.md frontmatter and the badge above;
   note changes in a CHANGELOG entry / commit message.
6. Fastest path: ask your agent to do it —
   > "Run the update procedure in modern-css/README.md: re-verify every tier
   > assignment in references/feature-support.md against current Baseline
   > data, promote/add/prune features, and bump the last-verified dates."

### Tier promotion rules (mechanical)

```
Limited (some engines)          → Tier C   guard with @supports + working fallback
Baseline Newly Available        → Tier B   default choice; guard only functional breakage
Baseline Widely Available       → Tier A   use unguarded
(~30 months after Newly)
```

## References

Primary sources used to build and verify the skill (also the update sources):

**Specs & status**
- [W3C CSS Snapshot 2026](https://www.w3.org/TR/css-2026/) · [latest snapshot](https://www.w3.org/TR/CSS/)
- [Interop 2026 dashboard](https://wpt.fyi/interop) · [CSS-Tricks: Interop 2026](https://css-tricks.com/interop-2026/)
- [Baseline on web.dev](https://web.dev/baseline) · [webstatus.dev](https://webstatus.dev) · [web-features explorer](https://web-platform-dx.github.io/web-features-explorer/) · [caniuse.com](https://caniuse.com)
- [CSSWG drafts](https://drafts.csswg.org/) · [Open UI](https://open-ui.org/) (customizable select, popover, invokers)

**Documentation**
- [MDN: CSS](https://developer.mozilla.org/en-US/docs/Web/CSS) · [Reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference) · [Layout cookbook](https://developer.mozilla.org/en-US/docs/Web/CSS/How_to/Layout_cookbook) · [mdn/css-examples](https://github.com/mdn/css-examples)

**Release channels**
- [Chrome CSS Wrapped](https://chrome.dev/css-wrapped-2025/) · [Chrome Platform Status](https://chromestatus.com) · [WebKit blog](https://webkit.org/blog/) · [Firefox release notes](https://www.mozilla.org/firefox/releases/)

**Articles that seeded the feature list** (verified & corrected during research)
- [LogRocket: CSS in 2026](https://blog.logrocket.com/css-in-2026/)
- [20 Modern CSS Features](https://allahabadi.dev/blogs/css/20-modern-css-features/)

## License

Text and markup licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

---

*Built 2026-07-22 · tiers verified against Baseline, Interop 2026, and the
W3C CSS Snapshot 2026 · re-verify by January 2027.*
