"use client";
import { COPY } from "@/lib/i18n";

export type MissionType = "TRACTOR_RTK" | "SURVEY_DRONE";

interface Props {
  value: MissionType;
  onChange: (id: MissionType) => void;
  fieldMode: boolean;
}

const OPTIONS: { id: MissionType; label: string }[] = [
  { id: "TRACTOR_RTK", label: COPY.presetTRACTOR_RTK },
  { id: "SURVEY_DRONE", label: COPY.presetSURVEY_DRONE },
];

export function MissionTypeSelector({ value, onChange, fieldMode }: Props) {
  return (
    <div role="radiogroup" aria-label="Mission type" className="inline-flex gap-2">
      {OPTIONS.map((o) => {
        const selected = o.id === value;
        const base = "rounded-lg border-2 px-4 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500";
        const tone = selected
          ? fieldMode
            ? "border-slate-900 bg-slate-900 text-white"
            : "border-violet-400 bg-violet-900 text-white"
          : fieldMode
            ? "border-slate-900 bg-white text-slate-950"
            : "border-slate-600 bg-[#0F1420] text-slate-100";
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.id)}
            className={`${base} ${tone}`}
          >
            {selected ? "● " : "○ "}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
