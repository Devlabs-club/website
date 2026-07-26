# devlabs-talent (Buildprint)

Builder-level local analyzer for **DevLabs Buildprint** — your building habits, backed by proof.

```bash
npx devlabs-talent@latest analyze --token <verified-upload-token>
```

## What it measures (methodology `buildprint-0.3.0`)

**Observed facts** (from local Claude Code / Codex / Cursor summaries and configs):

- Substantial sessions (length, duration, or multi-signal activity — not config noise)
- Project bucket diversity (hashed locally; raw paths never uploaded)
- Product / backend / systems / test / recovery session counts
- Context artifacts (rules, agents.md, settings)
- Agent family coverage and time invested

**Normalized signals** use diminishing returns. Keyword spam alone does not produce a high score.

**Earned identities** come from a curated catalog (Product Shipper, Debugging Closer, Full-Stack Owner, …). Titles are never invented by an LLM. Identities require minimum evidence. Agent Orchestrator is deferred until multi-agent overlap telemetry is reliable.

**Evidence Strength** (`emerging` → `exceptional`) describes evidence amount and reliability — not a universal “Founder Fit” quality score.

**Proof language** only states defensible facts, e.g. “Verification activity appeared in 18 of 24 substantial sessions,” not unverifiable success rates.

## Preview & privacy

Use `--color` for the DevLabs terminal theme. The CLI shows a preview before upload and never uploads raw prompts, conversations, source code, secrets, env vars, full paths, or private filenames.

```bash
npx devlabs-talent@latest analyze --token <token> --color
```

After upload, the CLI opens the shareable Wrapped/Buildprint URL. Use `--no-open` to disable.

Defaults: upload API and public URL `https://www.devlabs.club`. Override with `--api`, `--public-url`, or `DEVLABS_API_URL` / `DEVLABS_PUBLIC_URL`.

## Campaign naming

- **Buildprint** — permanent professional artifact
- **Agent Wrapped / Builder Wrapped** — campaign experience and public URL path (`/builder/wrapped/:id`)
