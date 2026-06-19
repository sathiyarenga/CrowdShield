"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { api, type FredrikstadHourlyProfile, type FredrikstadHourlyPoint } from "@/lib/api/client";

// ── Types ──────────────────────────────────────────────────────────────────

interface SelectedArea {
  area_code: string;
  area_name: string;
  daily_max_people: number;
  daily_mean_people: number;
  days_observed: number;
}

interface FredrikstadMapProps {
  onAreaSelect?: (area: SelectedArea | null) => void;
}

// ── Activity tier colors ───────────────────────────────────────────────────

function tierColor(peak: number): string {
  if (peak >= 5000) return "#ef4444"; // red
  if (peak >= 2000) return "#f59e0b"; // orange
  if (peak >= 500) return "#22c55e";  // green
  return "#6b7280";                   // grey
}

function tierLabel(peak: number): string {
  if (peak >= 5000) return "High Activity";
  if (peak >= 2000) return "Moderate";
  if (peak >= 500) return "Standard";
  return "Low";
}

// ── Map Component ──────────────────────────────────────────────────────────

export default function FredrikstadMap({ onAreaSelect }: FredrikstadMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [10.93, 59.22],  // Fredrikstad center
      zoom: 11.5,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

    map.on("load", () => {
      setMapLoaded(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Load GeoJSON data
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || dataLoaded) return;
    const map = mapRef.current;

    async function loadGeoJSON() {
      try {
        const geojson = await api.fredrikstad.geojson();

        map.addSource("fredrikstad-areas", {
          type: "geojson",
          data: geojson as unknown as GeoJSON.FeatureCollection,
        });

        // Heatmap layer (visible at lower zooms)
        map.addLayer({
          id: "areas-heat",
          type: "heatmap",
          source: "fredrikstad-areas",
          maxzoom: 13,
          paint: {
            "heatmap-weight": [
              "interpolate", ["linear"],
              ["get", "daily_max_people"],
              0, 0,
              8000, 1,
            ],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 9, 0.5, 13, 1.5],
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              0, "rgba(0,0,0,0)",
              0.1, "rgba(49, 54, 149, 0.3)",
              0.3, "rgba(69, 117, 180, 0.5)",
              0.5, "rgba(116, 173, 209, 0.6)",
              0.7, "rgba(253, 174, 97, 0.7)",
              0.9, "rgba(244, 109, 67, 0.8)",
              1, "rgba(215, 48, 39, 0.9)",
            ],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 9, 15, 13, 25],
            "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0.8, 14, 0],
          },
        });

        // Circle layer (visible at higher zooms)
        map.addLayer({
          id: "areas-circles",
          type: "circle",
          source: "fredrikstad-areas",
          minzoom: 11,
          paint: {
            "circle-radius": [
              "interpolate", ["linear"],
              ["get", "daily_max_people"],
              0, 4,
              500, 6,
              2000, 10,
              5000, 14,
              8000, 18,
            ],
            "circle-color": [
              "case",
              [">=", ["get", "daily_max_people"], 5000], "#ef4444",
              [">=", ["get", "daily_max_people"], 2000], "#f59e0b",
              [">=", ["get", "daily_max_people"], 500], "#22c55e",
              "#6b7280",
            ],
            "circle-opacity": 0.85,
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "rgba(255,255,255,0.4)",
          },
        });

        // Labels
        map.addLayer({
          id: "areas-labels",
          type: "symbol",
          source: "fredrikstad-areas",
          minzoom: 13,
          layout: {
            "text-field": ["get", "area_name"],
            "text-size": 11,
            "text-offset": [0, 1.8],
            "text-anchor": "top",
            "text-max-width": 10,
          },
          paint: {
            "text-color": "#e5e7eb",
            "text-halo-color": "rgba(0,0,0,0.8)",
            "text-halo-width": 1,
          },
        });

        // Click interaction
        map.on("click", "areas-circles", (e) => {
          if (e.features && e.features.length > 0) {
            const props = e.features[0].properties;
            if (props && onAreaSelect) {
              onAreaSelect({
                area_code: props.area_code,
                area_name: props.area_name,
                daily_max_people: props.daily_max_people,
                daily_mean_people: props.daily_mean_people,
                days_observed: props.days_observed,
              });
            }
          }
        });

        // Hover cursor
        map.on("mouseenter", "areas-circles", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "areas-circles", () => {
          map.getCanvas().style.cursor = "";
        });

        // Hover tooltip
        map.on("mousemove", "areas-circles", (e) => {
          if (e.features && e.features.length > 0) {
            const props = e.features[0].properties;
            const coords = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number];

            if (popupRef.current) popupRef.current.remove();
            popupRef.current = new maplibregl.Popup({
              closeButton: false,
              closeOnClick: false,
              offset: 12,
              className: "fred-popup",
            })
              .setLngLat(coords)
              .setHTML(`
                <div style="font-family: var(--font-family); padding: 2px 0;">
                  <div style="font-weight: 600; font-size: 13px; margin-bottom: 3px;">${props?.area_name ?? ""}</div>
                  <div style="font-size: 11px; color: #9ca3af;">
                    Peak: <strong style="color: ${tierColor(props?.daily_max_people ?? 0)}">${(props?.daily_max_people ?? 0).toLocaleString()}</strong>
                    · Avg: ${Math.round(props?.daily_mean_people ?? 0).toLocaleString()}
                  </div>
                </div>
              `)
              .addTo(map);
          }
        });

        map.on("mouseleave", "areas-circles", () => {
          if (popupRef.current) {
            popupRef.current.remove();
            popupRef.current = null;
          }
        });

        setDataLoaded(true);
      } catch (err) {
        console.error("Failed to load Fredrikstad GeoJSON:", err);
      }
    }

    loadGeoJSON();
  }, [mapLoaded, dataLoaded, onAreaSelect]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        minHeight: 400,
      }}
    />
  );
}


