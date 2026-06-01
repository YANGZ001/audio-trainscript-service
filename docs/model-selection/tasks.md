# Model Selection — Tasks

## Phase 1: Service

- [x] Add `model?: string` parameter to `transcribeAudio` in `src/services/gemini.ts`
- [x] Replace hardcoded `GEMINI_MODEL` with `model ?? GEMINI_MODEL` at the `generateContent` call
- [x] Extract `req.query.model` and pass to `transcribeAudio` in `/api/transcribe`
- [x] Extract `req.query.model` and pass to `transcribeAudio` in `/api/upload-transcribe`

## Phase 2: Client Scripts

- [ ] Add `MODEL` env var support to `test.sh`
- [ ] Add `MODEL` env var support to `transcribe-file.sh`

## Phase 3: Docs

- [x] `docs/model-selection/proposal.md`
- [x] `docs/model-selection/design.md`
- [x] `docs/model-selection/tasks.md`
- [x] `docs/model-selection/context.md`
- [x] `docs/model-selection/test_plan.md`
- [ ] Update `USAGE.md`

## Acceptance Criteria

- Calling either endpoint without `?model=` behaves identically to before.
- Calling with `?model=gemini-2.5-flash` uses that model for the Gemini request.
- Calling with an invalid model name streams back an `error` SSE event (not a server crash).
- `MODEL=gemini-2.5-flash ./transcribe-file.sh file.m4a` sends the request with `?model=gemini-2.5-flash`.
