---
inclusion: fileMatch
fileMatchPattern: "apps/web/**/*.tsx"
---

# Banshee — Haunted Design System & Accessibility

## Design Tokens
- **Canvas background:** `#07090F` (midnight slate) in Haunted Mode; `#FFFFFF` with `#0B0F19` text in Sunlight Field Mode.
- **Semantic risk colors (ALWAYS paired with text label + icon shape):**
  - `Safe`: `#22C55E` (emerald) + Calm crescent/check icon
  - `Uneasy`: `#F59E0B` (amber) + Warning triangle / uneasy eyes
  - `Haunted`: `#A855F7` / `#EF4444` (spectral violet-crimson) + Wailing banshee / alert diamond
- **Typography:** Clean sans-serif for field readability; tabular monospace (`font-mono tabular-nums`) for all coordinates, lead times, TECU, and Bz values.

## Functional Spooky Elements
- **Banshee Dial:** Ghost face expression shifts dynamically across `Safe` / `Uneasy` / `Haunted`.
- **Haunted Sky Plot:** Radar view of visible GNSS satellites; clean satellites glow solid emerald; satellites whose line-of-sight pierces disturbed TEC fade into translucent violet ghosts.
- **Graveyard of Storms:** Interactive tombstones for real historical storms — clicking triggers a labelled `REPLAY`.

## Accessibility Requirements
- WCAG 2.1 AA contrast (`>= 4.5:1` for body text) in both Haunted Mode and Field Mode.
- Honour `prefers-reduced-motion` and provide a manual Reduced Motion toggle.
- Web Audio wail MUST only play after an explicit user click and have a persistent mute toggle.
