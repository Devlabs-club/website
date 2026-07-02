# devlabs-talent

Builder-level local analyzer for DevLabs Agent Wrapped.

```bash
npx devlabs-talent@latest analyze --token <verified-upload-token>
```

Use `--color` to force the DevLabs terminal theme when recording or screenshotting output:

```bash
npx devlabs-talent@latest analyze --token <verified-upload-token> --color
```

After a successful upload, the CLI opens the shareable Wrapped URL in your default browser.
Use `--no-open` to disable that behavior.

The upload API defaults to `https://www.devlabs.club`, and the browser opens the public
Wrapped URL on `https://www.devlabs.club` by default. Use `--api` only for non-production
upload testing, and `--public-url` only if the public web host changes.

The CLI scans safe local AI-agent usage sources across Claude Code, Codex, Cursor, and optional exported summaries. It shows a preview before upload and never uploads raw prompts, raw conversations, source code, secrets, environment variables, full local paths, or private filenames.

Set `DEVLABS_API_URL` to test against a non-production DevLabs app.
