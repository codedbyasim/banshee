import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetFeedCaches,
  fetchLiveGloTec,
  fetchLiveGnssElements,
  fetchLiveKp,
  fetchLiveKpIndex,
  fetchLiveSolarWind,
  type FeedFetchOptions,
} from "../src/fetchers.js";
import { joinRtswWindMag, parseGloTecGeoJson, parseKpRows, parseRtswSolarWind } from "../src/parsers.js";

type Routes = Record<string, unknown | (() => unknown)>;

/** Fake fetch: routes by URL; a missing route rejects like a network failure. */
function fakeFetch(routes: Routes) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (!(url in routes)) throw new Error(`network down: ${url}`);
    const r = routes[url];
    const body = typeof r === "function" ? (r as () => unknown)() : r;
    if (body instanceof Error) throw body;
    if (typeof body === "number") return new Response("err", { status: body });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/geo+json" } });
  }) as typeof fetch;
  return { impl, calls };
}

function opts(fetchImpl: typeof fetch, nowIso: string): FeedFetchOptions {
  const ms = Date.parse(nowIso);
  return { fetchImpl, now: () => ms, timeoutMs: 1000 };
}

const SWPC = "https://services.swpc.noaa.gov";
const GLOTEC_INDEX = `${SWPC}/products/glotec/geojson_2d_urt.json`;
const GLOTEC_FILE = `${SWPC}/products/glotec/geojson_2d_urt/glotec_icao_20261127T101500Z.geojson`;
const OLD_FILE = `${SWPC}/products/glotec/geojson_2d_urt/glotec_icao_20261127T100500Z.geojson`;
const KP_URL = `${SWPC}/products/noaa-planetary-k-index.json`;
const WIND_URL = `${SWPC}/json/rtsw/rtsw_wind_1m.json`;
const MAG_URL = `${SWPC}/json/rtsw/rtsw_mag_1m.json`;
const GNSS_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=gnss&FORMAT=json";

const glotecIndex = [
  { url: "/products/glotec/geojson_2d_urt/glotec_icao_20261127T100500Z.geojson", time_tag: "2026-11-27T10:05:00Z" },
  { url: "/products/glotec/geojson_2d_urt/glotec_icao_20261127T101500Z.geojson", time_tag: "2026-11-27T10:15:00Z" },
];

function point(lon: number, lat: number, props: Record<string, unknown>) {
  return { type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: props };
}

const glotecFile = {
  type: "FeatureCollection",
  time_tag: "2026-11-27T10:15:00Z",
  product: "GloTEC",
  cadence: 10,
  metadata: {},
  features: [
    point(67.5, 28.75, { tec: 9.28, anomaly: 0.38, hmF2: 312.4, NmF2: 2.8e11, quality_flag: 0 }),
    point(72.5, 28.75, { tec: 10.5, anomaly: -1.2, quality_flag: 0 }),
    point(67.5, 31.25, { tec: 11, anomaly: -0.5, quality_flag: 0 }),
    point(72.5, 31.25, { tec: 12, anomaly: 0.1, quality_flag: 0 }),
  ],
};

const gnssRecord = {
  OBJECT_NAME: "GPS BIIR-2  (PRN 13)",
  OBJECT_ID: "1997-035A",
  EPOCH: "2026-11-26T12:00:00.000000",
  MEAN_MOTION: 2.00563178,
  ECCENTRICITY: 0.0091234,
  INCLINATION: 55.6573,
  RA_OF_ASC_NODE: 158.2914,
  ARG_OF_PERICENTER: 52.7342,
  MEAN_ANOMALY: 308.1234,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: "U",
  NORAD_CAT_ID: 24876,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 19543,
  BSTAR: 0,
  MEAN_MOTION_DOT: 4.5e-7,
  MEAN_MOTION_DDOT: 0,
};

beforeEach(() => __resetFeedCaches());

