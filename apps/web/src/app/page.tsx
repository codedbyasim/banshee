"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { explainAssessmentVerified, type RiskAssessment } from "@banshee/engine";
import { AssessmentStatus, ReasonList } from "@/components/AssessmentStatus";
import AdvancedCoordinates from "@/components/AdvancedCoordinates";
import { BansheeDial } from "@/components/BansheeDial";
import { DecisionCard } from "@/components/DecisionCard";
import type { Location } from "@/components/FieldMap";
import { HauntedSkyPlot } from "@/components/HauntedSkyPlot";
import { Hero } from "@/components/Hero";
import { MissionTypeSelector, type MissionType } from "@/components/MissionTypeSelector";
import PlaceSearch from "@/components/PlaceSearch";
import Presets, { type PresetItem } from "@/components/Presets";
import { SafeWindowTimeline } from "@/components/SafeWindowTimeline";
import { StormGraveyard } from "@/components/StormGraveyard";
import UseMyLocation from "@/components/UseMyLocation";
import { WailAudio } from "@/components/WailAudio";
import type { AssessResponse } from "@/lib/assess";
import type { ForecastResponse } from "@/lib/forecast";
import { formatMetric, replayView } from "@/lib/format";
import { COPY as t } from "@/lib/i18n";

// Leaflet touches `window`, so the map is client-only.
const FieldMap = dynamic(() => import("@/components/FieldMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] items-center justify-center text-sm opacity-80" role="status">
      Loading map…
    </div>
  ),
});

type Mode = "live" | "replay";
type Theme = "haunted" | "field";

const PRESET_LOCATIONS: readonly PresetItem[] = [
  { id: "multan-farm", label: "Multan Farm", latDeg: 30.1575, lonDeg: 71.5249 },
  { id: "iowa-corn-belt", label: "Iowa Corn Belt", latDeg: 41.878, lonDeg: -93.0977 },
  { id: "islamabad-drone-pad", label: "Islamabad Drone Pad", latDeg: 33.6844, lonDeg: 73.0479 },
];

const DEFAULT_REPLAY_ID = "gannon-2024";
const REDUCED_MOTION_KEY = "banshee.reducedMotion";

/** REPLAY badge plus UTC archive timestamp, taken from the engine output only. */
function ReplayBadge({ assessment, testId }: { assessment: RiskAssessment; testId: string }) {
  const replay = replayView(assessment);
  if (!replay) return null;
  return (
    <div
      role="status"
      data-testid={testId}
      className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-purple-500 bg-purple-950 px-3 py-2 text-xs font-semibold text-white"
    >
      <span className="rounded bg-purple-600 px-2 py-0.5 text-sm font-black tracking-widest text-white">
        {replay.badge}
      </span>
      {replay.unverified && (
        <span className="rounded bg-amber-500 px-2 py-0.5 font-black tracking-widest text-black">
          {t.unverifiedArchive}
        </span>
      )}
      {replay.label && <span>{replay.label}</span>}
      <span className="font-mono tabular-nums">
        {t.archiveLabel} (UTC): {replay.archiveIso ?? t.unavailable}
      </span>
      <span>Archived storm data, not real-time conditions.</span>
    </div>
  );
}

