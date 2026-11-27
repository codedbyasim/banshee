---
inclusion: manual
---

# AWS Deployment Runbook (`/aws-deploy`)

1. Run full verification first:
   ```bash
   npm run typecheck
   npm test
   ```
2. Bootstrap CDK (first time per AWS account/region):
   ```bash
   cd infra && npx cdk bootstrap
   ```
3. Synthesize and inspect diff:
   ```bash
   npx cdk synth
   npx cdk diff
   ```
4. Deploy stack (requires AWS credentials in environment, never committed):
   ```bash
   npx cdk deploy --require-approval broadening
   ```
5. Record the output `ApiUrl` in `apps/web/.env.local` as `NEXT_PUBLIC_BANSHEE_API_URL` and deploy `apps/web` to AWS Amplify Hosting (or Vercel/Cloudflare Pages as mirror).
6. Verify `/health` and `/assess` endpoints return HTTP 200 and live data age is shown.
