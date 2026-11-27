# Kiro Execution Playbook (Based on Brian Beach's Kiroween 2026 Session)

Follow these steps as soon as you open this folder in **Kiro IDE** so your repo and demo hit every signal judges look for:

1. **Refine Specs Inside Kiro (Don't Submit As-Is):**
   - Open `.kiro/specs/risk-engine/requirements.md` and run Kiro's **analyze requirements** / spec correctness check.
   - Make **one deliberate mid-spec change** (for example, adding a "Tractor RTK vs Survey Drone" sensitivity preset) and screenshot the resulting spec diff for your write-up and demo video.
2. **Show Multi-Model Review in a Clean Context Window:**
   - Use **Claude** for feature implementation tasks.
   - Open a **fresh chat/context window** and run `@physicist` or `@skeptic` with **GPT / Fable** to review `packages/engine/` and polish `README.md` / Devpost docs.
3. **Run the Custom Multi-Agent Workflow & Permissions:**
   - Show `.kiro/workflows/feature-review-pipeline.json` and `.kiro/settings/permissions.json` (granular allow/deny + sandbox) in your write-up.
4. **Use Playwright MCP to Inspect the Live App:**
   - Start `npm run dev`, then ask Kiro to navigate to `http://localhost:3000` via `playwright` MCP, click the **Gannon Storm (May 2024)** tombstone, verify the `REPLAY` badge + Haunted dial, and save a screenshot in `docs/evidence/`.
5. **Show Multiple Kiro Surfaces:**
   - **IDE:** Specs, PBT, hooks, steering, Playwright MCP.
   - **CLI:** Run `kiro-cli` in terminal for spec analysis / headless review (`.github/workflows/kiro-cli-review.yml`).
   - **Web:** Delegate 1–2 background PRs (e.g., Field Mode contrast polish or MapLibre polygon drawer) to Kiro Web so real PR history appears on GitHub.
   - **Kiro Crew:** Push `banshee-watch-crew/` to a **separate public GitHub repo** under the same account for the **Best Kiro Crew App ($1,000)** bonus prize.
