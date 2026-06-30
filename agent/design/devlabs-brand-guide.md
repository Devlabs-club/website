# DevLabs Landing Page Brand Guide

<!-- @scry.entry
id: design.devlabs-brand-guide
kind: design
summary: Current DevLabs landing page vibe, brand system, and brand kit for agent-readable design work.
status: active
weight: 0.9
tags: [brand:devlabs, design:landing-page, ui:brand-kit, product:hiring]
rationale: "Keep future landing page and marketing work aligned with the current DevLabs visual language."
applies: "landing page updates, marketing pages, founder hiring flows, DevLabs public brand work"
seeded_questions: []
depends_on: []
design_requirements: DR1..DR12
updated: 2026-06-29
@scry.entry.end -->

**Concept**: Agent-readable brand, vibe, and visual system guide for the current DevLabs landing page.
**Created**: 2026-06-29

---

## Overview

This guide captures the current DevLabs landing page brand system as implemented on the public homepage. Future agents should use this before changing the landing page, creating related marketing surfaces, or extending the founder/builder hiring experience.

The current brand is not generic SaaS. It is a warm, editorial hiring product for founders who want builders with real shipped proof.

### DR1: Core Brand Idea

DevLabs should feel like **warm editorial hiring intelligence for founders who care about shipped proof**.

The landing page mixes:

- Natural warmth: meadows, sunlight, cream paper, human community.
- Technical precision: grids, linework, search UI, ASCII effects, metrics.
- Founder urgency: blunt claims, oversized black type, direct CTAs.
- Proof culture: shipped projects, hackathons, founder notes, live demos, work trials.

Core phrase: **proof, not resumes**.

---

## Positioning

### DR2: Product Position

DevLabs is not a job board, resume database, or generic community page. It sells access to builders who have already been observed shipping real work through DevLabs events, hackathons, programs, and founder relationships.

Primary audience:

- Founders
- Early startup teams
- Sponsors and operators who need credible technical talent quickly

Primary promise:

- "Tell us who you need, get proof-backed builders, and move to calls or work trials fast."

Emotional promise:

- "Stop guessing from polished PDFs. Hire people who have already proven they can ship."

Functional promise:

- "Founder needs become evidence-ranked shortlists with match reasons and next steps."

---

## Brand Kit

### DR3: Color Tokens

Use these colors as the current DevLabs landing page brand kit.

| Token | Hex | Role | Usage |
|---|---:|---|---|
| `paper` | `#fbf6f3` | Primary page background | Warm editorial base, full-page sections |
| `cream` | `#fffaf7` | Elevated warm surface | Cards, search panels, proof panels |
| `ink` | `#050505` | Primary text | Headlines, strong borders, primary UI text |
| `orange` | `#ff7417` | Primary brand/action color | CTAs, active states, proof signals, ASCII glow |
| `burnt-orange` | `#bf4f08` | Warm text accent | Chips, labels, secondary orange text |
| `selection-blue` | `#168df7` | Design-tool accent | Hero selection handles and selected-object framing only |
| `charcoal` | `#1a1a1a` | Dark cards | Metrics, CTA hover states, high-contrast panels |
| `night` | `#0d0a09` | Dark closing act | Testimonials/footer background |
| `meadow-green` | `#c6d99b` | Organic accent | Metrics and ecosystem proof tiles |
| `deep-green` | `#20311d` | Green text | Text on meadow-green surfaces |
| `soft-orange-bg` | `#fff5ef` | Signal chip background | Orange-tinted badges and chips |
| `sky-wash` | `#cfe6e9` | Hero image fallback | Soft scenic image backing |

Opacity rules:

- Use black at 55-68% opacity for body copy.
- Use black at 8-12% opacity for borders and grid lines.
- Use white at 4-12% opacity for dark testimonial cards.
- Use orange sparingly but repeatedly as the signal/action thread.

### DR4: Color Usage Rules

Do:

- Use `paper` as the dominant page background.
- Use `ink` for large claims and core UI structure.
- Use `orange` for actions, active proof signals, section energy, and hover states.
- Use `selection-blue` only when evoking design-tool selection or curation.
- Use `night` for the cinematic closing section.

Do not:

- Turn the page into a blue/purple SaaS palette.
- Use `selection-blue` as a generic link or CTA color.
- Overuse orange as a full-page wash outside deliberate metric/CTA moments.
- Replace the warm paper base with pure white.
- Introduce heavy beige/brown palettes that make the site feel vintage instead of sharp.

---

## Typography

### DR5: Type System

Primary typeface:

- `Manrope`, loaded globally through `src/layouts/Layout.astro`.

Current type direction:

- Huge black editorial headlines.
- Heavy weights for decisive words: "builders", "ship", "broken".
- Tight headline line-height, usually around `0.9` to `1.18`.
- Small uppercase section labels with wide tracking.
- Medium-weight body copy with generous line-height.

Headline guidance:

- Use blunt, short claims.
- Make the main message poster-sized.
- Emphasize proof words with heavy weight, not gradients.
- Avoid decorative type except where the existing app already has a clear reason.

Body copy guidance:

