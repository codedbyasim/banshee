import type { PresetId } from "./presets.js";

export type RiskLevel = "Safe" | "Uneasy" | "Haunted";

export interface SolarWindSample {
  timestampIso: string;
  speedKmS: number;      // km/s (physical range 250..3000)
  densityCm3: number;    // protons/cm^3
  btNt: number;          // nT total IMF
  byNt: number;          // nT GSM By
  bzNt: number;          // nT GSM Bz (negative = southward)
  source: "SOLAR-1" | "ACE" | "IMAP" | "OMNI_ARCHIVE";
}

export interface GloTecCell {
  latDeg: number;
  lonDeg: number;
  vTec: number;          // TECU
  anomaly: number;       // TECU anomaly above quiet baseline
}

export interface GloTecGrid {
  timestampIso: string;
  latStepDeg: number;    // typically 2.5
  lonStepDeg: number;    // typically 5.0
  cells: GloTecCell[];
}

export interface SatelliteObservation {
  id: string;
  name: string;
  constellation: "GPS" | "GALILEO" | "GLONASS" | "BEIDOU";
  elevationDeg: number;  // 0..90
  azimuthDeg: number;    // 0..360
}

/**
 * Minimal CelesTrak GP (OMM JSON) element record, as returned by
 * `gp.php?GROUP=gnss&FORMAT=json`. Angles in degrees, MEAN_MOTION in rev/day,
 * EPOCH is ISO-8601 UTC (CelesTrak omits the trailing "Z").
 */
export interface GnssOmmElement {
  OBJECT_NAME: string;
  OBJECT_ID: string;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  EPHEMERIS_TYPE?: number;
  CLASSIFICATION_TYPE?: string;
  NORAD_CAT_ID: number;
  ELEMENT_SET_NO: number;
  REV_AT_EPOCH?: number;
  BSTAR: number;
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
}

export interface PiercePoint {
  latDeg: number;        // strictly [-90, 90]
  lonDeg: number;        // strictly [-180, 180)
  slantFactor: number;   // M(el) >= 1
}

export interface SatelliteRiskDetail {
  id: string;
  name: string;
  constellation: SatelliteObservation["constellation"];
  elevationDeg: number;
  azimuthDeg: number;
  ipp: PiercePoint;
  /** TECU; null when GloTEC is unavailable (FR-RE-16). */
  vTec: number | null;
  sTec: number | null;
  l1DelayMeters: number | null;
  anomaly: number | null;
  isGhost: boolean;
}

export interface FeedAgesMinutes {
  solarWindAgeMin: number | null;
  glotecAgeMin: number | null;
  kpAgeMin: number | null;
  gnssAgeMin: number | null;
}

export interface RiskDriver {
  code:
    | "SOLAR_WIND_COUPLING"
    | "IONOSPHERE_TEC"
    | "KP_GEOMAGNETIC"
    | "CLEAN_SATELLITES"
    | "LOW_LAT_POST_SUNSET"
    | "STALE_DATA"
    | "INVALID_INPUT"
    | "NO_VISIBLE_SATELLITES"
    | "REPLAY_UNVERIFIED";
  label: string;
  contribution: number;
  /** null when the source feed is unavailable; render as "unavailable" (FR-RE-19). */
  metricValue: number | null;
  unit: string;
}

export interface EffectivePresetInfo {
  id: PresetId;
  label: string;
  elevationMaskDeg: number;
  gain: number;
}

export interface FeedStatus {
  ageMin: number | null;
  source: string | null;
}

export interface FeedStatuses {
  solarWind: FeedStatus;
  glotec: FeedStatus;
  kp: FeedStatus;
  gnss: FeedStatus;
}

export interface RiskAssessmentInput {
  latDeg: number;
  lonDeg: number;
  timestampIso: string;
  /** Sensitivity preset id (PresetId, including CUSTOM). Unknown or missing values resolve to TRACTOR_RTK. */
  presetId?: PresetId | (string & {});
  /** Read only when the preset is CUSTOM; ignored by other presets. */
  elevationMaskDeg?: number;
  solarWind: SolarWindSample | null;
  glotec: GloTecGrid | null;
  kpIndex: number | null;
  satellites: SatelliteObservation[];
  feedAges: FeedAgesMinutes;
  isReplay?: boolean;
  replayLabel?: string;
  /**
   * Strict ISO-8601 archive instant (FR-RE-22). Required with a non-empty replayLabel for a
   * valid replay. Feed ages are measured from sample timestamps against it (FR-RE-23).
   */
  replayArchiveIso?: string;
}

/** "none": not a replay; "verified": valid replay; "unverified": replay requested but rejected (FR-RE-22). */
export type ReplayState = "none" | "verified" | "unverified";

export interface RiskAssessment {
  score: number;                   // 0..100 integer
  level: RiskLevel;                // Safe | Uneasy | Haunted
  isStale: boolean;
  isReplay: boolean;
  /** Replay verification state; "unverified" means the archive could not be trusted. */
  replayState: ReplayState;
  /** Set when isReplay was requested but the replay was rejected (FR-RE-22). */
  replayInvalidReason?: string;
  replayLabel?: string;
  replayArchiveIso?: string;
  leadTimeMinutes: number | null;
  newellCoupling: number;
  kpIndex: number | null;
  solarWindSpeedKmS: number | null;
  bzNt: number | null;
  visibleSatellites: number;
  cleanSatellites: number;
  ghostSatellites: number;
  cleanPdopEstimate: number;
  /** null when GloTEC is unavailable or no satellite is visible. */
  meanVtec: number | null;
  maxL1DelayMeters: number | null;
  lowLatPostSunsetActive: boolean;
  satellites: SatelliteRiskDetail[];
  topReasons: RiskDriver[];
  /** Effective preset used for this assessment. */
  preset?: EffectivePresetInfo;
  /** Per-feed age and source attribution. */
  feeds?: FeedStatuses;
  /** Set when the requested preset id was unknown (holds the requested value); TRACTOR_RTK was used. */
  unknownPresetReason?: string;
  /** Set when CUSTOM had a missing or invalid mask and 15 degrees was applied. */
  customMaskDefaultedReason?: string;
  /** Names of invalid observer/time fields (FR-RE-14). Present only when non-empty. */
  invalidInput?: string[];
  disclaimer: string;
  assessedAtIso: string;
}

export interface AlertState {
  activeLevel: RiskLevel;
  lastEventId: string | null;
  lastNotifiedAtIso: string | null;
}

export interface AlertDecision {
  shouldNotify: boolean;
  nextState: AlertState;
  reason: string;
}
