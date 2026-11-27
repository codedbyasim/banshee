# Design: Feed Ingest

- Pure parser functions in `packages/feeds/src/parsers.ts` accept `unknown` inputs and return typed `{ valid: T[]; invalidCount: number; newestTimestampIso: string | null }`.
- Live HTTP fetchers in `packages/feeds/src/fetchers.ts` use `fetch` with a 10-second timeout and graceful fallback.
- Archived replay snapshots in `packages/feeds/src/replays.ts` encode real historical numbers (NASA OMNI 1-min + GFZ Kp).
