# DevLabs Launch Video — Audio & Music Spec

Use this document to generate background music and SFX that sync with the Remotion launch film (`LaunchVideo`, 55s @ 30fps).

---

## Video rhythm summary

| Time | Scene | Visual hit (sync point) |
|------|-------|-------------------------|
| 0:00 | Cold open | Title slam — ENGINEER appears |
| 0:04 | Cold open | Orange strike-through + particle burst |
| 0:05 | Cold open | BUILDER replaces ENGINEER |
| 0:06 | Enemy | Hard cut — résumé grid scroll begins |
| 0:12 | Turn | **Beat drop #1** — orange wipe, DevLabs logo |
| 0:16 | Agent | Search bar focus — typing starts |
| 0:18 | Agent | **Beat drop #2** — search submit, cards rank in |
| 0:22–0:28 | Agent | Staggered card snaps (3 hits, ~0.4s apart) |
| 0:29 | Proof | Résumé dissolve → proof profile |
| 0:36 | Trials | "Generate trial" button click |
| 0:40 | Trials | Submission stamp — SUBMITTED |
| 0:42 | OS | Kanban card glides across columns |
| 0:48 | Secret | Dark act — iMessage bubbles (2 pops) |
| 0:52 | Close | Final CTA — "Hire builders, not resumes" |

---

## Music generation prompt (copy-paste)

Use with Suno, Udio, Soundraw, or similar:

```
Modern SaaS product launch instrumental, 55 seconds, 120 BPM.

Style: kinetic typography film score meets indie-electronic hype. Think Linear launch video meets Stripe Sessions energy — clean, confident, founder-facing, NOT corporate elevator music.

Structure:
- 0:00–0:06: Minimal intro — soft kick + muted synth pad on cream/warm tone. Tension build. Single tom roll into first hit at 0:06.
- 0:06–0:12: Tight lo-fi beat enters — crisp hi-hats, muted bass, subtle vinyl texture. Building momentum. Snare on 2 and 4.
- 0:12: FIRST BEAT DROP — full kick + bass + bright synth stab (orange energy). Drop the low end for 0.5s then slam back. This is the "DevLabs reveal" moment.
- 0:12–0:18: Driving groove — syncopated hi-hats, plucky synth arpeggio, light sidechain pump. Fast but not chaotic.
- 0:18: SECOND BEAT DROP — add layered clap + sub bass swell. This hits when UI cards rank on screen. Staccato synth hits on each card snap (0:22, 0:23, 0:24).
- 0:18–0:36: Peak energy section — four-on-the-floor lite, warm analog bass, bright lead stabs every 2 bars. Maintain 120 BPM. Add subtle riser before 0:36.
- 0:36–0:42: Feature burst — percussive clicks and soft glitch textures on "Generate trial" click. Keep groove, add metallic hi-hat rolls.
- 0:42–0:48: Slight filter sweep down — pipeline glide section. Smooth, confident, forward motion. Rolling hi-hats.
- 0:48: Breakdown — strip to kick + pad + distant vocal chop (no lyrics). Dark/warm tone for "seen in the room" scene. Intimate but still hype.
- 0:52: FINAL DROP — biggest moment. Full drums + bass + triumphant synth chord. Resolve on major key. Clean ending at 0:55 with reverb tail (fade by 0:58).

Mood: confident, sharp, modern, editorial. NOT cheesy startup ukulele. NOT generic corporate. NOT trap/aggressive.

Key: D minor → F major resolve at end.
Tempo: 120 BPM (exact — needed for frame sync).
No vocals. No lyrics. Instrumental only.
Mix: punchy low end, crisp transients, -14 LUFS target for social/web.
```

---

## SFX spec (layer on top of music)

Generate or source these one-shots and place at exact timestamps:

| Timestamp | SFX | Description |
|-----------|-----|-------------|
| 0:04.0 | `sfx_strike.wav` | Sharp whoosh + paper tear — ENGINEER strike-through |
| 0:05.0 | `sfx_shatter.wav` | Light glass/particle scatter — 0.3s, high-passed |
| 0:05.2 | `sfx_slam.wav` | Sub thump + impact — BUILDER lands |
| 0:06.0 | `sfx_cut.wav` | Hard scene cut — vinyl stop or digital snap |
| 0:12.0 | `sfx_wipe.wav` | Orange wipe — swoosh L→R, 0.4s |
| 0:12.2 | `sfx_logo.wav` | Logo lock — soft ding + low thud |
| 0:18.0 | `sfx_search.wav` | UI submit — keyboard enter + soft click |
| 0:18.2 | `sfx_card_1.wav` | Card snap #1 — tactile pop |
| 0:18.6 | `sfx_card_2.wav` | Card snap #2 |
| 0:19.0 | `sfx_card_3.wav` | Card snap #3 |
| 0:29.0 | `sfx_dissolve.wav` | Paper dissolve — granular texture, 0.5s |
| 0:36.0 | `sfx_click.wav` | Button click — "Generate trial" |
| 0:40.0 | `sfx_stamp.wav` | Rubber stamp / approval — SUBMITTED |
| 0:42.0 | `sfx_slide.wav` | Smooth UI glide — whoosh, 0.6s |
| 0:48.0 | `sfx_imessage_1.wav` | iMessage send — soft bubble pop |
| 0:49.5 | `sfx_imessage_2.wav` | Reply bubble — slightly higher pitch |
| 0:52.0 | `sfx_final.wav` | Final CTA hit — cymbal swell + sub |

**SFX style guide:** Minimal, modern UI sounds — not gamey. Reference: Apple Keynote transitions, Linear app sounds, Stripe dashboard micro-interactions. Keep SFX 3–6 dB below music bed.

---

## Short prompt for AI music tools (condensed)

```
55s instrumental, 120 BPM, D minor → F major. Modern SaaS launch score.
Beat drops at 0:12 (DevLabs reveal) and 0:18 (UI cards rank). Peak 0:18–0:36.
Breakdown 0:48 (dark intimate). Final drop 0:52 (triumphant resolve).
Kinetic, confident, editorial. No vocals. Punchy kick, crisp hats, warm analog bass.
Like Linear + Stripe launch energy. NOT corporate, NOT ukulele startup.
```

---

## Remotion integration (after music is generated)

1. Place `devlabs-launch-music.mp3` in `packages/launch-video/public/audio/`
2. Add to composition:

```tsx
import { Audio, staticFile } from "remotion";

<Audio src={staticFile("audio/devlabs-launch-music.mp3")} volume={0.85} />
```

3. Optional: layer SFX as separate `<Audio>` components with `startFrom` frame offsets matching the table above.

---

## Beat map (frames @ 30fps)

See `src/theme.ts` → `beatMap` for programmatic sync if building a beat-reactive version later.
