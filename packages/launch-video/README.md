# DevLabs Launch Video (Remotion)

Graphical ~75s product launch film: **hire builders, not resumes**.

## Compositions

| ID | Duration | Use |
|----|----------|-----|
| `LaunchVideo` | 75s (2250 frames @ 30fps) | Full feature launch |
| `LaunchVideoShort` | 30s (900 frames) | Social cut-down |

## Scenes

1. Cold open — ENGINEER → BUILDER
2. Enemy — keyword→resume matching grid
3. Turn — DevLabs positioning
4. Founder Agent — typed query → evidence-ranked shortlist
5. Proof — résumé dissolves into proof profile + why panel
6. Trials — generate trial → submission
7. OS — Recommended → Outreach → Trial → Hired
8. Secret — seen in the room + iMessage
9. Close — Hire builders, not resumes

## Commands

```bash
cd packages/launch-video
bun install
bun run studio          # preview in Remotion Studio
bun run render          # full 1080p MP4 → out/devlabs-launch.mp4
bun run render:preview  # half-res faster preview render
```

## Brand

- Cream `#fbf6f3`
- Orange `#ff7417`
- Ink `#111111`
