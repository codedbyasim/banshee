import type { RiskLevel } from "./types.js";

/** Plain-language mission decision derived from the engine risk level. */
export type Decision = "GO" | "CAUTION" | "HOLD";

/** Safe -> GO, Uneasy -> CAUTION, Haunted -> HOLD. Total and pure. */
export function levelToDecision(level: RiskLevel): Decision {
  switch (level) {
    case "Safe":
      return "GO";
    case "Uneasy":
      return "CAUTION";
    case "Haunted":
      return "HOLD";
  }
}