- Keep body text clear and founder-native.
- Use muted black (`text-black/58`, `text-black/62`, `text-black/68`) instead of gray-blue.

---

## Layout System

### DR6: Layout Language

The current layout is an editorial grid with technical overlays.

Use:

- Centered `max-w-7xl` page sections.
- Thin black borders at low opacity.
- Ruler rails and vertical grid lines.
- Hard-edged panels for proof and credibility.
- Large vertical spacing between major story beats.
- Mostly square or lightly rounded UI panels.
- Rounded scenic hero/CTA frames only when the image needs softness.

Avoid:

- Nested card stacks.
- Generic rounded SaaS cards everywhere.
- Floating decorative cards unrelated to proof.
- Landing-page hero split layouts.
- Dense paragraphs that dilute the blunt brand voice.

---

## Imagery

### DR7: Image Direction

The current landing imagery is soft, bright, natural, and optimistic.

Use imagery that feels:

- Bright daylight.
- Airy and open.
- Meadow, wildflower, lavender, green hill, or golden-hour inspired.
- Slightly surreal/editorial rather than stock.
- Calm enough to support overlaid product UI.

Avoid:

- Dark startup office stock.
- Neon AI/cyberpunk imagery.
- Generic laptop desk shots.
- Blurry atmospheric photos where the subject cannot be understood.
- Corporate handshake or conference imagery.

Current landing assets live in `public/landing/` and are documented in `public/landing/README.md`.

---

## UI Motifs

### DR8: Reusable Visual Motifs

The current page uses these motifs to make the brand recognizable:

- Search input as the central product metaphor.
- Builder/result cards as proof units.
- Evidence chips such as "Shipped projects", "Hackathon finalist", and "Available this week".
- Blue selection dots and corner squares around the hero image.
- ASCII stars, waves, and ripples as technical atmosphere.
- Thin border grids and linework as system-of-record credibility.
- Large metric tiles as ecosystem proof.
- Logo grids for credibility, rendered mostly monochrome.

When creating new sections, prefer extending one of these motifs before inventing a new visual language.

---

## Motion

### DR9: Motion Principles

Motion should feel like signal resolving into proof.

Current motion patterns:

- Hero nav/headline/card reveal.
- Typewriter search animation.
- Cursor path over the search box.
- Loading dots and result cards appearing after search.
- Scroll-reactive panels.
- Count-up metrics.
- ASCII star/wave/ripple canvas effects.
- Slow marquee profile cards in the role-search section.

Rules:

- Tie animation to search, matching, discovery, credibility, or proof.
- Honor `prefers-reduced-motion`.
- Avoid decorative motion that does not clarify the product story.
- Keep motion smooth and editorial, not game-like.

---

## Voice And Copy

### DR10: Voice

The voice is direct, founder-native, and allergic to generic marketing fluff.

Use language like:

- builders
- ship
- proof
- signal
- shortlist
- work trial
- founder-ready
- real projects
- live demos
- events
- community momentum
- evidence-ranked

Avoid language like:

- world-class talent marketplace
- AI-powered hiring solution
- unlock your potential
- seamless end-to-end platform
- next-generation ecosystem
- revolutionary community

Good current examples:

- "Hire builders who can actually ship"
- "Hiring through resumes is broken."
- "Tell the agent what you need."
- "From hiring need to builder intro in days."
- "Stop hiring from resumes"
- "Hire with proof"

---

## CTA System

### DR11: Calls To Action

Current primary CTAs:

- "Hire now"
- "Hire with proof"
- "Hire talent"

CTA rules:

- Keep CTAs short and action-oriented.
- Use orange for navigation/action emphasis in light sections.
- Use white or charcoal pills only in the final dark/image CTA.
- Prefer proof-oriented phrasing over generic conversion language.

Avoid:

- "Get started today"
- "Learn more" as a primary CTA
- "Book a demo" unless the flow actually books a demo

---

## Implementation References

### DR12: Source Of Truth

Current implementation references:

- Homepage source: `src/pages/index.astro`
- Layout and global font loading: `src/layouts/Layout.astro`
- Global styles and app surface utilities: `src/styles/global.css`
- Landing imagery: `public/landing/`
- Landing image notes: `public/landing/README.md`

Important homepage anchors:

- Main page shell and colors: `src/pages/index.astro`
- Hero, search mock, and selection handles: `src/pages/index.astro`
- Credibility/logo grid: `src/pages/index.astro`
- Metrics and proof tiles: `src/pages/index.astro`
- Agent/search section: `src/pages/index.astro`
- How-it-works section: `src/pages/index.astro`
- Dark testimonial and footer CTA section: `src/pages/index.astro`

---

## Practical Guidance For Future Agents

Before changing DevLabs public brand surfaces:

1. Read this guide.
2. Inspect the current page in `src/pages/index.astro`.
3. Preserve the proof-backed hiring position unless the user explicitly asks for a repositioning.
4. Reuse existing tokens, imagery direction, and motifs.
5. Verify responsive layout after changes.

When in doubt, optimize for this sentence:

> DevLabs helps founders hire builders from proof, not resumes.

**Status**: Active
**Recommendation**: Treat this as the working brand kit for DevLabs landing page and adjacent public hiring pages.
