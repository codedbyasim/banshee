"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { OSM_CONTRIBUTORS_ATTRIBUTION } from "@/lib/sources";

export interface GeocodeResult {
  label: string;
  latDeg: number;
  lonDeg: number;
}

export interface PlaceSelection {
  latDeg: number;
  lonDeg: number;
  label?: string;
}

interface Props {
  onSelect: (loc: PlaceSelection) => void;
}

const DEBOUNCE_MS = 800;
const MIN_CHARS = 3;
const MAX_RESULTS = 5;
const CLIENT_TIMEOUT_MS = 10_000;

type Status = "idle" | "loading" | "done" | "error";

function isResultArray(v: unknown): v is GeocodeResult[] {
  return (
    Array.isArray(v) &&
    v.every(
      (r) =>
        r &&
        typeof r === "object" &&
        typeof (r as GeocodeResult).label === "string" &&
        Number.isFinite((r as GeocodeResult).latDeg) &&
        Number.isFinite((r as GeocodeResult).lonDeg),
    )
  );
}

/**
 * Place search backed by /api/geocode (Nominatim proxy). Debounced, cached for the session,
 * cancels the previous request on a new search. Errors never change the current Location.
 */
export default function PlaceSearch({ onSelect }: Props) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const cache = useRef(new Map<string, GeocodeResult[]>());
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const search = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.length < MIN_CHARS) return;
    const key = trimmed.toLowerCase();

    const cached = cache.current.get(key);
    if (cached) {
      controller.current?.abort();
      setResults(cached);
      setErrorMsg(null);
      setStatus("done");
      return;
    }

    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const timeout = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
    setStatus("loading");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`, { signal: ctrl.signal });
      const body: unknown = await res.json().catch(() => null);
      if (ctrl.signal.aborted && controller.current !== ctrl) return;
      if (!res.ok || !isResultArray(body)) {
        const msg =
          body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
            ? (body as { error: string }).error
            : "Place search is unavailable right now. Your current location is unchanged.";
        setResults([]);
        setErrorMsg(msg);
        setStatus("error");
        return;
      }
      const list = body.slice(0, MAX_RESULTS);
      cache.current.set(key, list);
      setResults(list);
      setStatus("done");
    } catch {
      // A superseded request was aborted on purpose; the newer request owns the UI state.
      if (controller.current !== ctrl) return;
      setResults([]);
      setErrorMsg("Place search failed or timed out. Your current location is unchanged.");
      setStatus("error");
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  // Debounce typing.
  useEffect(() => {
    clearTimer();
    if (text.trim().length < MIN_CHARS) {
      if (status !== "idle") {
        controller.current?.abort();
        setStatus("idle");
        setResults([]);
        setErrorMsg(null);
      }
      return;
    }
    timer.current = setTimeout(() => void search(text), DEBOUNCE_MS);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, search]);

  useEffect(() => () => controller.current?.abort(), []);

  const submitNow = () => {
    clearTimer();
    void search(text);
  };

  const tooShort = text.trim().length > 0 && text.trim().length < MIN_CHARS;

  return (
    <section aria-label="Search for a place" className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submitNow();
        }}
      >
        <label className="sr-only" htmlFor="place-search-input">
          Search for a place
        </label>
        <input
          id="place-search-input"
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search a town, farm or address"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg border border-slate-500 bg-transparent px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg border border-slate-500 px-3 py-2 text-sm font-semibold hover:bg-slate-700/40"
        >
          Search
        </button>
      </form>

      {tooShort && <p className="text-xs opacity-80">Type at least {MIN_CHARS} characters to search.</p>}
      {status === "loading" && (
        <p role="status" className="text-xs opacity-80">
          Searching…
        </p>
      )}
      {status === "error" && errorMsg && (
        <p role="alert" data-testid="place-search-error" className="text-xs font-semibold">
          {errorMsg}
        </p>
      )}
      {status === "done" && results.length === 0 && (
        <p role="status" data-testid="place-search-empty" className="text-xs">
          No places found. Try a different name or click the map.
        </p>
      )}
      {status === "done" && results.length > 0 && (
        <ul className="space-y-1" data-testid="place-search-results">
          {results.map((r, i) => (
            <li key={`${r.latDeg},${r.lonDeg},${i}`}>
              <button
                type="button"
                onClick={() => onSelect({ latDeg: r.latDeg, lonDeg: r.lonDeg, label: r.label })}
                className="w-full rounded border border-slate-600 px-2.5 py-1.5 text-left text-xs hover:bg-slate-700/40"
              >
                {r.label}
                <span className="ml-2 font-mono tabular-nums opacity-80">
                  ({r.latDeg.toFixed(4)}, {r.lonDeg.toFixed(4)})
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {(status === "done" || status === "error") && (
        <p className="text-[11px] opacity-80">{OSM_CONTRIBUTORS_ATTRIBUTION}</p>
      )}
    </section>
  );
}
