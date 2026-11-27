import type { FeedStatuses, RiskAssessment, RiskDriver } from "./types.js";
import {
  buildExplainerEchoes,
  buildGroundedEchoes,
  buildGroundedMap,
  verifyGroundedNumbers,
} from "./grounding.js";

/** Human feed labels used in the staleness notice (no raw feed keys leak to users). */
const FEED_LABELS: Record<keyof FeedStatuses, string> = {
  solarWind: "solar wind",
  glotec: "GloTEC",
  kp: "Kp",
  gnss: "GNSS orbits",
};

const MAX_FEED_AGE_MINUTES: Record<keyof FeedStatuses, number> = {
  solarWind: 30,
  glotec: 45,
  kp: 180,
  gnss: 2880,
};

function isFreshAge(age: number | null, max: number): boolean {
  return typeof age === "number" && Number.isFinite(age) && age >= 0 && age <= max;
}

/**
 * Names of stale feeds with their age or "missing", from the structured `feeds` block only
 * (FR-RE-29). "missing" means no age; otherwise the integer-minute age is printed, which is
 * grounded because it equals `feeds.*.ageMin` in the allowlist.
 */
function staleFeedPhrases(feeds: FeedStatuses): string[] {
  const out: string[] = [];
  (Object.keys(FEED_LABELS) as Array<keyof FeedStatuses>).forEach((key) => {
    const age = feeds[key].ageMin;
    if (!isFreshAge(age, MAX_FEED_AGE_MINUTES[key])) {
      if (typeof age === "number" && Number.isFinite(age) && age >= 0) {
        out.push(`${FEED_LABELS[key]} ${age} min`);
      } else {
        out.push(`${FEED_LABELS[key]} missing`);
      }
    }
  });
  return out;
}

/** Render a driver's metric value with its unit, or "unavailable" when null (FR-RE-19). */
function driverMetric(d: RiskDriver): string {
  if (d.metricValue === null) return "unavailable";
  return `${d.metricValue} ${d.unit}`.trim();
}

/**
 * Deterministic, English-only grounded explanation (FR-RE-28..32).
 *
 * Every number printed here is a structured engine field, except digits inside exact
 * echoes from `buildExplainerEchoes` (replay label, archive timestamp, reason texts), so the
 * output passes `verifyGroundedNumbers(text, buildGroundedMap(a), { verbatim:
 * buildGroundedEchoes(a) })`. Echoed strings are `safeText`-processed.
 */
export function explainAssessment(assessment: RiskAssessment): string {
  const parts: string[] = [];
  // The same strings are handed to the verifier as verbatim echoes (FR-RE-27, FR-RE-32).
  const echoes = buildExplainerEchoes(assessment);

  // Replay wording: "archive" not "live", REPLAY badge, archive timestamp (FR-RE-30).
  if (assessment.isReplay) {
    const label = echoes.replayLabel ? ` ${echoes.replayLabel}` : "";
    const stamp = echoes.replayArchiveIso ? ` Archive timestamp ${echoes.replayArchiveIso}.` : "";
    if (assessment.replayState === "unverified") {
      const reason = echoes.replayInvalidReason ? ` ${echoes.replayInvalidReason}` : "";
      parts.push(`REPLAY unverified archive:${label}.${stamp}${reason}`);
    } else {
      parts.push(`REPLAY archived scenario (historical, not real-time):${label}.${stamp}`);
    }
  }

  parts.push(`Status is ${assessment.level} (score ${assessment.score}).`);

  parts.push(
    `${assessment.cleanSatellites} of ${assessment.visibleSatellites} visible GNSS satellites are clean (${assessment.ghostSatellites} ghosted).`
  );

  const leadStr = assessment.leadTimeMinutes !== null ? `${assessment.leadTimeMinutes} min` : "unavailable";
  parts.push(`Upstream L1 lead time: ${leadStr}.`);

  const vtecStr = assessment.meanVtec !== null ? `${assessment.meanVtec} TECU` : "unavailable";
  parts.push(`Regional ionosphere estimate: mean vertical TEC ${vtecStr}.`);

  // Primary driver metric, rendered by value+unit so it stays grounded (null -> "unavailable").
  const primary = assessment.topReasons[0];
  if (primary) {
    parts.push(`Primary driver ${primary.code}: ${driverMetric(primary)}.`);
  }

  // Preset: describe gain as a sensitivity multiplier (FR-RE-31).
  if (assessment.preset) {
    parts.push(
      `Preset ${assessment.preset.id}: elevation mask ${assessment.preset.elevationMaskDeg} degrees, sensitivity multiplier ${assessment.preset.gain}.`
    );
  }

  // Staleness notice: name each stale feed with age or "missing" (FR-RE-29).
  if (assessment.isStale && assessment.feeds) {
    const phrases = staleFeedPhrases(assessment.feeds);
    if (phrases.length > 0) {
      parts.push(
        `Stale feeds (${phrases.join(", ")}); lead time and TEC are not current, so the status cannot be Safe.`
      );
    } else {
      parts.push("Data integrity issue flagged this assessment, so the status cannot be Safe.");
    }
  }

  // Preset fallback reasons (FR-RE-31), echoed exactly as listed for the verifier.
  if (echoes.unknownPresetReason) parts.push(echoes.unknownPresetReason);
  if (echoes.customMaskDefaultedReason) parts.push(echoes.customMaskDefaultedReason);

  parts.push(
    "This score is an advisory heuristic, not a trained ML model, and is not certified for aviation or safety-of-life navigation."
  );

  return parts.join(" ");
}

/**
 * Convenience wrapper that builds the explanation and confirms it is self-grounded
 * (FR-RE-28). Returns the text plus the grounding verdict for callers that want to assert it.
 */
export function explainAssessmentVerified(assessment: RiskAssessment): {
  text: string;
  grounded: boolean;
  ungrounded: number[];
} {
  const text = explainAssessment(assessment);
  const result = verifyGroundedNumbers(text, buildGroundedMap(assessment), {
    verbatim: buildGroundedEchoes(assessment),
  });
  return { text, grounded: result.ok, ungrounded: result.ungrounded };
}
