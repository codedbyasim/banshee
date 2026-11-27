---
inclusion: always
---

# Banshee — Technical Stack & Engineering Standards

## Stack
- **Monorepo:** npm workspaces (`packages/engine`, `packages/feeds`, `packages/swpc-mcp`, `apps/web`, `infra`).
- **Language:** TypeScript 5+ with `strict: true`, `noUncheckedIndexedAccess: true`.
- **Core Engine (`packages/engine`):** Pure, DOM-free TypeScript library using `satellite.js` (SGP4) for GNSS propagation and `fast-check` + `vitest` for property-based testing (PBT).
- **Data Feeds (`packages/feeds`):** Defensive TypeScript parsers and fetchers for NOAA SWPC RTSW (L1 solar wind), NOAA GloTEC (10-min global TEC), NOAA Kp forecast, CelesTrak GNSS GP JSON, NASA OMNI 1-min, and GFZ Kp history.
- **MCP Server (`packages/swpc-mcp`):** Custom stdio MCP server using `@modelcontextprotocol/sdk`.
- **Frontend (`apps/web`):** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, custom SVG Haunted Sky Plot, Web Audio API synthesized wail (zero copyrighted audio).
- **Backend / Infra (`infra`):** AWS CDK v2 (TypeScript) deploying Lambda (Node 20), EventBridge Scheduler, DynamoDB, S3, API Gateway, and Amazon Bedrock (Strands agent) IAM roles.

## Non-Negotiable Rules
1. `packages/engine` MUST remain 100% DOM-free and side-effect-free so all physics and scoring invariants can be property-tested with `fast-check`.
2. Never hardcode API keys, AWS credentials, or secrets in code or `.kiro/`.
3. Never add `.kiro/` or any of its subdirectories to `.gitignore`.
4. Every external numeric claim in AI explanations MUST pass `verifyGroundedNumbers()`.
