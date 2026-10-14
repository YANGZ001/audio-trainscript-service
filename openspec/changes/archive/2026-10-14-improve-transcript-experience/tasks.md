## 1. History and reader

- [x] 1.1 Add history search, source filter, counts and visible refresh feedback.
- [x] 1.2 Add accessible transcript reader with copy and TXT/Markdown export, cache invalidation and stale-load guards.

## 2. Completion and operations

- [x] 2.1 Add optional completed-job listing without changing the default API.
- [x] 2.2 Track explicit completions, show result links/highlights, refresh on visibility and avoid overlapping polls.
- [x] 2.3 Check mutation responses and preserve failed jobs and partial retry state with visible errors.

## 3. Verification

- [x] 3.1 Add browser regression coverage for reader/search, explicit completion and failed/partially successful mutations using mocked APIs.
- [x] 3.2 Build/start using Docker Compose, verify health/history preservation and desktop/mobile browser behavior, and validate OpenSpec.

## 4. Reader entry simplification

- [x] 4.1 Remove the redundant history copy button and its unused handler branch; keep reader copy and list deletion.
- [x] 4.2 Rebuild with Docker Compose and verify the existing browser regressions.
