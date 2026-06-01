# Model Selection — Context

## 2026-06-01

**Decision: query parameter over request body field**
Using `?model=` works uniformly across both endpoints regardless of body format (JSON vs multipart). Adding it to the JSON body would be inconsistent with the multipart endpoint, and adding a separate form field to the multipart endpoint adds complexity for no benefit.

**Decision: no server-side model allowlist**
The Gemini API already validates model names and returns a clear error. Adding a server-side allowlist would require updating the service every time Google releases a new model. Letting invalid names propagate to the API keeps the service model-agnostic.

**Decision: `MODEL` env var (not positional arg) for shell scripts**
`transcribe-file.sh` already has two positional args (`FILE`, `OUTPUT`). Adding a third would force users to always specify `OUTPUT` to reach the model arg. An env var keeps the interface clean and is consistent with `TRANSCRIBE_HOST`.
