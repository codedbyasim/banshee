"use client";
import { bestSafeWindow } from "@banshee/engine";
import type { ForecastHourResult } from "@banshee/engine";

interface Props {
  hours: readonly ForecastHourResult[];
  selectedHour: number;
  onSelectHour: (hour: number) => void;
  /** Longitude of the Location, used to derive local solar clock time per bar. */
  lonDeg: number;
  isReplay?: boolean;
  fieldMode: boolean;
}

const LEVEL_STYLE = {
  Safe: { color: "#22C55E", icon: "✓", label: "Safe" },
  Uneasy: { color: "#F59E0B", icon: "▲", label: "Uneasy" },
  Haunted: { color: "#EF4444", icon: "◆", label: "Haunted" },
} as const;

const BAR_AREA_PX = 96;

/** Local mean solar time (UTC + lon/15 h) as HH:00-style label, e.g. "19:00". */
function localClock(iso: string, lonDeg: number): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms) || !Number.isFinite(lonDeg)) return "--:--";
  const offsetMs = Math.round((lonDeg / 15) * 3_600_000);
  const d = new Date(ms + offsetMs);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * 12-hour heuristic timeline. Every bar is a button; scores and levels come straight from
 * the engine output. Level is always shown as text plus a distinct glyph, never color alone.
 */
export function SafeWindowTimeline({ hours, selectedHour, onSelectHour, lonDeg, isReplay, fieldMode }: Props) {
  const window = bestSafeWindow(hours.map((h) => ({ level: h.assessment.level, score: h.assessment.score })));
  const lowest = hours.reduce<ForecastHourResult | null>(
    (min, h) => (min === null || h.assessment.score < min.assessment.score ? h : min),
    null
  );

  const text = fieldMode ? "text-slate-900" : "text-slate-100";
  const muted = fieldMode ? "text-slate-700" : "text-slate-300";
  const panel = fieldMode ? "border-slate-400 bg-white" : "border-slate-700 bg-[#0B0F1A]";

  const startHour = window ? hours[window.startHourOffset] : undefined;
  const endHour = window ? hours[window.endHourOffset] : undefined;

  return (
    <section data-testid="safe-window-timeline" aria-label="12-hour risk timeline" className={`rounded-xl border p-3 ${panel} ${text}`}>
      <h2 className="text-sm font-black">{isReplay ? "12 hours from the archive timestamp" : "Next 12 hours"}</h2>

      {window && startHour && endHour ? (
        <p data-testid="best-window" className="mt-1 text-xs font-semibold">
          <span aria-hidden="true">✓ </span>
          Best Safe Window:{" "}
          <span className="font-mono tabular-nums">
            {localClock(startHour.timestampIso, lonDeg)}–{localClock(endHour.timestampIso, lonDeg)}
          </span>{" "}
          local ({" "}
          <span className="font-mono tabular-nums">{window.durationHours}</span> h)
        </p>
      ) : (
        <p data-testid="no-safe-window" className="mt-1 text-xs font-semibold">
          <span aria-hidden="true">▲ </span>
          {isReplay ? "No safe window in these 12 hours" : "No safe window in the next 12 hours"}
        </p>
      )}

      <ol className="mt-3 grid grid-cols-12 gap-1" style={{ listStyle: "none", padding: 0 }}>
        {hours.map((h) => {
          const a = h.assessment;
          const style = LEVEL_STYLE[a.level];
          const inWindow =
            window !== null && h.hourOffset >= window.startHourOffset && h.hourOffset <= window.endHourOffset;
          const isLowest = window === null && lowest !== null && lowest.hourOffset === h.hourOffset;
          const selected = h.hourOffset === selectedHour;
          const clock = localClock(h.timestampIso, lonDeg);
          const heightPx = Math.max(4, Math.round((Math.min(100, Math.max(0, a.score)) / 100) * BAR_AREA_PX));
          const aria =
            `Plus ${h.hourOffset} hours, local ${clock}, risk score ${a.score}, level ${a.level}` +
            (h.postSunsetActive ? ", post-sunset scintillation window" : "") +
            (inWindow ? ", in best safe window" : "") +
            (isLowest ? ", lowest-risk hour, not safe" : "");
          return (
            <li key={h.hourOffset} className="min-w-0">
              <button
                type="button"
                data-testid={`hour-bar-${h.hourOffset}`}
                aria-label={aria}
                aria-pressed={selected}
                onClick={() => onSelectHour(h.hourOffset)}
                className={`flex w-full flex-col items-center rounded px-0.5 py-1 text-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                  selected ? (fieldMode ? "bg-slate-200 ring-2 ring-slate-900" : "bg-slate-800 ring-2 ring-white") : ""
                } ${inWindow ? (fieldMode ? "outline outline-2 outline-green-800" : "outline outline-2 outline-emerald-400") : ""}`}
              >
                <span className="flex w-full items-end justify-center" style={{ height: BAR_AREA_PX }}>
                  <span
                    aria-hidden="true"
                    className="w-full rounded-t"
                    style={{ height: heightPx, backgroundColor: style.color }}
                  />
                </span>
                <span className="mt-1 font-mono tabular-nums font-bold">{a.score}</span>
                <span className="font-bold">
                  <span aria-hidden="true">{style.icon}</span> {style.label}
                </span>
                <span className={`font-mono tabular-nums ${muted}`}>{clock}</span>
                {h.postSunsetActive && (
                  <span data-testid={`post-sunset-${h.hourOffset}`} className={muted}>
                    <span aria-hidden="true">☾</span> Post-sunset
                  </span>
                )}
                {isLowest && (
                  <span data-testid="lowest-risk-marker" className="font-bold">
                    Lowest-risk hour (not safe)
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <p className={`mt-2 text-[11px] ${muted}`}>
        {isReplay
          ? "REPLAY: hours after the archive timestamp, projected from the archived storm conditions. Not a measured record and not live data."
          : "Heuristic projection from current conditions, not a measured prediction."}{" "}
        Times are local solar time at the Location.
      </p>
    </section>
  );
}