export default function HomePage() {
  const [theme, setTheme] = useState<Theme>("haunted");
  const fieldMode = theme === "field";
  const [location, setLocation] = useState<Location>({ latDeg: 30.1575, lonDeg: 71.5249, label: "Multan Farm" });
  const [missionType, setMissionType] = useState<MissionType>("TRACTOR_RTK");
  const [mode, setMode] = useState<Mode>("live");
  const [replayId, setReplayId] = useState<string | null>(null);
  const [selectedHour, setSelectedHour] = useState(0);
  const [data, setData] = useState<AssessResponse | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [requestFailed, setRequestFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  // Bumped by "Check My Field (Live)" so a repeat click re-fetches the same inputs.
  const [refreshTick, setRefreshTick] = useState(0);
  const requestSeq = useRef(0);
  // Reduced Motion: on when the OS asks for it or the user turns it on manually (persisted).
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const [manualReducedMotion, setManualReducedMotion] = useState(false);
  const reducedMotion = systemReducedMotion || manualReducedMotion;

  useEffect(() => {
    try {
      if (window.localStorage.getItem(REDUCED_MOTION_KEY) === "1") setManualReducedMotion(true);
    } catch {
      // Storage can be blocked; the toggle still works for this session.
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setSystemReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggleReducedMotion = () => {
    setManualReducedMotion((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(REDUCED_MOTION_KEY, next ? "1" : "0");
      } catch {
        // Ignore storage failures.
      }
      return next;
    });
  };

  const activeReplay = mode === "replay" ? replayId : null;

  useEffect(() => {
    const seq = ++requestSeq.current;
    const ctrl = new AbortController();
    const qs = new URLSearchParams({
      presetId: missionType,
      lat: String(location.latDeg),
      lon: String(location.lonDeg),
    });
    if (activeReplay) qs.set("replay", activeReplay);

    setLoading(true);
    setSelectedHour(0);
    (async () => {
      try {
        const [aRes, fRes] = await Promise.all([
          fetch(`/api/assess?${qs.toString()}`, { signal: ctrl.signal }),
          fetch(`/api/forecast?${qs.toString()}`, { signal: ctrl.signal }),
        ]);
        if (!aRes.ok) throw new Error(`assess ${aRes.status}`);
        const aJson = (await aRes.json()) as AssessResponse;
        // The forecast may fail on its own; the current assessment is still useful then.
        const fJson = fRes.ok ? ((await fRes.json()) as ForecastResponse) : null;
        if (seq !== requestSeq.current) return;
        setData(aJson);
        setForecast(fJson);
        setRequestFailed(false);
      } catch {
        if (seq !== requestSeq.current || ctrl.signal.aborted) return;
        setRequestFailed(true);
        setData(null);
        setForecast(null);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [location.latDeg, location.lonDeg, missionType, activeReplay, refreshTick]);

  const pickLocation = useCallback((loc: Location) => setLocation(loc), []);

  const checkLive = () => {
    setMode("live");
    setReplayId(null);
    setRefreshTick((n) => n + 1);
  };
  const replayDisaster = () => {
    setReplayId(DEFAULT_REPLAY_ID);
    setMode("replay");
  };
  const selectReplay = (id: string) => {
    setReplayId(id);
    setMode("replay");
  };

  // Hour 0 is the /api/assess result; later hours are the engine assessments from /api/forecast.
  // /api/assess has no time parameter, so the forecast hour's assessment is used directly.
  const hourAssessment =
    selectedHour > 0 ? (forecast?.hours[selectedHour]?.assessment ?? data?.assessment ?? null) : (data?.assessment ?? null);
  const selectedHourIso = forecast?.hours[selectedHour]?.timestampIso ?? hourAssessment?.assessedAtIso ?? null;

  // Replay labelling follows the data actually on screen, so a REPLAY badge never sits on
  // live numbers (or the reverse) while a request is in flight.
  const showingReplay = data?.assessment.isReplay === true;

  // Replay scenarios carry fixed look angles and no orbital elements, so replay forecast hours
  // have no satellites. In replay the sky plot keeps the archived /api/assess geometry.
  const skyAssessment = showingReplay ? (data?.assessment ?? null) : hourAssessment;

  // Explainer: built only from the selected hour's engine output and shown only if every
  // number in it passes verifyGroundedNumbers().
  const explanation = useMemo(
    () => (hourAssessment ? explainAssessmentVerified(hourAssessment) : null),
    [hourAssessment]
  );

  const cardCls = fieldMode
    ? "rounded-2xl border border-slate-900 bg-white p-5 text-[#0B0F19]"
    : "rounded-2xl border border-slate-800 bg-[#0F1420] p-5 text-slate-100";
  const subtle = fieldMode ? "text-slate-700" : "text-slate-300";

  return (
    <main
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-theme={theme}
      className={`min-h-screen px-4 py-6 sm:px-8 ${
        fieldMode ? "bg-white text-[#0B0F19]" : "bg-[#07090F] text-slate-100"
      }`}
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <Hero fieldMode={fieldMode} onCheckLive={checkLive} onReplayDisaster={replayDisaster} />

        {/* Brand bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className={`text-xl font-black tracking-tight ${fieldMode ? "text-purple-900" : "text-purple-400"}`}>
              {t.title}
            </p>
            <p className={`text-sm ${subtle}`}>{t.tagline}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <WailAudio labelPlay={t.wailBtn} labelMute={t.muteBtn} fieldMode={fieldMode} />
            <button
              type="button"
              data-testid="reduced-motion-toggle"
              aria-pressed={reducedMotion}
              disabled={systemReducedMotion}
              title={systemReducedMotion ? "Your device asks for reduced motion, so it stays on." : undefined}
              onClick={toggleReducedMotion}
              className="rounded-lg border border-slate-500 px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed"
            >
              Reduced Motion: {reducedMotion ? "On" : "Off"}
            </button>
            <button
              type="button"
              data-testid="field-mode-toggle"
              aria-pressed={fieldMode}
              onClick={() => setTheme((v) => (v === "field" ? "haunted" : "field"))}
              className="rounded-lg border border-slate-500 px-3 py-1.5 text-xs font-semibold"
            >
              {fieldMode ? t.hauntMode : t.fieldMode}
            </button>
          </div>
        </div>

        {/* Replay / Unverified archive / Stale / Invalid input banners */}
        {data && <AssessmentStatus assessment={data.assessment} />}

        {/* Location picker */}
        <section aria-label="Choose your field" className={`${cardCls} space-y-4`}>
          <div className="overflow-hidden rounded-lg">
            <FieldMap location={location} onPick={pickLocation} fieldMode={fieldMode} presets={PRESET_LOCATIONS} />
          </div>
          <p className="font-mono text-xs tabular-nums">
            {location.label ? `${location.label} · ` : ""}
            {location.latDeg.toFixed(4)}, {location.lonDeg.toFixed(4)}
          </p>
          <PlaceSearch onSelect={pickLocation} />
          <div className="flex flex-wrap items-start gap-3">
            <UseMyLocation onPick={pickLocation} fieldMode={fieldMode} />
            <Presets presets={PRESET_LOCATIONS} onPick={pickLocation} fieldMode={fieldMode} location={location} />
          </div>
          <AdvancedCoordinates location={location} onPick={pickLocation} fieldMode={fieldMode} />
          <div className="flex flex-wrap items-center gap-3">
            <MissionTypeSelector value={missionType} onChange={setMissionType} fieldMode={fieldMode} />
            {loading && (
              <span role="status" className="text-xs">
                Updating…
              </span>
            )}
          </div>
        </section>

        {showingReplay && data && <ReplayBadge assessment={data.assessment} testId="replay-badge-decision" />}
        {!requestFailed && hourAssessment && (
          <p data-testid="selected-hour" className={`font-mono text-xs tabular-nums ${subtle}`}>
            Showing {selectedHour === 0 ? (showingReplay ? "the archive hour" : "now") : `+${selectedHour} h`}
            {selectedHourIso ? ` · ${selectedHourIso} UTC` : ""}
            {selectedHour > 0 ? " · projection" : ""}
          </p>
        )}
        <DecisionCard
          assessment={hourAssessment}
          missionType={missionType}
          requestFailed={requestFailed}
          fieldMode={fieldMode}
        />

        {forecast && showingReplay && data && (
          <ReplayBadge assessment={data.assessment} testId="replay-badge-timeline" />
        )}
        {forecast && (
          <SafeWindowTimeline
            hours={forecast.hours}
            selectedHour={selectedHour}
            onSelectHour={setSelectedHour}
            lonDeg={location.lonDeg}
            isReplay={forecast.isReplay}
            fieldMode={fieldMode}
          />
        )}

        {/* Dial, telemetry and explainer follow the selected hour. The sky plot follows it in
            Live_Mode (forecast hours are re-propagated with SGP4); in Replay_Mode it keeps the
            archived /api/assess geometry because replay scenarios have no orbital elements. */}
        {data && hourAssessment && skyAssessment && !requestFailed && (
          <div className="grid gap-6 md:grid-cols-3">
            <BansheeDial score={hourAssessment.score} level={hourAssessment.level} fieldMode={fieldMode} />

            <section className={cardCls} data-testid="sky-plot-panel">
              <h2 className="text-sm font-bold">{t.skyPlotTitle}</h2>
              <p className="mb-3 text-xs">{t.skyPlotSub}</p>
              <HauntedSkyPlot satellites={skyAssessment.satellites} fieldMode={fieldMode} />
              <div className="mt-2 flex justify-around font-mono text-xs tabular-nums">
                <span className={fieldMode ? "text-emerald-800" : "text-emerald-400"}>
                  Clean: {skyAssessment.cleanSatellites}
                </span>
                <span className={fieldMode ? "text-purple-900" : "text-purple-400"}>
                  Ghost: {skyAssessment.ghostSatellites}
                </span>
                <span>PDOP: {skyAssessment.cleanPdopEstimate}</span>
              </div>
              <p data-testid="sky-plot-note" className={`mt-2 text-[11px] ${subtle}`}>
                {showingReplay
                  ? `REPLAY: archived satellite geometry at the archive timestamp (${
                      data.assessment.replayArchiveIso ?? t.unavailable
                    } UTC). It does not change with the selected hour because the archive has no orbital elements.`
                  : selectedHour === 0
                    ? "Satellite positions for now."
                    : `Satellite positions propagated (SGP4) to +${selectedHour} h.`}
              </p>
            </section>

            <section className={`${cardCls} space-y-4`}>
              <div>
                <h2 className="text-sm font-bold">{t.omensTitle}</h2>
                <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-xs tabular-nums">
                  <div className="rounded-lg border border-slate-500/60 p-2">
                    <div className="opacity-90">L1 Lead Time</div>
                    <div className={`text-base font-bold ${fieldMode ? "text-purple-900" : "text-purple-400"}`}>
                      {formatMetric(hourAssessment.leadTimeMinutes, "min")}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-500/60 p-2">
                    <div className="opacity-90">Solar Wind</div>
                    <div className="text-base font-bold">
                      {formatMetric(hourAssessment.solarWindSpeedKmS, "km/s")}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-500/60 p-2">
                    <div className="opacity-90">IMF Bz (GSM)</div>
                    <div className={`text-base font-bold ${fieldMode ? "text-red-800" : "text-red-400"}`}>
                      {formatMetric(hourAssessment.bzNt, "nT")}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-500/60 p-2">
                    <div className="opacity-90">Max L1 Delay</div>
                    <div className="text-base font-bold">{formatMetric(hourAssessment.maxL1DelayMeters, "m")}</div>
                  </div>
                  <div className="rounded-lg border border-slate-500/60 p-2">
                    <div className="opacity-90">Mean vTEC (regional estimate)</div>
                    <div className="text-base font-bold">{formatMetric(hourAssessment.meanVtec, "TECU")}</div>
                  </div>
                  <div className="rounded-lg border border-slate-500/60 p-2">
                    <div className="opacity-90">Kp</div>
                    <div className="text-base font-bold">{formatMetric(hourAssessment.kpIndex, "")}</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold">{t.voiceTitle}</h3>
                {explanation?.grounded ? (
                  <p data-testid="explanation" className="mt-1 text-xs leading-relaxed">
                    {explanation.text}
                  </p>
                ) : (
                  <p data-testid="explanation-withheld" role="alert" className="mt-1 text-xs font-semibold">
                    Explanation withheld: it cited a number not found in the engine output.
                  </p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-bold">{t.reasonsTitle}</h3>
                <ReasonList assessment={hourAssessment} />
              </div>
            </section>
          </div>
        )}

        {/* Graveyard of Storms */}
        <section className={cardCls}>
          <h2 className="mb-3 text-sm font-bold">{t.graveyardTitle}</h2>
          <StormGraveyard activeReplayId={activeReplay} onSelectReplay={selectReplay} fieldMode={fieldMode} />
          {data?.summary && <p className="mt-3 text-xs">{data.summary}</p>}
        </section>

        <footer className="text-center text-[11px]">{data?.assessment.disclaimer}</footer>
      </div>
    </main>
  );
}