// ── Detail Panel (exported for use by FredrikstadView) ─────────────────────

export function AreaDetailPanel({ area }: { area: SelectedArea | null }) {
  const [profile, setProfile] = useState<FredrikstadHourlyProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!area) {
      setProfile(null);
      return;
    }
    setLoading(true);
    api.fredrikstad
      .hourlyProfile(area.area_code)
      .then((p) => {
        setProfile(p);
        setLoading(false);
      })
      .catch(() => {
        setProfile(null);
        setLoading(false);
      });
  }, [area?.area_code]);

  if (!area) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        height: "100%", color: "var(--color-text-tertiary)", gap: "var(--space-md)",
        padding: "var(--space-xl)",
      }}>
        <span style={{ fontSize: 40 }}>📍</span>
        <div style={{ fontSize: "var(--text-sm)", textAlign: "center", lineHeight: 1.6 }}>
          Click any area on the map to see crowd patterns, peak hours, and activity trends.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "var(--space-md)", display: "flex", flexDirection: "column", gap: "var(--space-md)", height: "100%", overflow: "auto" }}>
      {/* Area header */}
      <div>
        <div style={{
          fontSize: "var(--text-lg)", fontWeight: "var(--weight-bold)" as never,
          color: "var(--color-text-primary)", marginBottom: 4,
        }}>
          📍 {area.area_name}
        </div>
        <div style={{
          display: "inline-block",
          padding: "2px 10px", borderRadius: 12,
          fontSize: "var(--text-xs)", fontWeight: "var(--weight-semibold)" as never,
          color: "#fff",
          background: tierColor(area.daily_max_people),
        }}>
          {tierLabel(area.daily_max_people)}
        </div>
      </div>

      {/* Key metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-sm)" }}>
        <MetricCard label="Peak Daily" value={area.daily_max_people.toLocaleString()} color={tierColor(area.daily_max_people)} />
        <MetricCard label="Avg Daily" value={Math.round(area.daily_mean_people).toLocaleString()} color="var(--color-data-2)" />
        {profile && (
          <>
            <MetricCard label="Peak Hour" value={`${profile.peak_hour}:00`} color="var(--color-accent)" />
            <MetricCard label="Busiest Day" value={profile.peak_day} color="var(--color-data-3)" />
          </>
        )}
      </div>

      {/* Hourly chart */}
      {loading && (
        <div style={{ textAlign: "center", padding: "var(--space-lg)", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
          Loading hourly pattern…
        </div>
      )}
      {profile && !loading && (
        <div>
          <div style={{
            fontSize: "var(--text-xs)", color: "var(--color-text-muted)",
            textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "var(--space-sm)",
          }}>
            Hourly Crowd Pattern (avg)
          </div>
          <HourlyChart data={profile.hourly_profile} peakHour={profile.peak_hour} />
        </div>
      )}

      {/* Daily pattern */}
      {profile && profile.daily_profile.length > 0 && !loading && (
        <div>
          <div style={{
            fontSize: "var(--text-xs)", color: "var(--color-text-muted)",
            textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "var(--space-sm)",
          }}>
            Day of Week Pattern
          </div>
          <DailyChart data={profile.daily_profile} peakDay={profile.peak_day} />
        </div>
      )}

      <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: "auto" }}>
        {area.days_observed} days observed · Telia Crowd Insights · July 2023
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      padding: "var(--space-sm) var(--space-md)",
      background: "var(--color-bg-secondary)",
      borderRadius: "var(--radius-md)",
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: "var(--text-md)", fontWeight: "var(--weight-bold)" as never,
        color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
    </div>
  );
}

