"use client";
import type { RiskAssessment } from "@banshee/engine";
import { COPY } from "@/lib/i18n";
import { formatMetric, replayView } from "@/lib/format";

interface Props {
  assessment: RiskAssessment;
}

/**
 * Replay, staleness and input-validity banners. Every value shown comes from the engine
 * output; nothing here decides risk on the client.
 */
export function AssessmentStatus({ assessment: a }: Props) {
  const replay = replayView(a);
  return (
    <div className="space-y-2">
      {replay && (
        <div
          role="status"
          data-testid="replay-banner"
          className={`rounded-xl border px-4 py-2.5 text-xs font-semibold ${
            replay.unverified
              ? "border-amber-500 bg-amber-950/60 text-amber-100"
              : "border-purple-500 bg-purple-950/60 text-purple-100"
          }`}
        >
          <span className="mr-2 rounded bg-purple-600 px-2 py-0.5 font-black tracking-widest text-white">
            {replay.badge}
          </span>
          {replay.unverified && (
            <span className="mr-2 rounded bg-amber-500 px-2 py-0.5 font-black tracking-widest text-black">
              {COPY.unverifiedArchive}
            </span>
          )}
          {replay.label && <span className="mr-2">{replay.label}</span>}
          <span className="font-mono tabular-nums">
            {COPY.archiveLabel}: {replay.archiveIso ?? COPY.unavailable}
          </span>
          <p className="mt-1">{replay.unverified ? COPY.unverifiedBanner : COPY.replayBanner}</p>
          {replay.invalidReason && <p className="mt-1">{replay.invalidReason}</p>}
        </div>
      )}
      {a.isStale && (
        <div
          role="status"
          className="rounded-xl border border-amber-500 bg-amber-950/60 px-4 py-2.5 text-xs font-semibold text-amber-100"
        >
          {COPY.staleBanner}
        </div>
      )}
      {a.invalidInput && a.invalidInput.length > 0 && (
        <div
          role="alert"
          data-testid="invalid-input"
          className="rounded-xl border border-red-500 bg-red-950/60 px-4 py-2.5 text-xs font-semibold text-red-100"
        >
          {COPY.invalidInputBanner} {a.invalidInput.join(", ")}
        </div>
      )}
      {a.visibleSatellites === 0 && (
        <div
          role="alert"
          data-testid="no-visible"
          className="rounded-xl border border-red-500 bg-red-950/60 px-4 py-2.5 text-xs font-semibold text-red-100"
        >
          No satellites are visible above the {formatMetric(a.preset?.elevationMaskDeg, "°")} mask.
        </div>
      )}
    </div>
  );
}

/** Top reasons with their engine metric; a null metric renders as "unavailable" (FR-RE-19). */
export function ReasonList({ assessment: a }: Props) {
  return (
    <ul className="mt-1 space-y-1.5 text-xs">
      {a.topReasons.map((r) => (
        <li key={r.code} data-code={r.code} className="rounded border border-slate-700/60 px-2.5 py-1.5">
          {r.label}{" "}
          <span className="font-mono tabular-nums opacity-80">[{formatMetric(r.metricValue, r.unit)}]</span>
        </li>
      ))}
    </ul>
  );
}
