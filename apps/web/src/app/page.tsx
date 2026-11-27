"use client";
import { useEffect, useState } from "react";
import type { PresetId } from "@banshee/engine";
import { AssessmentStatus, ReasonList } from "@/components/AssessmentStatus";
import { BansheeDial } from "@/components/BansheeDial";
import { HauntedSkyPlot } from "@/components/HauntedSkyPlot";
import { StormGraveyard } from "@/components/StormGraveyard";
import { WailAudio } from "@/components/WailAudio";
import type { AssessResponse as ApiResponse } from "@/lib/assess";
import { formatMetric } from "@/lib/format";
import { COPY as t } from "@/lib/i18n";

export default function HomePage() {
  const [fieldMode, setFieldMode] = useState(false);
  const [lat, setLat] = useState("30.1575");
  const [lon, setLon] = useState("71.5249");
  const [presetId, setPresetId] = useState<PresetId>("TRACTOR_RTK");
  const [mask, setMask] = useState("15");
  const [replayId, setReplayId] = useState<string | null>("gannon-2024");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Raw inputs are sent as typed; the engine clamps the mask and flags invalid values.
  const loadAssessment = async (targetReplay: string | null) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ presetId });
      if (presetId === "CUSTOM") qs.set("elevationMaskDeg", mask);
      if (targetReplay) {
        qs.set("replay", targetReplay);
      } else {
        qs.set("lat", lat);
        qs.set("lon", lon);
      }
      const res = await fetch(`/api/assess?${qs.toString()}`);
      const json = (await res.json()) as ApiResponse;
      setData(json);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAssessment(replayId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayId, presetId]);

  const cardCls = fieldMode
    ? "rounded-2xl border border-slate-900 bg-white p-5 text-slate-950"
    : "rounded-2xl border border-slate-800 bg-[#0F1420] p-5 text-slate-100";

  return (
    <main
      className={`min-h-screen px-4 py-6 sm:px-8 ${
        fieldMode ? "bg-slate-100 text-slate-950" : "bg-[#07090F] text-slate-100"
      }`}
    >
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-purple-400">{t.title}</h1>
            <p className="text-sm opacity-80">{t.tagline}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <WailAudio labelPlay={t.wailBtn} labelMute={t.muteBtn} fieldMode={fieldMode} />
            <button
              type="button"
              onClick={() => setFieldMode((v) => !v)}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold"
            >
              {fieldMode ? t.hauntMode : t.fieldMode}
            </button>
          </div>
        </header>

        {/* Replay / Unverified archive / Stale / Invalid input banners */}
        {data && <AssessmentStatus assessment={data.assessment} />}

        {/* Controls */}
        <section className={`${cardCls} flex flex-wrap items-end gap-4`}>
          <label className="flex flex-col text-xs font-semibold">
            {t.lat}
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="mt-1 w-28 rounded border border-slate-600 bg-transparent px-2 py-1 font-mono text-sm"
            />
          </label>
          <label className="flex flex-col text-xs font-semibold">
            {t.lon}
            <input
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              className="mt-1 w-28 rounded border border-slate-600 bg-transparent px-2 py-1 font-mono text-sm"
            />
          </label>
          <label className="flex flex-col text-xs font-semibold">
            {t.preset}
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value as PresetId)}
              className={`mt-1 rounded border border-slate-600 px-2 py-1 text-sm ${
                fieldMode ? "bg-white text-slate-950" : "bg-[#0F1420] text-slate-100"
              }`}
            >
              <option value="TRACTOR_RTK">{t.presetTRACTOR_RTK}</option>
              <option value="SURVEY_DRONE">{t.presetSURVEY_DRONE}</option>
              <option value="CUSTOM">{t.presetCUSTOM}</option>
            </select>
          </label>
          {presetId === "CUSTOM" && (
            <label className="flex flex-col text-xs font-semibold">
              {t.elevMask}
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={90}
                step={1}
                value={mask}
                onChange={(e) => setMask(e.target.value)}
                onBlur={() => {
                  void loadAssessment(replayId);
                }}
                className="mt-1 w-20 rounded border border-slate-600 bg-transparent px-2 py-1 font-mono text-sm tabular-nums"
              />
            </label>
          )}
          <button
            type="button"
            onClick={() => {
              setReplayId(null);
              void loadAssessment(null);
            }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
          >
            {loading ? "..." : t.liveCheck}
          </button>
        </section>

        {data?.assessment.preset && (
          <section aria-label={t.effectivePreset} className={`${cardCls} space-y-1 text-xs`}>
            <div className="font-mono tabular-nums">
              <span className="font-bold">{t.effectivePreset}:</span>{" "}
              {data.assessment.preset.label} ({data.assessment.preset.id}) · {t.maskLabel}{" "}
              {data.assessment.preset.elevationMaskDeg}° · {t.gainLabel} {data.assessment.preset.gain}
            </div>
            {data.assessment.unknownPresetReason && (
              <p role="status" className="font-semibold text-amber-500">
                {data.assessment.unknownPresetReason}
              </p>
            )}
            {data.assessment.customMaskDefaultedReason && (
              <p role="status" className="font-semibold text-amber-500">
                {data.assessment.customMaskDefaultedReason}
              </p>
            )}
          </section>
        )}

        {/* Main Grid */}
        {data && (
          <div className="grid gap-6 md:grid-cols-3">
            <BansheeDial
              score={data.assessment.score}
              level={data.assessment.level}
              fieldMode={fieldMode}
            />

            <section className={cardCls}>
              <h2 className="text-sm font-bold">{t.skyPlotTitle}</h2>
              <p className="mb-3 text-xs opacity-75">{t.skyPlotSub}</p>
              <HauntedSkyPlot satellites={data.assessment.satellites} fieldMode={fieldMode} />
              <div className="mt-2 flex justify-around font-mono text-xs tabular-nums">
                <span className="text-emerald-400">Clean: {data.assessment.cleanSatellites}</span>
                <span className="text-purple-400">Ghost: {data.assessment.ghostSatellites}</span>
                <span>PDOP: {data.assessment.cleanPdopEstimate}</span>
              </div>
            </section>

            <section className={`${cardCls} space-y-4`}>
              <div>
                <h2 className="text-sm font-bold">{t.omensTitle}</h2>
                <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-xs tabular-nums">
                  <div className="rounded-lg border border-slate-700/60 p-2">
                    <div className="opacity-70">L1 Lead Time</div>
                    <div className="text-base font-bold text-purple-400">
                      {formatMetric(data.assessment.leadTimeMinutes, "min")}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-700/60 p-2">
                    <div className="opacity-70">Solar Wind</div>
                    <div className="text-base font-bold">
                      {formatMetric(data.assessment.solarWindSpeedKmS, "km/s")}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-700/60 p-2">
                    <div className="opacity-70">IMF Bz (GSM)</div>
                    <div className="text-base font-bold text-red-400">
                      {formatMetric(data.assessment.bzNt, "nT")}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-700/60 p-2">
                    <div className="opacity-70">Max L1 Delay</div>
                    <div className="text-base font-bold">
                      {formatMetric(data.assessment.maxL1DelayMeters, "m")}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-700/60 p-2">
                    <div className="opacity-70">Mean vTEC (regional estimate)</div>
                    <div className="text-base font-bold">
                      {formatMetric(data.assessment.meanVtec, "TECU")}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-700/60 p-2">
                    <div className="opacity-70">Kp</div>
                    <div className="text-base font-bold">
                      {formatMetric(data.assessment.kpIndex, "")}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold">{t.voiceTitle}</h3>
                <p className="mt-1 text-xs leading-relaxed opacity-90">{data.explanation}</p>
              </div>

              <div>
                <h3 className="text-sm font-bold">{t.reasonsTitle}</h3>
                <ReasonList assessment={data.assessment} />
              </div>
            </section>
          </div>
        )}

        {/* Graveyard of Storms */}
        <section className={cardCls}>
          <h2 className="mb-3 text-sm font-bold">{t.graveyardTitle}</h2>
          <StormGraveyard
            activeReplayId={replayId}
            onSelectReplay={(id) => setReplayId(id)}
            fieldMode={fieldMode}
          />
          {data?.summary && <p className="mt-3 text-xs opacity-80">{data.summary}</p>}
        </section>

        <footer className="text-center text-[11px] opacity-70">
          {data?.assessment.disclaimer}
        </footer>
      </div>
    </main>
  );
}