function HourlyChart({ data, peakHour }: { data: FredrikstadHourlyPoint[]; peakHour: number }) {
  const maxVal = Math.max(...data.map((d) => d.avg_people), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 100 }}>
      {data.map((d) => {
        const h = Math.max((d.avg_people / maxVal) * 90, 2);
        const isPeak = d.hour === peakHour;
        return (
          <div key={d.hour} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
            <div
              style={{
                width: "100%",
                height: h,
                borderRadius: "3px 3px 0 0",
                background: isPeak ? "#ef4444" : d.avg_people >= 100 ? "#6366f1" : "var(--color-bg-tertiary)",
                opacity: isPeak ? 1 : 0.7,
                transition: "height 0.4s ease",
              }}
              title={`${d.hour}:00 — avg: ${Math.round(d.avg_people)}, max: ${d.max_people}`}
            />
            {(d.hour % 4 === 0 || isPeak) && (
              <span style={{
                fontSize: 9, color: isPeak ? "#ef4444" : "var(--color-text-tertiary)",
                fontWeight: isPeak ? 700 : 400, marginTop: 2,
              }}>
                {d.hour}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DailyChart({ data, peakDay }: { data: { dow: number; day: string; avg_people: number }[]; peakDay: string }) {
  const maxVal = Math.max(...data.map((d) => d.avg_people), 1);
  return (
    <div style={{ display: "flex", gap: "var(--space-xs)" }}>
      {data.map((d) => {
        const pct = (d.avg_people / maxVal) * 100;
        const isPeak = d.day === peakDay;
        return (
          <div key={d.dow} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{
              width: "100%", height: 28, borderRadius: "var(--radius-sm)",
              background: "var(--color-bg-tertiary)", overflow: "hidden",
              display: "flex", alignItems: "flex-end",
            }}>
              <div style={{
                width: "100%",
                height: `${pct}%`,
                background: isPeak ? "#f59e0b" : "#6366f1",
                opacity: isPeak ? 1 : 0.6,
                borderRadius: "var(--radius-sm)",
                transition: "height 0.4s ease",
              }} />
            </div>
            <span style={{
              fontSize: 10,
              color: isPeak ? "#f59e0b" : "var(--color-text-tertiary)",
              fontWeight: isPeak ? 700 : 400,
            }}>
              {d.day}
            </span>
          </div>
        );
      })}
    </div>
  );
}
