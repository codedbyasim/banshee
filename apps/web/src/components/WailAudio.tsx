"use client";
import { useState } from "react";

interface Props {
  labelPlay: string;
  labelMute: string;
  fieldMode: boolean;
}

export function WailAudio({ labelPlay, labelMute, fieldMode }: Props) {
  const [muted, setMuted] = useState(false);

  const playWail = () => {
    if (muted || typeof window === "undefined") return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(620, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(340, ctx.currentTime + 1.1);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1.25);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={playWail}
        disabled={muted}
        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
          fieldMode
            ? "border-slate-900 bg-slate-900 text-white disabled:opacity-40"
            : "border-purple-500/50 bg-purple-950/50 text-purple-200 hover:bg-purple-900/60 disabled:opacity-40"
        }`}
      >
        {labelPlay}
      </button>
      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        className={`rounded-lg border px-2.5 py-1.5 text-xs ${
          fieldMode ? "border-slate-400 text-slate-800" : "border-slate-700 text-slate-300"
        }`}
      >
        {muted ? "Unmute" : labelMute}
      </button>
    </div>
  );
}
