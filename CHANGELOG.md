# Changelog

## [Unreleased]
- Scope change (FR-RE-33): Banshee is English-only. Removed the second UI language, its right-to-left layout and the language toggle; Field Mode stays.
- `apps/web` renders null engine metrics as "unavailable", shows the unverified-archive state with its reason, and shows invalid-input and no-visible-satellite banners.

## [1.0.0] - 2026-11-26
- Initial Kiroween 2026 monorepo scaffold with full `.kiro/` setup (steering, 7 EARS specs, 8 hooks, 4 custom agents, `swpc-mcp`, and `space-weather` Kiro Power).
- Implemented `@banshee/engine` physics, IPP 350 km geometry, bilinear GloTEC sampler, monotonic 0–100 scorer, fail-safe staleness rule, grounded explainer, and 9 `fast-check` PBTs.
- Implemented `@banshee/feeds` defensive parsers + May 2024 Gannon, Oct 2003 Halloween, Nov 2025, and Jan 2026 archived storm replays.
- Implemented `@banshee/web` Mission Planner UI (Banshee Dial, Haunted Sky Plot, Omens Timeline, Storm Graveyard, Field Mode, Web Audio wail).
