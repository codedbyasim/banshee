"use client";
import { useState } from "react";
import type { Location } from "./FieldMap";
import { validateLatLon } from "@/lib/validateLatLon";

export interface UseMyLocationProps {
  onPick: (loc: Location) => void;
  fieldMode: boolean;
}

const TIMEOUT_MS = 10_000;

function errorText(code: number): string {
  if (code === 1) return "Location permission was denied. Search a place, pick a preset or click the map instead.";
  if (code === 2) return "Your position is unavailable right now. Search a place or click the map instead.";
  if (code === 3) return "Finding your position timed out. Search a place or click the map instead.";
  return "Could not read your position. Search a place or click the map instead.";
}

/** Requests the browser position only on click. Failures never change the current Location. */
export default function UseMyLocation({ onPick, fieldMode }: UseMyLocationProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("This browser cannot share its position. Search a place or click the map instead.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        const v = validateLatLon(pos.coords.latitude, pos.coords.longitude);
        if (v.ok && v.latDeg !== null && v.lonDeg !== null) {
          onPick({ latDeg: v.latDeg, lonDeg: v.lonDeg, label: "My location" });
        } else {
          setError("The browser returned an invalid position. Your current location is unchanged.");
        }
      },
      (err) => {
        setBusy(false);
        setError(errorText(err.code));
      },
      { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: 60_000 },
    );
  };

  const hover = fieldMode ? "hover:bg-slate-200" : "hover:bg-slate-700/40";
  const border = fieldMode ? "border-slate-700" : "border-slate-500";

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={request}
        disabled={busy}
        aria-busy={busy}
        className={`rounded-lg border ${border} px-3 py-2 text-sm font-semibold disabled:opacity-70 ${hover}`}
      >
        {busy ? "Finding your position…" : "Use my location"}
      </button>
      {error && (
        <p role="alert" data-testid="use-my-location-error" className="text-xs font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}
