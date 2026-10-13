# Web UI regression checks

Start/build the app with `docker compose up -d --build`, then run:

```sh
NODE_PATH="$(npm root -g)" node test/web-ui/run.cjs
```

Requires the `playwright` package and its Chromium browser (globally installed in the development environment). Set `TEST_BASE_URL` to override `http://localhost:3001`. For unsupported Linux platform detection during browser installation, this environment used `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 playwright install chromium`.

All API calls in this regression script are intercepted, so it does not submit real transcription jobs, invoke Gemini, or mutate persisted history. It exercises title/author search, source filters, empty/loading/error states, keyboard dialog close/focus, literal transcript rendering, TXT/Markdown export contents, clipboard feedback, cache reuse/invalidation, late reader responses, deletion feedback, explicit completion and cancellation distinction, retry submission failure/partial cleanup, polling errors, submission/poll races, and mobile overflow.

Live validation also confirmed that the rebuilt service retained all 31 history entries, an existing transcript opens successfully, health responds OK, and the default jobs API remains active-only. The optional completed listing was verified in an isolated in-memory database inside the Compose container. No real-provider transcription was initiated for this change.

Desktop/mobile and reader screenshots are saved outside the repository at `/mnt/nas/media/codex-artifacts/audio-transcript-体验审查/`.
