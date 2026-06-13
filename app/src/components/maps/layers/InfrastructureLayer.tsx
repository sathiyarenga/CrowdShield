/**
 * InfrastructureLayer — deck.gl overlay for real-world facilities.
 *
 * Renders hospitals, police, fire stations, pharmacies, clinics, and transit
 * stops from OSM Overpass data using deck.gl IconLayer on top of MapLibre.
 */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { IconLayer, TextLayer } from "@deck.gl/layers";
import type maplibregl from "maplibre-gl";
import { api } from "@/lib/api/client";
import styles from "./InfrastructureLayer.module.css";

/* -- Facility icon config --------------------------------------------- */

const FACILITY_CONFIGS: Record<
  string,
  { emoji: string; label: string; color: [number, number, number]; enabled: boolean }
> = {
  hospital: { emoji: "🏥", label: "Hospitals", color: [239, 68, 68], enabled: true },
  police: { emoji: "🚔", label: "Police", color: [59, 130, 246], enabled: true },
  fire_station: { emoji: "🚒", label: "Fire Stations", color: [249, 115, 22], enabled: true },
  pharmacy: { emoji: "💊", label: "Pharmacies", color: [34, 197, 94], enabled: false },
  clinic: { emoji: "🩺", label: "Clinics", color: [236, 72, 153], enabled: false },
};

const TRANSIT_CONFIGS: Record<
  string,
  { emoji: string; label: string; color: [number, number, number] }
> = {
  bus_stop: { emoji: "🚌", label: "Bus Stops", color: [234, 179, 8] },
  tram_stop: { emoji: "🚊", label: "Tram Stops", color: [139, 92, 246] },
  train_station: { emoji: "🚆", label: "Train Stations", color: [99, 102, 241] },
};

/* -- Types ------------------------------------------------------------- */

interface FacilityFeature {
  type: "Feature";
  properties: {
    osm_id: number;
    name: string;
    facility_type: string;
    icon: string;
    color: string;
    label: string;
    distance_km: number;
    walking_minutes: number;
    address?: string;
    phone?: string;
    website?: string;
    opening_hours?: string;
    operator?: string;
  };
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
}

interface Props {
  venueId: string;
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  visible: boolean;
}

/* -- Component --------------------------------------------------------- */