describe("parseGloTecGeoJson", () => {
  it("maps [lon, lat] to cells, keeps negative anomaly and drops junk rows", () => {
    const res = parseGloTecGeoJson({
      ...glotecFile,
      features: [
        ...glotecFile.features,
        null,
        point(10, 10, { tec: Number.NaN, anomaly: 1 }),
        point(10, 10, { tec: 5 }),
        point(10, 10, { tec: "junk", anomaly: 1 }),
        point(500, 10, { tec: 5, anomaly: 1 }),
        { geometry: { coordinates: [1] }, properties: { tec: 1, anomaly: 1 } },
        point(10, 10, { tec: -3, anomaly: 1 }),
      ],
    });
    expect(res.cells).toHaveLength(4);
    expect(res.invalidCount).toBe(7);
    expect(res.cells[1]).toEqual({ latDeg: 28.75, lonDeg: 72.5, vTec: 10.5, anomaly: -1.2 });
    expect(res.timestampIso).toBe("2026-11-27T10:15:00.000Z");
  });

  it("never throws on non-object payloads", () => {
    for (const p of [null, 1, "x", [], { features: "no" }]) {
      expect(parseGloTecGeoJson(p).cells).toEqual([]);
    }
  });
});

describe("fetchLiveGloTec", () => {
  it("index -> latest (last) entry -> GeoJSON grid", async () => {
    const f = fakeFetch({ [GLOTEC_INDEX]: glotecIndex, [GLOTEC_FILE]: glotecFile });
    const grid = await fetchLiveGloTec(opts(f.impl, "2026-11-27T10:20:00Z"));
    expect(grid).not.toBeNull();
    expect(grid!.timestampIso).toBe("2026-11-27T10:15:00.000Z");
    expect(grid!.latStepDeg).toBe(2.5);
    expect(grid!.lonStepDeg).toBe(5);
    expect(grid!.cells).toHaveLength(4);
    expect(f.calls).toEqual([GLOTEC_INDEX, GLOTEC_FILE]);
    expect(f.calls).not.toContain(OLD_FILE);
  });

  it("falls back to the index time_tag when the file has none", async () => {
    const { time_tag: _t, ...noTag } = glotecFile;
    const f = fakeFetch({ [GLOTEC_INDEX]: glotecIndex, [GLOTEC_FILE]: noTag });
    const grid = await fetchLiveGloTec(opts(f.impl, "2026-11-27T10:20:00Z"));
    expect(grid!.timestampIso).toBe("2026-11-27T10:15:00.000Z");
  });

  it("index failure, file failure, or an empty grid returns null", async () => {
    expect(await fetchLiveGloTec(opts(fakeFetch({}).impl, "2026-11-27T10:20:00Z"))).toBeNull();
    expect(await fetchLiveGloTec(opts(fakeFetch({ [GLOTEC_INDEX]: 503 }).impl, "2026-11-27T10:20:00Z"))).toBeNull();
    expect(await fetchLiveGloTec(opts(fakeFetch({ [GLOTEC_INDEX]: glotecIndex }).impl, "2026-11-27T10:20:00Z"))).toBeNull();
    const empty = fakeFetch({ [GLOTEC_INDEX]: glotecIndex, [GLOTEC_FILE]: { ...glotecFile, features: [] } });
    expect(await fetchLiveGloTec(opts(empty.impl, "2026-11-27T10:20:00Z"))).toBeNull();
  });

  it("refuses index links to another host", async () => {
    const f = fakeFetch({ [GLOTEC_INDEX]: [{ url: "https://evil.example/x.geojson", time_tag: "2026-11-27T10:15:00Z" }] });
    expect(await fetchLiveGloTec(opts(f.impl, "2026-11-27T10:20:00Z"))).toBeNull();
    expect(f.calls).toEqual([GLOTEC_INDEX]);
  });

  it("caches success for 10 minutes, refetches after, and never caches failure", async () => {
    let fail = true;
    const f = fakeFetch({
      [GLOTEC_INDEX]: () => (fail ? 500 : glotecIndex),
      [GLOTEC_FILE]: glotecFile,
    });
    const t0 = Date.parse("2026-11-27T10:20:00Z");
    let now = t0;
    const o: FeedFetchOptions = { fetchImpl: f.impl, now: () => now };

    expect(await fetchLiveGloTec(o)).toBeNull();
    fail = false;
    const first = await fetchLiveGloTec(o); // failure was not cached
    expect(first).not.toBeNull();
    const indexCalls = () => f.calls.filter((c) => c === GLOTEC_INDEX).length;
    expect(indexCalls()).toBe(2);

    now = t0 + 9 * 60_000;
    expect(await fetchLiveGloTec(o)).toBe(first);
    expect(indexCalls()).toBe(2); // cache hit

    now = t0 + 10 * 60_000;
    fail = true;
    expect(await fetchLiveGloTec(o)).toBeNull(); // expired entry is not served
    expect(indexCalls()).toBe(3);
  });
});

