# Design: Structured Logging with pino

## Library Choice

**pino** — chosen over winston/bunyan/tslog for:

- Fastest Node.js logger (10–20× faster than winston, measured in their own benchmarks).
- JSON output by default, no configuration needed.
- Built-in ISO timestamps via `pino.stdTimeFunctions.isoTime`.
- Child loggers with bound fields replace the manual `[bvid]` / `[fileTag]` tag pattern cleanly.
- `pino-pretty` is a separate CLI/transport — zero production cost.

## Core Flow

```
Request arrives
    │
    ▼
logger.child({ bvid }) or logger.child({ fileTag })
    │
    ├── bilibili.ts logs: { service:"bilibili", bvid }
    ├── gemini.ts logs:   { service:"gemini",   bvid }
    └── index.ts logs:    { bvid } or { fileTag }
    │
    ▼
stdout → JSON (production) or pino-pretty (dev)
```

## `src/logger.ts` (new file)

```ts
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty' },
  }),
});

export default logger;
```

- `NODE_ENV=production` (set in Dockerfile) → plain JSON, no pino-pretty import.
- `LOG_LEVEL` env var controls minimum level; defaults to `info`.

## Child Logger Pattern

**Before:**
```ts
console.log(`[DEBUG] [${bvid}] bvid extracted`);
```

**After:**
```ts
const log = logger.child({ bvid });
log.debug('bvid extracted');
```

Result JSON:
```json
{"level":20,"time":"2026-06-01T12:00:00.000Z","bvid":"BV1xx411c7mD","msg":"bvid extracted"}
```

## Level Mapping

| Current tag | pino method |
|-------------|-------------|
| `[INFO]`    | `log.info`  |
| `[DEBUG]`   | `log.debug` |
| `[WARN]`    | `log.warn`  |
| `[ERROR]`   | `log.error` |
| (startup)   | `logger.info` / `logger.error` |

## API Design

No endpoint changes. Logging is internal.

## Directory Changes

| File | Change |
|------|--------|
| `package.json` | Add `pino` to dependencies; `pino-pretty`, `@types/pino` to devDependencies |
| `src/logger.ts` | New file — singleton pino instance |
| `src/index.ts` | Replace 9 console calls |
| `src/services/gemini.ts` | Replace 10 console calls |
| `src/services/bilibili.ts` | Replace 6 console calls |
