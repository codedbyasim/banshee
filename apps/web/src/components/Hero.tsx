"use client";
import { COST_FIGURE, COST_FIGURE_CITATIONS, COST_FIGURE_SOURCED } from "@/lib/sources";

interface Props {
  fieldMode: boolean;
  onCheckLive: () => void;
  onReplayDisaster: () => void;
}

/** Short link labels for the cost figure citations (full labels go in the title attribute). */
const SHORT_LABELS = ["Kansas State University", "UCAR CPAESS"];

/**
 * Hero header. The cost figure is a static, sourced claim; the "unsourced" marker only
 * renders if COST_FIGURE_SOURCED is false.
 */
export function Hero({ fieldMode, onCheckLive, onReplayDisaster }: Props) {
  const focus = "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-violet-500";
  return (
    <header data-testid="hero" className="space-y-1">
      <h1 className="text-xl font-black leading-tight sm:text-2xl">
        Solar storms silently break RTK GPS — May 2024 cost Midwest farms{" "}
        <span data-testid="cost-figure" className="font-mono tabular-nums">
          {COST_FIGURE}
        </span>
        {!COST_FIGURE_SOURCED && (
          <span
            data-testid="unsourced-marker"
            className={`ml-2 rounded px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-widest ${
              fieldMode ? "bg-amber-200 text-slate-900" : "bg-amber-500 text-black"
            }`}
          >
            Unsourced
          </span>
        )}
      </h1>
      <p className={`text-[11px] ${fieldMode ? "text-slate-700" : "text-slate-400"}`}>
        Sources:{" "}
        {COST_FIGURE_CITATIONS.map((c, i) => (
          <span key={c.url}>
            {i > 0 && " · "}
            <a
              href={c.url}
              title={c.label}
              target="_blank"
              rel="noopener noreferrer"
              className={`underline underline-offset-2 ${
                fieldMode ? "text-blue-800 hover:text-slate-900" : "text-purple-300 hover:text-purple-100"
              }`}
            >
              {SHORT_LABELS[i] ?? c.label}
            </a>
          </span>
        ))}
      </p>
      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="button"
          data-testid="hero-check-live"
          onClick={onCheckLive}
          className={`rounded-lg px-5 py-2.5 text-sm font-bold ${focus} ${
            fieldMode
              ? "bg-[#0B0F19] text-white hover:bg-slate-800"
              : "bg-emerald-500 text-[#07090F] hover:bg-emerald-400"
          }`}
        >
          Check My Field (Live)
        </button>
        <button
          type="button"
          data-testid="hero-replay"
          onClick={onReplayDisaster}
          className={`rounded-lg border-2 px-5 py-2.5 text-sm font-bold ${focus} ${
            fieldMode
              ? "border-[#0B0F19] bg-white text-[#0B0F19] hover:bg-slate-100"
              : "border-violet-400 bg-transparent text-violet-200 hover:bg-violet-900/40"
          }`}
        >
          Replay May 2024 Disaster
        </button>
      </div>
    </header>
  );
}
