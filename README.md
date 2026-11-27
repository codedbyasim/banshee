# Banshee — Kiroween 2026 (Frankenstein Category)

> **Banshee wails before solar storms break your GPS, warning farmers and drone pilots.**

Banshee stitches together real-time plasma sensors on spacecraft 1.5 million km upstream at Lagrange point L1 (`SOLAR-1`, `ACE`, `IMAP`), NOAA's 10-minute global ionosphere map (`GloTEC`), per-satellite GNSS line-of-sight geometry (`CelesTrak` + SGP4), a low-latitude post-sunset scintillation rule for regions like Pakistan and India, a grounded AI explainer (Amazon Bedrock), and a Kiro Crew watchdog bot into one plain-language **Safe / Uneasy / Haunted** decision for your exact field and time.

## Quickstart (4 Commands)

```bash
npm install
npm test
npm run typecheck
npm run dev
```

Open `http://localhost:3000` to explore the Mission Planner UI, Haunted Sky Plot, and one-click **Graveyard of Storms** replays (including the May 10, 2024 Gannon storm).

## Opening Directly in Kiro

1. Open this root folder in **Kiro IDE** (`File -> Open Folder`).
2. Kiro automatically loads:
   - **8 Steering docs** in `.kiro/steering/` (`product.md`, `tech.md`, `structure.md`, `space-physics.md`, `honesty.md`, `haunt-design.md`, `aws-deploy.md`, `data-sources.md`)
   - **7 EARS Specs** in `.kiro/specs/` (including `bugfix-longitude-wrap/`)
   - **8 Agent Hooks** in `.kiro/hooks/` (PBT on save, deploy guard, `.kiro` gitignore guard, journal logger)
   - **4 Custom Agents** in `.kiro/agents/` (`physicist`, `data-wrangler`, `haunt-designer`, `skeptic`)
   - **Custom MCP Server** (`swpc-mcp`) in `.kiro/settings/mcp.json`
   - **Custom Space Weather Kiro Power** in `.kiro/powers/space-weather/`

## Architecture

- `packages/engine`: Pure, DOM-free TypeScript physics & risk engine + 9 `fast-check` property-based tests.
- `packages/feeds`: Defensive parsers & live fetchers for NOAA SWPC, GloTEC, CelesTrak + real archived storm replays.
- `packages/swpc-mcp`: Custom stdio MCP server exposing live space-weather tools to Kiro.
- `apps/web`: Next.js + Tailwind UI with Banshee Dial, Haunted Sky Plot, Omens Timeline, Storm Graveyard, Sunlight Field Mode, and Web Audio wail (English-only).
- `infra`: AWS CDK stack (Lambda, EventBridge Scheduler, DynamoDB, S3, API Gateway, Bedrock IAM).
- `banshee-watch-crew`: Starter Kiro Crew bot (push to a separate public GitHub repo under the same account for the **Best Kiro Crew App** bonus prize).

## Disclaimers & Third-Party Disclosures

- **Educational / Advisory Heuristic:** Banshee's 0–100 risk score is a physically motivated heuristic based on public data. It is **not** certified for aviation or safety-of-life navigation.
- **Open-Source Libraries:** Next.js, React, Tailwind CSS, TypeScript, Vitest, fast-check, satellite.js, AWS CDK, `@modelcontextprotocol/sdk`.
- **Public Data Sources:** See `docs/data-sources.md` for full URLs and licenses (NOAA SWPC, CelesTrak, NASA OMNI, GFZ Potsdam).
