"use client";
import { useEffect, useState } from "react";
import type { Location } from "./FieldMap";
import { validateLatLon } from "@/lib/validateLatLon";

export interface AdvancedCoordinatesProps {
  location: Location;
  onPick: (loc: Location) => void;
  fieldMode: boolean;
}

/** Manual latitude/longitude entry. Invalid input shows an error and leaves the Location unchanged. */
export default function AdvancedCoordinates({ location, onPick, fieldMode }: AdvancedCoordinatesProps) {
  const [lat, setLat] = useState(String(location.latDeg));
  const [lon, setLon] = useState(String(location.lonDeg));
  const [error, setError] = useState<string | null>(null);

  // Keep the fields in sync when the location changes elsewhere (map, search, presets).
  useEffect(() => {
    setLat(String(location.latDeg));
    setLon(String(location.lonDeg));
    setError(null);
  }, [location.latDeg, location.lonDeg]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = validateLatLon(lat, lon);
    if (v.ok && v.latDeg !== null && v.lonDeg !== null) {
      setError(null);
      onPick({ latDeg: v.latDeg, lonDeg: v.lonDeg });
    } else {
      setError(v.message);
    }
  };

  const border = fieldMode ? "border-slate-700" : "border-slate-500";
  const hover = fieldMode ? "hover:bg-slate-200" : "hover:bg-slate-700/40";
  const input = `w-32 rounded-lg border ${border} bg-transparent px-3 py-2 text-sm font-mono tabular-nums`;

  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold">Advanced: enter coordinates</summary>
      <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2" noValidate>
        <label className="text-xs">
          <span className="block">Latitude (°, north positive)</span>
          <input
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            aria-invalid={error !== null}
            aria-describedby={error ? "adv-coord-error" : undefined}
            className={input}
          />
        </label>
        <label className="text-xs">
          <span className="block">Longitude (°, east positive)</span>
          <input
            inputMode="decimal"
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            aria-invalid={error !== null}
            aria-describedby={error ? "adv-coord-error" : undefined}
            className={input}
          />
        </label>
        <button
          type="submit"
          className={`rounded-lg border ${border} px-3 py-2 text-sm font-semibold ${hover}`}
        >
          Set location
        </button>
      </form>
      {error && (
        <p id="adv-coord-error" role="alert" data-testid="advanced-coordinates-error" className="mt-1 text-xs font-semibold">
          {error}
        </p>
      )}
    </details>
  );
}