export default function InfrastructureLayer({ venueId, map, mapLoaded, visible }: Props) {
  const [facilities, setFacilities] = useState<FacilityFeature[]>([]);
  const [transit, setTransit] = useState<FacilityFeature[]>([]);
  const [enabledTypes, setEnabledTypes] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    Object.entries(FACILITY_CONFIGS).forEach(([k, v]) => { initial[k] = v.enabled; });
    initial.transit = false;
    return initial;
  });
  const [loading, setLoading] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState<FacilityFeature | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);

  /* -- Fetch data --------------------------------------------------- */
  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    setLoading(true);

    Promise.all([
      api.spatial.facilities(venueId, 5000).catch(() => ({ features: [] })),
      api.spatial.transit(venueId, 3000).catch(() => ({ features: [] })),
    ]).then(([facResult, transitResult]) => {
      if (cancelled) return;
      setFacilities((facResult as any).features ?? []);
      setTransit((transitResult as any).features ?? []);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [venueId, visible]);

  /* -- Build deck.gl layers ----------------------------------------- */
  const buildLayers = useCallback(() => {
    if (!visible) return [];

    const activeFacilities = facilities.filter(
      (f) => enabledTypes[f.properties.facility_type]
    );
    const activeTransit = enabledTypes.transit ? transit : [];

    const allPoints = [...activeFacilities, ...activeTransit];
    if (allPoints.length === 0) return [];

    const iconLayer = new IconLayer<FacilityFeature>({
      id: "infrastructure-icons",
      data: allPoints,
      pickable: true,
      getPosition: (d) => d.geometry.coordinates,
      getIcon: () => "marker",
      iconAtlas: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      iconMapping: { marker: { x: 0, y: 0, width: 1, height: 1, mask: true } },
      getSize: 18,
      getColor: (d) => {
        const config = FACILITY_CONFIGS[d.properties.facility_type] ??
          TRANSIT_CONFIGS[d.properties.facility_type];
        return config ? [...config.color, 230] as [number, number, number, number] : [150, 150, 150, 200];
      },
      onClick: (info) => {
        if (info.object) {
          setSelectedFacility(info.object);
        }
      },
    });

    const textLayer = new TextLayer<FacilityFeature>({
      id: "infrastructure-labels",
      data: allPoints,
      getPosition: (d) => d.geometry.coordinates,
      getText: (d) => {
        const config = FACILITY_CONFIGS[d.properties.facility_type] ??
          TRANSIT_CONFIGS[d.properties.facility_type];
        return config?.emoji ?? "📍";
      },
      getSize: 22,
      getTextAnchor: "middle" as const,
      getAlignmentBaseline: "center" as const,
      fontFamily: "system-ui",
      billboard: true,
    });

    return [iconLayer, textLayer];
  }, [visible, facilities, transit, enabledTypes]);

  /* -- Manage deck.gl overlay on MapLibre --------------------------- */
  useEffect(() => {
    if (!map || !mapLoaded) return;

    // Create overlay if needed
    if (!overlayRef.current) {
      const overlay = new MapboxOverlay({
        interleaved: true,
        layers: [],
      });
      map.addControl(overlay as any);
      overlayRef.current = overlay;
    }

    // Update layers
    const layers = buildLayers();
    overlayRef.current.setProps({ layers });
  }, [map, mapLoaded, buildLayers]);

  /* -- Cleanup ------------------------------------------------------ */
  useEffect(() => {
    return () => {
      if (overlayRef.current && map) {
        try {
          map.removeControl(overlayRef.current as any);
        } catch { /* map may already be destroyed */ }
        overlayRef.current = null;
      }
    };
  }, [map]);

  /* -- Toggle handler ----------------------------------------------- */
  const toggleType = (type: string) => {
    setEnabledTypes((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  if (!visible) return null;

  return (
    <>
      {/* Layer control panel */}
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.headerIcon}>🏗️</span>
          <span>Infrastructure</span>
          {loading && <span className={styles.spinner}>⏳</span>}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Emergency Services</div>
          {Object.entries(FACILITY_CONFIGS).map(([type, config]) => {
            const count = facilities.filter(
              (f) => f.properties.facility_type === type
            ).length;
            return (
              <label key={type} className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={enabledTypes[type] ?? false}
                  onChange={() => toggleType(type)}
                />
                <span
                  className={styles.dot}
                  style={{ background: config.color.join(",").replace(/(.*)/, "rgb($1)") }}
                />
                <span className={styles.emoji}>{config.emoji}</span>
                <span>{config.label}</span>
                <span className={styles.count}>{count}</span>
              </label>
            );
          })}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Transport</div>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={enabledTypes.transit ?? false}
              onChange={() => toggleType("transit")}
            />
            <span className={styles.emoji}>🚌</span>
            <span>Transit Stops</span>
            <span className={styles.count}>{transit.length}</span>
          </label>
        </div>

        <div className={styles.stats}>
          {facilities.length + transit.length} facilities loaded
        </div>
      </div>

      {/* Popup for selected facility */}
      {selectedFacility && (
        <div className={styles.popup}>
          <button className={styles.popupClose} onClick={() => setSelectedFacility(null)}>×</button>
          <div className={styles.popupTitle}>
            {(() => {
              const config = FACILITY_CONFIGS[selectedFacility.properties.facility_type] ??
                TRANSIT_CONFIGS[selectedFacility.properties.facility_type];
              return config?.emoji ?? "📍";
            })()}
            {" "}
            {selectedFacility.properties.name}
          </div>
          <div className={styles.popupType}>{selectedFacility.properties.label}</div>
          <div className={styles.popupRow}>
            <span>Distance</span>
            <span>{selectedFacility.properties.distance_km} km</span>
          </div>
          <div className={styles.popupRow}>
            <span>Walking</span>
            <span>~{selectedFacility.properties.walking_minutes} min</span>
          </div>
          {selectedFacility.properties.address && (
            <div className={styles.popupRow}>
              <span>Address</span>
              <span>{selectedFacility.properties.address}</span>
            </div>
          )}
          {selectedFacility.properties.phone && (
            <div className={styles.popupRow}>
              <span>Phone</span>
              <span>{selectedFacility.properties.phone}</span>
            </div>
          )}
          {selectedFacility.properties.operator && (
            <div className={styles.popupRow}>
              <span>Operator</span>
              <span>{selectedFacility.properties.operator}</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
