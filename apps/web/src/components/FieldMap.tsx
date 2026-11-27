"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import {
  CARTO_DARK_ATTRIBUTION,
  CARTO_DARK_TILE_URL,
  OSM_LIGHT_ATTRIBUTION,
  OSM_LIGHT_TILE_URL,
} from "@/lib/sources";
import { validateLatLon } from "@/lib/validateLatLon";

export interface Location {
  latDeg: number;
  lonDeg: number;
  label?: string;
}

export interface PresetLocation {
  id: string;
  label: string;
  latDeg: number;
  lonDeg: number;
}

export interface FieldMapProps {
  location: Location;
  onPick: (loc: Location) => void;
  fieldMode: boolean;
  presets?: readonly PresetLocation[];
}

/** Tile provider for the current theme (Carto dark in Haunted Mode, OSM in Field Mode). */
export function tileConfig(fieldMode: boolean): { url: string; attribution: string } {
  return fieldMode
    ? { url: OSM_LIGHT_TILE_URL, attribution: OSM_LIGHT_ATTRIBUTION }
    : { url: CARTO_DARK_TILE_URL, attribution: CARTO_DARK_ATTRIBUTION };
}

// A divIcon avoids Leaflet's default marker image URLs, which bundlers break.
const PIN_ICON = L.divIcon({
  className: "",
  html: '<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#e11d48;border:2px solid #fff;box-shadow:0 0 6px rgba(0,0,0,.6)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 18],
});

function ClickHandler({ onPick }: { onPick: (loc: Location) => void }) {
  useMapEvents({
    click(e) {
      const v = validateLatLon(e.latlng.lat, e.latlng.lng);
      if (v.ok && v.latDeg !== null && v.lonDeg !== null) {
        onPick({ latDeg: v.latDeg, lonDeg: v.lonDeg });
      }
    },
  });
  return null;
}

function Recenter({ latDeg, lonDeg }: { latDeg: number; lonDeg: number }) {
  const map = useMap();
  useEffect(() => {
    const current = map.getCenter();
    if (Math.abs(current.lat - latDeg) > 1e-9 || Math.abs(current.lng - lonDeg) > 1e-9) {
      map.setView([latDeg, lonDeg], map.getZoom());
    }
  }, [map, latDeg, lonDeg]);
  return null;
}

export default function FieldMap({ location, onPick, fieldMode, presets }: FieldMapProps) {
  const tiles = useMemo(() => tileConfig(fieldMode), [fieldMode]);
  const center: [number, number] = [location.latDeg, location.lonDeg];

  return (
    <MapContainer
      center={center}
      zoom={6}
      attributionControl
      style={{ height: "320px", width: "100%" }}
      aria-label="Field location map. Click to place a pin."
    >
      <TileLayer key={fieldMode ? "field" : "haunted"} url={tiles.url} attribution={tiles.attribution} />
      <ClickHandler onPick={onPick} />
      <Recenter latDeg={location.latDeg} lonDeg={location.lonDeg} />
      <Marker position={center} icon={PIN_ICON} />
      {presets?.map((p) => (
        <Marker
          key={p.id}
          position={[p.latDeg, p.lonDeg]}
          opacity={0.6}
          title={p.label}
          eventHandlers={{ click: () => onPick({ latDeg: p.latDeg, lonDeg: p.lonDeg, label: p.label }) }}
        />
      ))}
    </MapContainer>
  );
}
