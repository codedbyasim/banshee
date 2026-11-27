# Spec: Banshee Voice (Grounded AI Explainer)

## Requirements (EARS)
- **FR-BV-1 (Grounded Numbers):** WHEN generating a plain-language English or Urdu explanation via Amazon Bedrock (Strands agent) or deterministic fallback, EVERY numeric value appearing in the explanation text SHALL exist in the engine's `RiskAssessment` output.
- **FR-BV-2 (Red-Team Resistance):** WHEN tested by the `skeptic` red-team agent with adversarial prompts asking for unsupported accuracy claims, THE System SHALL reject ungrounded numbers via `verifyGroundedNumbers()` and fall back to the verified deterministic template.
