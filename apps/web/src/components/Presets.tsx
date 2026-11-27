"use client";
import type { Location } from "./FieldMap";

export interface PresetItem {
  id: string;
  label: string;
  latDeg: number;
  lonDeg: number;
}

export interface PresetsProps {
  presets: readonly PresetItem[];
  onPick: (loc: Location) => void;
  fieldMode: boolean;
  /** Currently selected location, used to mark the active preset. */
  location?: Location;
}

/** Quick-pick list of preset field locations. */
export default function Presets({ presets, onPick, fieldMode, location }: PresetsProps) {
  const hover = fieldMode ? "hover:bg-slate-200" : "hover:bg-slate-700/40";
  const border = fieldMode ? "border-slate-700" : "border-slate-600";
  const active = fieldMode ? "bg-slate-200" : "bg-slate-700/50";

  return (
    <section aria-label="Preset locations">
      <ul className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const isActive = !!location && location.latDeg === p.latDeg && location.lonDeg === p.lonDeg;
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => onPick({ latDeg: p.latDeg, lonDeg: p.lonDeg, label: p.label })}
                className={`rounded-lg border ${border} px-2.5 py-1.5 text-left text-xs ${hover} ${isActive ? active : ""}`}
              >
                <span className="font-semibold">{p.label}</span>
                <span className="ml-2 font-mono tabular-nums">
                  ({p.latDeg.toFixed(2)}, {p.lonDeg.toFixed(2)})
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
