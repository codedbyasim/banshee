"use client";
import type { RiskLevel } from "@banshee/engine";

interface Props {
  score: number;
  level: RiskLevel;
  fieldMode: boolean;
}

export function BansheeDial({ score, level, fieldMode }: Props) {
  const palette =
    level === "Haunted"
      ? { ring: "#EF4444", glow: "rgba(168,85,247,0.35)", label: "HAUNTED — HIGH RISK", badge: "bg-red-600 text-white" }
      : level === "Uneasy"
        ? { ring: "#F59E0B", glow: "rgba(245,158,11,0.28)", label: "UNEASY — WATCH", badge: "bg-amber-500 text-black" }
        : { ring: "#22C55E", glow: "rgba(34,197,94,0.25)", label: "SAFE — CLEAN SKY", badge: "bg-emerald-600 text-white" };

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border p-6 ${
        fieldMode ? "border-slate-900 bg-white text-slate-950" : "border-slate-800 bg-[#0F1420] text-slate-100"
      }`}
    >
      <div
        className="relative flex h-44 w-44 items-center justify-center rounded-full border-4"
        style={{
          borderColor: palette.ring,
          boxShadow: fieldMode ? "none" : `0 0 36px ${palette.glow}`,
        }}
        aria-label={`Risk score ${score} out of 100, level ${level}`}
      >
        {/* Functional Banshee Ghost SVG */}
        <svg viewBox="0 0 120 120" className="h-32 w-32" role="img" aria-hidden="true">
          <path
            d="M30 96 C26 60, 32 22, 60 22 C88 22, 94 60, 90 96 L78 86 L68 96 L60 86 L52 96 L42 86 Z"
            fill={fieldMode ? "#1E293B" : "#1E1B4B"}
            stroke={palette.ring}
            strokeWidth="3"
          />
          {/* Eyes */}
          <circle cx="48" cy="52" r={level === "Haunted" ? 6 : 4.5} fill={palette.ring} />
          <circle cx="72" cy="52" r={level === "Haunted" ? 6 : 4.5} fill={palette.ring} />
          {/* Mouth expression maps directly to Safe / Uneasy / Haunted */}
          {level === "Safe" && (
            <path d="M48 70 Q60 77 72 70" stroke={palette.ring} strokeWidth="3" fill="none" strokeLinecap="round" />
          )}
          {level === "Uneasy" && (
            <line x1="47" y1="72" x2="73" y2="72" stroke={palette.ring} strokeWidth="3" strokeLinecap="round" />
          )}
          {level === "Haunted" && (
            <ellipse cx="60" cy="73" rx="9" ry="12" fill={palette.ring} />
          )}
        </svg>
      </div>

      <div className="mt-4 text-center">
        <div className="font-mono text-4xl font-bold tabular-nums">{score}/100</div>
        <span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold tracking-wider ${palette.badge}`}>
          {palette.label}
        </span>
      </div>
    </div>
  );
}
