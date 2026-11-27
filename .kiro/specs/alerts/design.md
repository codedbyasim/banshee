# Design: Alerts
- Pure `evaluateAlertTransition()` in `packages/engine/src/risk.ts` handles idempotency and 5-point hysteresis.
- `banshee-watch-crew/` implements the scheduled heartbeat and interactive bot commands for Telegram/Slack.
