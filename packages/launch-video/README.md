# DevLabs Launch Video (Remotion)

Graphical ~55s product launch film matching the **devlabs.club landing page** design system.

## Brand alignment

| Token | Value | Landing source |
|-------|-------|----------------|
| Cream bg | `#fbf6f3` | `.landing-page` |
| Text | `#050505` | hero + body |
| Orange | `#ff7417` | CTAs, chips, accents |
| Orange dark | `#bf4f08` | chip text |
| Orange tint | `#fff5ef` | chip backgrounds |
| Card | `#fffaf7` | hero result cards |
| Panel | `#f4f1ed` | stats grid |
| Blue selection | `#168df7` | hero card border, corner squares |
| Button dark | `#2f3432` | primary CTA |
| Dark act | `#0d0a09` | testimonials/footer |

**Typography:** Manrope (UI/body) + PP Gatwick (display headlines) — same as landing.

**Patterns:** 24px grid overlay, ruler sections, blue corner squares, orange squiggle underlines, sharp editorial borders.

## Compositions

| ID | Duration | Use |
|----|----------|-----|
| `LaunchVideo` | 55s | Full feature launch |
| `LaunchVideoShort` | 26s | Social cut-down |

## Commands

```bash
cd packages/launch-video
bun install
bun run studio
bun run render          # → out/devlabs-launch.mp4
bun run render:preview  # half-res preview
```

## Audio

See [AUDIO_SPEC.md](./AUDIO_SPEC.md) for music generation prompts, SFX timestamps, and beat-sync map.
