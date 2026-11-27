# Banshee Watch — Kiro Crew App (Bonus Prize Repo)

> **Important for Kiroween 2026 Bonus Prize:** Push this folder as its own **separate public GitHub repository** under the **same GitHub account** as your main Banshee submission to qualify for the **Best Kiro Crew App ($1,000)** prize.

## What It Does
- Runs a scheduled heartbeat checking NOAA SWPC L1 solar wind and Kp every 10 minutes.
- Answers natural field queries in Telegram/Slack (e.g., `"Can I fly at 7 PM in Multan?"`) using the `@banshee/engine` risk scorer and `space-weather` Kiro Power.
- Remembers a team's saved fields and suppresses duplicate alerts via idempotent hysteresis.
