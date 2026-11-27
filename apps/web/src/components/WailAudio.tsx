"use client";
import { useEffect, useState } from "react";

interface Props {
  labelPlay: string;
  labelMute: string;
  fieldMode: boolean;
}

const MUTE_KEY = "banshee.wailMuted";

/**
 * Synthesized wail (Web Audio only, no audio files). It plays only from an explicit click on
 * the play button and never automatically. The mute choice is persisted in localStorage.
 */
export function WailAudio({ labelPlay, labelMute, fieldMode }: Props) {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(MUTE_KEY) === "1") setMuted(true);
    } catch {
      // Storage can be blocked; the toggle still works for this session.
    }
  }, []);

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      try {
        window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      } catch {
        // Ignore storage failures.
      }
      return next;
    });
  };

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
    osc.onended = () => {
      void ctx.close();
    };
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={playWail}
        disabled={muted}
        data-testid="wail-play"
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
        onClick={toggleMute}
        aria-pressed={muted}
        data-testid="wail-mute"
        className={`rounded-lg border px-2.5 py-1.5 text-xs ${
          fieldMode ? "border-slate-500 text-slate-800" : "border-slate-600 text-slate-300"
        }`}
      >
        {muted ? "Unmute Wail" : labelMute}
      </button>
    </div>
  );
}
