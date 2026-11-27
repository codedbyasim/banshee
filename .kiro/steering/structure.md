---
inclusion: always
---

# Banshee — Repository Structure

```text
banshee/
├── .kiro/                      # Committed! Never gitignored.
│   ├── steering/               # Project-wide, auto, fileMatch, and manual steering
│   ├── specs/                  # EARS specs (requirements.md, design.md, tasks.md)
│   ├── hooks/                  # Automated Kiro agent hooks
│   ├── agents/                 # Custom specialized agents (physicist, data-wrangler, haunt-designer, skeptic)
│   ├── settings/mcp.json       # MCP server registry (swpc-mcp, aws-docs, github, playwright)
│   └── powers/space-weather/   # Custom reusable Space Weather Kiro Power
├── packages/
│   ├── engine/                 # Pure TS orbital geometry, IPP, TEC sampling, risk score, PBT suite
│   ├── feeds/                  # Live SWPC/GloTEC/CelesTrak fetchers, defensive parsers, storm replays
│   └── swpc-mcp/               # Custom MCP server exposing live space-weather tools
├── apps/
│   └── web/                    # Next.js mission planner UI (Banshee Dial, Sky Plot, Graveyard, Field Mode)
├── infra/                      # AWS CDK stack (Lambda, EventBridge, DynamoDB, S3, API Gateway, Bedrock)
├── banshee-watch-crew/         # Starter Kiro Crew bot (push to separate public repo for Crew bonus)
├── docs/                       # Data sources, Kiro build journal, session snapshots
├── .github/workflows/          # CI gates + nightly headless Kiro CLI V3 contract check
├── LICENSE                     # MIT License
└── README.md                   # Quickstart, architecture, third-party disclosures
```
