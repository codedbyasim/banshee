"use client";
import {
  levelToDecision,
  MAX_FEED_AGE_MINUTES,
  type Decision,
  type FeedName,
  type RiskAssessment,
} from "@banshee/engine";
import { formatMetric, formatReason } from "@/lib/format";
import { COPY } from "@/lib/i18n";
import type { MissionType } from "./MissionTypeSelector";

interface Props {
  assessment: RiskAssessment | null;
  missionType: MissionType;
  requestFailed: boolean;
  fieldMode: boolean;
}

export const HEADLINES: Record<Decision, string> = {
  GO: "GO — Clear for RTK / Flight",
  CAUTION: "CAUTION — Watch for Drift",
  HOLD: "HOLD — High Risk of RTK Loss",
};

export const ACTION_COPY: Record<MissionType, Record<Decision, string>> = {
  TRACTOR_RTK: {
    GO: "Conditions look clean. Run RTK auto-steer as normal.",
    CAUTION: "Expect a slower RTK fix or brief drift. Keep a manual override ready and recheck often.",
    HOLD: "Delay precision passes such as seeding or spraying, or confirm a backup positioning method first.",
  },
  SURVEY_DRONE: {
    GO: "Conditions look clean. Fly the planned survey as normal.",
    CAUTION: "Expect a slower RTK fix or brief position drift. Add margin to your plan and watch the fix status.",
    HOLD: "Delay precision flights, or fly only with a verified backup and manual control ready.",
  },
};

const FEED_LABEL: Record<FeedName, string> = {
  solarWind: "Solar wind",
  glotec: "GloTEC ionosphere",
  kp: "Kp index",
  gnss: "GNSS orbits",
};

// Text on the colored band is always dark (#0B0F19): >= 5:1 on all three fills, in both themes.
const BAND: Record<Decision, string> = {
  GO: "#22C55E",
  CAUTION: "#F59E0B",
  HOLD: "#EF4444",
};

function DecisionIcon({ decision }: { decision: Decision }) {
  const common = { width: 36, height: 36, viewBox: "0 0 24 24", fill: "none", stroke: "#0B0F19", strokeWidth: 2.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (decision === "GO")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M7.5 12.5l3 3 6-7" />
      </svg>
    );
  if (decision === "CAUTION")
    return (
      <svg {...common}>
        <path d="M12 3L22 20H2z" />
        <path d="M12 10v5M12 17.5v.5" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M12 2L22 12 12 22 2 12z" />
      <path d="M12 7v6M12 15.5v.5" />
    </svg>
  );
}

function staleFeeds(a: RiskAssessment): { name: FeedName; ageMin: number | null }[] {
  const out: { name: FeedName; ageMin: number | null }[] = [];
  for (const name of Object.keys(MAX_FEED_AGE_MINUTES) as FeedName[]) {
    const age = a.feeds?.[name]?.ageMin ?? null;
    if (age === null || age < 0 || age > MAX_FEED_AGE_MINUTES[name]) out.push({ name, ageMin: age });
  }
  return out;
}

export function DecisionCard({ assessment, missionType, requestFailed, fieldMode }: Props) {
  const shell = fieldMode
    ? "border-slate-900 bg-white text-[#0B0F19]"
    : "border-slate-700 bg-[#0F1420] text-slate-100";
  const muted = fieldMode ? "text-slate-700" : "text-slate-300";

  if (requestFailed || assessment === null) {
    return (
      <section aria-label="Decision" className={`rounded-2xl border-2 p-6 ${shell}`}>
        <p role="alert" className="text-lg font-bold">
          Status unknown — do not rely on this tool
        </p>
      </section>
    );
  }

  const stale = staleFeeds(assessment);
  // Fail-safe: never show GO on stale data, even if the engine level were Safe.
  let decision = levelToDecision(assessment.level);
  if ((assessment.isStale || stale.length > 0) && decision === "GO") decision = "CAUTION";

  const feeds = assessment.feeds;
  const feedRows: { name: FeedName; label: string }[] = (Object.keys(FEED_LABEL) as FeedName[]).map((name) => ({
    name,
    label: FEED_LABEL[name],
  }));

  return (
    <section aria-label="Decision" className={`overflow-hidden rounded-2xl border-2 ${shell}`}>
      <div
        className="flex items-center gap-3 px-6 py-4"
        style={{ backgroundColor: BAND[decision], color: "#0B0F19" }}
      >
        <DecisionIcon decision={decision} />
        <h2 className="text-xl font-extrabold">{HEADLINES[decision]}</h2>
      </div>

      <div className="space-y-4 p-6">
        <p className="text-base font-medium">{ACTION_COPY[missionType][decision]}</p>

        {assessment.preset && (
          <p className={`font-mono text-sm tabular-nums ${muted}`}>
            {assessment.preset.label}: {COPY.maskLabel} {assessment.preset.elevationMaskDeg}°, {COPY.gainLabel}{" "}
            {assessment.preset.gain}
          </p>
        )}

        {stale.length > 0 && (
          <div role="alert" className={`rounded-lg border-2 p-3 text-sm font-semibold ${fieldMode ? "border-slate-900" : "border-amber-400"}`}>
            <span aria-hidden="true">▲ </span>Stale data. Safe is locked out:
            <ul className="mt-1 list-disc pl-5 font-normal">
              {stale.map((s) => (
                <li key={s.name}>
                  {FEED_LABEL[s.name]}:{" "}
                  <span className="font-mono tabular-nums">{s.ageMin === null ? COPY.unavailable : `${formatMetric(s.ageMin, "min")} old`}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide">{COPY.reasonsTitle}</h3>
          <ol className={`mt-1 list-decimal pl-5 text-sm ${muted}`}>
            {assessment.topReasons.slice(0, 3).map((r, i) => (
              <li key={`${r.code}-${i}`} className="font-mono tabular-nums">
                {formatReason(r)}
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide">Data age and sources</h3>
          <ul className={`mt-1 text-sm ${muted}`}>
            {feedRows.map((f) => {
              const s = feeds?.[f.name];
              return (
                <li key={f.name}>
                  {f.label}: <span className="font-mono tabular-nums">{formatMetric(s?.ageMin ?? null, "min")}</span>
                  {" · "}
                  {s?.source ?? COPY.unavailable}
                </li>
              );
            })}
          </ul>
        </div>

        <p className={`text-xs ${muted}`}>
          Heuristic risk score, not certified for safety-of-life navigation. Ionosphere values are a regional
          ionosphere estimate, not an exact reading at your location.
        </p>
      </div>
    </section>
  );
}
