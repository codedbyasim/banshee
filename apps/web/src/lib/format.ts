import type { RiskAssessment, RiskDriver } from "@banshee/engine";
import { COPY } from "./i18n";

/** Render an engine number with its unit, or "unavailable" when the engine gave none (FR-RE-19). */
export function formatMetric(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return COPY.unavailable;
  if (!unit) return String(value);
  return unit === "°" ? `${value}°` : `${value} ${unit}`;
}

/** One reason line: the engine label plus its metric, or "unavailable" for a null metric. */
export function formatReason(r: RiskDriver): string {
  return `${r.label} (${formatMetric(r.metricValue, r.unit)})`;
}

export interface ReplayView {
  /** Always "REPLAY" so archived data is never mistaken for live conditions. */
  badge: string;
  label: string | null;
  archiveIso: string | null;
  /** True when the engine rejected the replay (FR-RE-22). */
  unverified: boolean;
  invalidReason: string | null;
}

/** Replay banner data, taken only from engine output. Null when not a replay. */
export function replayView(a: RiskAssessment): ReplayView | null {
  if (!a.isReplay) return null;
  const unverified = a.replayState === "unverified";
  return {
    badge: COPY.replayBadge,
    label: a.replayLabel ?? null,
    archiveIso: a.replayArchiveIso ?? null,
    unverified,
    invalidReason: unverified ? (a.replayInvalidReason ?? COPY.unavailable) : null,
  };
}
