# Design: Banshee Voice
- `packages/engine/src/explainer.ts` extracts allowed numeric tokens from `RiskAssessment`, invokes Amazon Bedrock (when `AWS_REGION` & model ID are configured), validates output with `verifyGroundedNumbers()`, and falls back to a deterministic grounded template if any number is invented.
