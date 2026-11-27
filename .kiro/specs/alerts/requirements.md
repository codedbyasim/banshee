# Spec: Alerts & Kiro Crew Bot

## Requirements (EARS)
- **FR-AL-1 (Idempotency):** WHEN the same storm event ID is evaluated repeatedly, THE System SHALL NOT dispatch duplicate alerts.
- **FR-AL-2 (Hysteresis):** WHEN risk score oscillates near a threshold boundary, THE System SHALL apply a 5-point hysteresis band before de-escalating an active alert.
- **FR-AL-3 (Crew Bot):** WHEN a user asks the Banshee Watch Kiro Crew bot a field question (e.g., "Can I fly at 7 PM in Multan?"), THE Bot SHALL evaluate the engine and reply with level, lead time, and top 3 grounded reasons.
