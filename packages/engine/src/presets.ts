export type PresetId = "TRACTOR_RTK" | "SURVEY_DRONE" | "CUSTOM";

export interface SensitivityPreset {
  id: PresetId;
  label: string;
  elevationMaskDeg: number;
  gain: number;
}

export const SENSITIVITY_PRESETS: Readonly<Record<PresetId, SensitivityPreset>> =
  Object.freeze({
    // Default, tunable.
    TRACTOR_RTK: Object.freeze({ id: "TRACTOR_RTK", label: "Tractor RTK", elevationMaskDeg: 15, gain: 1.0 }),
    // Default, tunable.
    SURVEY_DRONE: Object.freeze({ id: "SURVEY_DRONE", label: "Survey Drone", elevationMaskDeg: 10, gain: 1.15 }),
    // Mask here is only the default; the caller mask is used at resolve time.
    CUSTOM: Object.freeze({ id: "CUSTOM", label: "Custom", elevationMaskDeg: 15, gain: 1.0 }),
  } as Record<PresetId, SensitivityPreset>);

export const DEFAULT_PRESET_ID: PresetId = "TRACTOR_RTK";
export const DEFAULT_CUSTOM_MASK_DEG = 15;

export interface ResolvedPreset {
  preset: SensitivityPreset;
  unknownRequested: string | null;
  customMaskDefaulted: boolean;
}

function isPresetId(id: unknown): id is PresetId {
  return (
    typeof id === "string" &&
    Object.prototype.hasOwnProperty.call(SENSITIVITY_PRESETS, id)
  );
}

function describeUnknown(id: unknown): string {
  if (typeof id === "string") return id;
  try {
    return String(id);
  } catch {
    return typeof id;
  }
}

export function resolvePreset(id: unknown, callerMaskDeg?: unknown): ResolvedPreset {
  if (id === undefined) {
    return { preset: SENSITIVITY_PRESETS[DEFAULT_PRESET_ID], unknownRequested: null, customMaskDefaulted: false };
  }
  if (!isPresetId(id)) {
    return {
      preset: SENSITIVITY_PRESETS[DEFAULT_PRESET_ID],
      unknownRequested: describeUnknown(id),
      customMaskDefaulted: false,
    };
  }
  if (id !== "CUSTOM") {
    return { preset: SENSITIVITY_PRESETS[id], unknownRequested: null, customMaskDefaulted: false };
  }
  const base = SENSITIVITY_PRESETS.CUSTOM;
  if (typeof callerMaskDeg === "number" && Number.isFinite(callerMaskDeg)) {
    const mask = Math.min(90, Math.max(0, callerMaskDeg));
    return { preset: { ...base, elevationMaskDeg: mask }, unknownRequested: null, customMaskDefaulted: false };
  }
  return {
    preset: { ...base, elevationMaskDeg: DEFAULT_CUSTOM_MASK_DEG },
    unknownRequested: null,
    customMaskDefaulted: true,
  };
}