describe("fetchLiveGnssElements", () => {
  it("validates OMM records and caches for 6 hours", async () => {
    const f = fakeFetch({ [GNSS_URL]: [gnssRecord, { ...gnssRecord, MEAN_MOTION: "x" }, null, { OBJECT_NAME: "GPS" }] });
    const t0 = Date.parse("2026-11-27T10:00:00Z");
    let now = t0;
    const o: FeedFetchOptions = { fetchImpl: f.impl, now: () => now };
    const set = await fetchLiveGnssElements(o);
    expect(set).not.toBeNull();
    expect(set!.fetchedAtIso).toBe("2026-11-27T10:00:00.000Z");
    expect(set!.elements).toHaveLength(1);
    expect(set!.elements[0]!.NORAD_CAT_ID).toBe(24876);

    now = t0 + 6 * 3_600_000 - 1;
    expect(await fetchLiveGnssElements(o)).toBe(set);
    expect(f.calls).toHaveLength(1);

    now = t0 + 6 * 3_600_000;
    const again = await fetchLiveGnssElements(o);
    expect(f.calls).toHaveLength(2);
    expect(again!.fetchedAtIso).toBe(new Date(now).toISOString());
  });

  it("timeouts and failures return null and are not cached", async () => {
    const hang = (async (_u: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
      })) as typeof fetch;
    expect(await fetchLiveGnssElements({ fetchImpl: hang, timeoutMs: 20 })).toBeNull();
    const ok = fakeFetch({ [GNSS_URL]: [gnssRecord] });
    expect(await fetchLiveGnssElements({ fetchImpl: ok.impl })).not.toBeNull();
    expect(ok.calls).toHaveLength(1);
    __resetFeedCaches();
    expect(await fetchLiveGnssElements({ fetchImpl: fakeFetch({ [GNSS_URL]: [] }).impl })).toBeNull();
  });
});

describe("Kp (object format)", () => {
  const rows = [
    { time_tag: "2026-11-27T00:00:00", Kp: 1.67, a_running: 6, station_count: 8 },
    { time_tag: "2026-11-27T03:00:00", Kp: 1, a_running: 4, station_count: 8 },
    { time_tag: "2026-11-27T06:00:00", Kp: 0.33, a_running: 2, station_count: 8 },
  ];

  it("parseKpRows stamps samples with the interval end (time_tag + 3 h)", () => {
    expect(parseKpRows(rows)).toEqual([
      { kpIndex: 1.67, timestampIso: "2026-11-27T03:00:00.000Z" },
      { kpIndex: 1, timestampIso: "2026-11-27T06:00:00.000Z" },
      { kpIndex: 0.33, timestampIso: "2026-11-27T09:00:00.000Z" },
    ]);
    expect(parseKpRows([["time_tag", "Kp"], null, { time_tag: "bad", Kp: 1 }, { time_tag: "2026-11-27T00:00:00", Kp: 12 }])).toEqual([]);
  });

  it("fetchLiveKp returns the newest completed interval", async () => {
    const f = fakeFetch({ [KP_URL]: rows });
    expect(await fetchLiveKp(opts(f.impl, "2026-11-27T10:15:00Z"))).toEqual({
      kpIndex: 0.33,
      timestampIso: "2026-11-27T09:00:00.000Z",
    });
    // At 08:00 the 06:00-09:00 interval is still open, so the 03:00-06:00 value is used.
    expect(await fetchLiveKp(opts(f.impl, "2026-11-27T08:00:00Z"))).toEqual({
      kpIndex: 1,
      timestampIso: "2026-11-27T06:00:00.000Z",
    });
    expect(await fetchLiveKpIndex(opts(f.impl, "2026-11-27T10:15:00Z"))).toBe(0.33);
  });

  it("failure returns null", async () => {
    expect(await fetchLiveKp(opts(fakeFetch({}).impl, "2026-11-27T10:15:00Z"))).toBeNull();
    expect(await fetchLiveKpIndex(opts(fakeFetch({ [KP_URL]: 500 }).impl, "2026-11-27T10:15:00Z"))).toBeNull();
  });
});

