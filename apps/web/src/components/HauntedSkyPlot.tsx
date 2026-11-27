"use client";
import type { SatelliteRiskDetail } from "@banshee/engine";

interface Props {
  satellites: SatelliteRiskDetail[];
  fieldMode: boolean;
}

export function HauntedSkyPlot({ satellites, fieldMode }: Props) {
  const cx = 140;
  const cy = 140;
  const maxR = 115;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 280 280" className="h-64 w-64" role="img" aria-label="Haunted Sky Plot radar of GNSS satellites">
        {[1, 0.66, 0.33].map((f) => (
          <circle
            key={f}
            cx={cx}
            cy={cy}
            r={maxR * f}
            fill="none"
            stroke={fieldMode ? "#CBD5E1" : "#1E293B"}
            strokeWidth="1.5"
            strokeDasharray={f === 1 ? undefined : "4 4"}
          />
        ))}
        <line x1={cx} y1={cy - maxR} x2={cx} y2={cy + maxR} stroke={fieldMode ? "#CBD5E1" : "#1E293B"} />
        <line x1={cx - maxR} y1={cy} x2={cx + maxR} y2={cy} stroke={fieldMode ? "#CBD5E1" : "#1E293B"} />
        <text x={cx - 4} y={18} fontSize="11" fill={fieldMode ? "#0F172A" : "#94A3B8"}>N</text>
        <text x={cx - 4} y={272} fontSize="11" fill={fieldMode ? "#0F172A" : "#94A3B8"}>S</text>
        <text x={262} y={cy + 4} fontSize="11" fill={fieldMode ? "#0F172A" : "#94A3B8"}>E</text>
        <text x={8} y={cy + 4} fontSize="11" fill={fieldMode ? "#0F172A" : "#94A3B8"}>W</text>

        {satellites.map((sat) => {
          const r = ((90 - sat.elevationDeg) / 90) * maxR;
          const azRad = ((sat.azimuthDeg - 90) * Math.PI) / 180;
          const x = cx + r * Math.cos(azRad);
          const y = cy + r * Math.sin(azRad);
          return (
            <g key={sat.id}>
              <title>{`${sat.name} | El ${sat.elevationDeg}° | vTEC ${sat.vTec !== null ? `${sat.vTec} TECU` : "unavailable"} | L1 delay ${sat.l1DelayMeters !== null ? `${sat.l1DelayMeters} m` : "unavailable"} | ${sat.isGhost ? "GHOSTED" : "CLEAN"}`}</title>
              <circle
                cx={x}
                cy={y}
                r={sat.isGhost ? 8 : 6}
                fill={sat.isGhost ? "#A855F7" : "#22C55E"}
                fillOpacity={sat.isGhost ? 0.45 : 0.95}
                stroke={sat.isGhost ? "#EF4444" : "#15803D"}
                strokeWidth="1.5"
              />
              <text
                x={x + 9}
                y={y + 3}
                fontSize="9"
                className="font-mono"
                fill={fieldMode ? "#0F172A" : "#E2E8F0"}
              >
                {sat.id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
