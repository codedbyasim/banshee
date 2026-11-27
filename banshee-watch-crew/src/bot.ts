import { assessFieldRisk, explainAssessment } from "@banshee/engine";
import { fetchLiveKpIndex, fetchLiveSolarWind, STORM_REPLAYS } from "@banshee/feeds";

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
  const fallback = STORM_REPLAYS["multan-sunset"];

  const assessment = assessFieldRisk({
    latDeg: field.latDeg,
    lonDeg: field.lonDeg,
    timestampIso: new Date().toISOString(),
    elevationMaskDeg: 10,
    solarWind: liveWind ?? fallback.solarWind,
    glotec: fallback.glotec,
    kpIndex: liveKp ?? fallback.kpIndex,
    satellites: fallback.satellites,
    feedAges: {
      solarWindAgeMin: liveWind ? 2 : 40,
      glotecAgeMin: 10,
      kpAgeMin: liveKp !== null ? 15 : 200,
      gnssAgeMin: 60,
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
