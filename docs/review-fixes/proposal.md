# Review Fixes — Proposal

## Background

A code review of the Phase 1 & 2 implementation (commits `14f6f63`–`e9bfc50`) identified 13 issues ranging from a definite Promise-hang bug to security hygiene. These must be resolved before Phase 3 (Copilot Web integration) begins, because the bugs affect production correctness and the security gaps become more relevant once the service is reachable from another application.

## Goals

- Fix all three hang/data-loss bugs that can silently break requests in production.
- Resolve the four correctness issues that produce wrong behaviour under realistic inputs.
- Harden the Dockerfile and test tooling against known risks.

## Non-Goals

- Phase 3 Copilot Web integration work — that remains on the Phase 3 tasks list.
- Adding authentication middleware — the service is Tailscale-only; auth is documented as a conscious omission, not implemented here.
- Implementing the deferred features (Redis caching, SQLite, GDrive, local upload).

## Design Principles

- **Surgical fixes only** — each change is the minimum edit that resolves the identified issue. No refactoring beyond what the fix requires.
- **Fail fast and loudly** — missing config or bad state should produce clear errors, not silent degraded behaviour.

## Constraints

- Must pass `docker compose up --build` without error.
- No new runtime dependencies.
