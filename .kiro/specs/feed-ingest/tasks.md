# Tasks: Feed Ingest
- [x] 1. Define defensive parsers for RTSW, GloTEC, Kp, and CelesTrak GP JSON
- [x] 2. Add archived storm replay datasets (Gannon 2024, Halloween 2003, Nov 2025, Jan 2026)
- [x] 3. Add live SWPC/GloTEC/CelesTrak fetchers with timeout handling
- [x] 4. Add `fast-check` parser robustness property tests (`tests/parsers.pbt.test.ts`)
- [ ] 5. Wire EventBridge-triggered Lambda handler in `infra/` to persist snapshots to S3 + DynamoDB
