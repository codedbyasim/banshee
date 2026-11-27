"use client";

export interface TombstoneItem {
  id: string;
  name: string;
  dateLabel: string;
  kp: number;
}

const TOMBSTONES: TombstoneItem[] = [
  { id: "gannon-2024", name: "Gannon Storm", dateLabel: "10 May 2024", kp: 9.0 },
  { id: "halloween-2003", name: "Halloween Storms", dateLabel: "29 Oct 2003", kp: 9.0 },
  { id: "nov-2025", name: "Nov 2025 Storm", dateLabel: "12 Nov 2025", kp: 8.7 },
  { id: "jan-2026", name: "Jan 2026 Storm", dateLabel: "19 Jan 2026", kp: 8.7 },
  { id: "multan-sunset", name: "Multan Post-Sunset", dateLabel: "Low-Lat Watch", kp: 2.3 },
];

interface Props {
  activeReplayId: string | null;
  onSelectReplay: (id: string) => void;
  fieldMode: boolean;
}

export function StormGraveyard({ activeReplayId, onSelectReplay, fieldMode }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {TOMBSTONES.map((t) => {
        const active = activeReplayId === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelectReplay(t.id)}
            aria-pressed={active}
            aria-label={`Replay ${t.name}, ${t.dateLabel}, archived Kp ${t.kp}`}
            className={`rounded-t-full rounded-b-lg border p-3 text-center transition ${
              active
                ? "border-purple-500 bg-purple-900 text-white"
                : fieldMode
                  ? "border-slate-500 bg-slate-100 text-slate-900 hover:border-slate-900"
                  : "border-slate-800 bg-[#0B101B] text-slate-200 hover:border-purple-500/60"
            }`}
          >
            <div className="text-[10px] font-mono uppercase tracking-widest">R.I.P. GPS</div>
            <div className="mt-1 text-xs font-bold">{t.name}</div>
            <div className="mt-0.5 font-mono text-[11px]">{t.dateLabel}</div>
            <div
              className={`mt-1 font-mono text-[11px] font-semibold ${
                active ? "text-amber-300" : fieldMode ? "text-amber-900" : "text-amber-400"
              }`}
            >
              Kp {t.kp}
            </div>
            <span className="mt-1 inline-block rounded bg-purple-700 px-1.5 py-0.5 text-[10px] font-black tracking-widest text-white">
              REPLAY
            </span>
          </button>
        );
      })}
    </div>
  );
}
