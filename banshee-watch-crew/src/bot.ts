import { assessFieldRisk, explainAssessment } from "@banshee/engine";
import { fetchLiveKpIndex, fetchLiveSolarWind } from "@banshee/feeds";

interface SavedField {
  name: string;
  latDeg: number;
  lonDeg: number;
}

const DEFAULT_FIELDS: SavedField[] = [
  { name: "Multan Cotton Block A", latDeg: 30.1575, lonDeg: 71.5249 },
  { name: "Islamabad Drone Pad", latDeg: 33.6844, lonDeg: 73.0479 },
];

export async function checkFieldStatus(field: SavedField) {
  const [liveWind, liveKp] = await Promise.all([
    fetchLiveSolarWind(),
    fetchLiveKpIndex(),
  ]);
  const now = Date.now();
  const windAgeMin = liveWind
    ? Math.max(0, (now - Date.parse(liveWind.timestampIso)) / 60_000)
    : null;

  // Missing feeds are passed as null/empty so the engine treats them as stale
  // and never reports "Safe" (fail-safe staleness rule). No replay data is used.
  const assessment = assessFieldRisk({
    latDeg: field.latDeg,
    lonDeg: field.lonDeg,
    timestampIso: new Date(now).toISOString(),
    elevationMaskDeg: 10,
    solarWind: liveWind,
    glotec: null,
    kpIndex: liveKp,
    satellites: [],
    feedAges: {
      solarWindAgeMin: Number.isFinite(windAgeMin) ? windAgeMin : null,
      glotecAgeMin: null,
      kpAgeMin: liveKp !== null ? 0 : null,
      gnssAgeMin: null,
    },
  });

  return {
    field: field.name,
    level: assessment.level,
    score: assessment.score,
    message: explainAssessment(assessment),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  Promise.all(DEFAULT_FIELDS.map((f) => checkFieldStatus(f))).then((results) => {
    console.log("Banshee Watch Heartbeat Report:");
    console.log(JSON.stringify(results, null, 2));
  });
}