describe("RTSW solar wind join", () => {
  // Newest first, as published, with an inactive spacecraft row on top.
  const wind = [
    { time_tag: "2026-11-27T10:14:00", active: false, source: "ACE", proton_speed: 999, proton_density: 99 },
    { time_tag: "2026-11-27T10:13:00", active: true, source: "SOLAR1", proton_speed: 412.3, proton_density: 4.1 },
    { time_tag: "2026-11-27T10:12:00", active: true, source: "SOLAR1", proton_speed: 405, proton_density: 4 },
    { time_tag: "2026-11-27T09:00:00", active: true, source: "SOLAR1", proton_speed: 300, proton_density: 2 },
  ];
  const mag = [
    { time_tag: "2026-11-27T10:14:00", active: false, source: "ACE", bt: 50, by_gsm: 50, bz_gsm: 50, by_gse: 50, bz_gse: 50 },
    { time_tag: "2026-11-27T10:14:00", active: true, source: "SOLAR1", bt: 6.2, by_gsm: -2.1, bz_gsm: -3.4, by_gse: 9.9, bz_gse: 8.8 },
    { time_tag: "2026-11-27T09:00:00", active: true, source: "SOLAR1", bt: 1, by_gsm: 1, bz_gsm: 1, by_gse: 1, bz_gse: 1 },
  ];

  it("joins the newest active wind and mag rows, GSM only, stamped with the older time", () => {
    expect(joinRtswWindMag(wind, mag)).toEqual({
      timestampIso: "2026-11-27T10:13:00.000Z",
      speedKmS: 412.3,
      densityCm3: 4.1,
      btNt: 6.2,
      byNt: -2.1,
      bzNt: -3.4,
      source: "SOLAR-1",
    });
  });

  it("picks the newest row even when the array is oldest first", () => {
    const s = joinRtswWindMag([...wind].reverse(), [...mag].reverse());
    expect(s!.speedKmS).toBe(412.3);
    expect(s!.bzNt).toBe(-3.4);
  });

  it("rejects a wind/mag mismatch over 5 minutes", () => {
    const lateMag = [{ ...mag[1]!, time_tag: "2026-11-27T10:18:01" }];
    expect(joinRtswWindMag(wind, lateMag)).toBeNull();
    const okMag = [{ ...mag[1]!, time_tag: "2026-11-27T10:18:00" }];
    expect(joinRtswWindMag(wind, okMag)).not.toBeNull();
  });

  it("rejects missing bz_gsm or density instead of inventing values, and ignores GSE", () => {
    const { bz_gsm: _bz, ...noBz } = mag[1]!;
    expect(joinRtswWindMag(wind, [noBz])).toBeNull();
    const { proton_density: _d, ...noDensity } = wind[1]!;
    expect(joinRtswWindMag([noDensity], mag)).toBeNull();
    expect(joinRtswWindMag(wind, [{ ...mag[1]!, bt: null }])).toBeNull();
  });

  it("fetchLiveSolarWind fetches both files and returns null if either fails", async () => {
    const both = fakeFetch({ [WIND_URL]: wind, [MAG_URL]: mag });
    const s = await fetchLiveSolarWind({ fetchImpl: both.impl });
    expect(s!.speedKmS).toBe(412.3);
    expect(both.calls.sort()).toEqual([MAG_URL, WIND_URL]);
    expect(await fetchLiveSolarWind({ fetchImpl: fakeFetch({ [WIND_URL]: wind }).impl })).toBeNull();
    expect(await fetchLiveSolarWind({ fetchImpl: fakeFetch({ [WIND_URL]: wind, [MAG_URL]: 500 }).impl })).toBeNull();
  });

  it("parseRtswSolarWind no longer invents density/Bt/By for incomplete rows", () => {
    const res = parseRtswSolarWind([
      { time_tag: "2026-11-27 10:00:00", proton_speed: 400, bz_gsm: -2 },
      { time_tag: "2026-11-27 10:00:00", proton_speed: 400, proton_density: 3, bt: 5, by_gsm: 1, bz_gsm: -2 },
    ]);
    expect(res.invalidCount).toBe(1);
    expect(res.valid).toEqual([
      { timestampIso: "2026-11-27T10:00:00.000Z", speedKmS: 400, densityCm3: 3, btNt: 5, byNt: 1, bzNt: -2, source: "SOLAR-1" },
    ]);
  });
});
