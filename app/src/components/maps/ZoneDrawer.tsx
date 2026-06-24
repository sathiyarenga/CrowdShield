"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api/client";
import type { CustomZone } from "./VenueMap";
import styles from "./ZoneDrawer.module.css";

/* -- Zone type metadata ------------------------------------------------ */
const ZONE_TYPES = [
  // Polygon zones
  { value: "gate", label: "Gate / Entrance", icon: "🚪", color: "#3b82f6", geometryType: "Polygon" as const },
  { value: "stage", label: "Stage / Performance", icon: "🎤", color: "#a855f7", geometryType: "Polygon" as const },
  { value: "crowd_corridor", label: "Crowd Corridor", icon: "🚶", color: "#f97316", geometryType: "Polygon" as const },
  { value: "vip", label: "VIP Area", icon: "⭐", color: "#eab308", geometryType: "Polygon" as const },
  { value: "parking", label: "Parking", icon: "🅿️", color: "#6b7280", geometryType: "Polygon" as const },
  { value: "buffer", label: "Buffer Zone", icon: "🔲", color: "#64748b", geometryType: "Polygon" as const },
  { value: "custom", label: "Custom", icon: "📍", color: "#06b6d4", geometryType: "Polygon" as const },
  // Point markers — Emergency & Event Infrastructure
  { value: "medical", label: "Medical / First Aid", icon: "🏥", color: "#22c55e", geometryType: "Point" as const },
  { value: "security", label: "Police / Security", icon: "👮", color: "#ef4444", geometryType: "Point" as const },
  { value: "info", label: "Info Point", icon: "ℹ️", color: "#0ea5e9", geometryType: "Point" as const },
  { value: "ambulance", label: "Ambulance Staging", icon: "🚑", color: "#16a34a", geometryType: "Point" as const },
  { value: "fire", label: "Fire Access / Tender", icon: "🚒", color: "#dc2626", geometryType: "Point" as const },
  { value: "welfare", label: "Welfare / Lost Child", icon: "🤝", color: "#8b5cf6", geometryType: "Point" as const },
  { value: "steward", label: "Steward Position", icon: "🦺", color: "#f59e0b", geometryType: "Point" as const },
  { value: "command", label: "Command Post", icon: "📡", color: "#1e40af", geometryType: "Point" as const },
  { value: "barrier", label: "Road Barrier", icon: "🚧", color: "#d97706", geometryType: "Point" as const },
  { value: "toilet", label: "Portable Toilet", icon: "🚻", color: "#475569", geometryType: "Point" as const },
];

interface ZoneDrawerProps {
  venueId: string;
  drawMode: boolean;
  drawType?: "Polygon" | "Point";
  onToggleDrawMode: (type?: "Polygon" | "Point") => void;
  customZones: CustomZone[];
  onZonesUpdated: (zones: CustomZone[]) => void;
  drawnGeometry: GeoJSON.Polygon | GeoJSON.Point | null;
  onGeometryConsumed: () => void;
}

export default function ZoneDrawer({
  venueId,
  drawMode,
  drawType,
  onToggleDrawMode,
  customZones,
  onZonesUpdated,
  drawnGeometry,
  onGeometryConsumed,
}: ZoneDrawerProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [editingZone, setEditingZone] = useState<CustomZone | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    zone_type: "custom",
    capacity: 1000,
    color: "#06b6d4",
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // When a polygon is drawn, show the properties panel
  useEffect(() => {
    if (drawnGeometry) {
      setEditingZone(null);
      setFormData({
        name: "",
        zone_type: "custom",
        capacity: 1000,
        color: "#06b6d4",
      });
      setShowPanel(true);
    }
  }, [drawnGeometry]);

  // Update color when zone type changes
  useEffect(() => {
    const typeInfo = ZONE_TYPES.find(t => t.value === formData.zone_type);
    if (typeInfo && !editingZone) {
      setFormData(prev => ({ ...prev, color: typeInfo.color }));
    }
  }, [formData.zone_type, editingZone]);

  // Load custom zones on mount
  useEffect(() => {
    async function loadZones() {
      try {
        const data = await api.venues.customZones(venueId);
        if (data?.features) {
          const zones: CustomZone[] = data.features.map((f: any) => ({
            zone_id: f.properties.zone_id,
            name: f.properties.name,
            zone_type: f.properties.zone_type,
            capacity: f.properties.capacity,
            color: f.properties.color,
            geometry: f.geometry,
            created_at: f.properties.created_at,
            updated_at: f.properties.updated_at,
          }));
          onZonesUpdated(zones);
        }
      } catch {
        // No custom zones yet
      }
    }
    loadZones();
  }, [venueId]);

  const handleSave = useCallback(async () => {
    if (!formData.name.trim()) return;
    setSaving(true);

    try {
      if (editingZone) {
        // Update existing
        await api.venues.updateCustomZone(venueId, editingZone.zone_id, {
          name: formData.name,
          zone_type: formData.zone_type as any,
          capacity: formData.capacity,
          color: formData.color,
        });
        onZonesUpdated(
          customZones.map(z =>
            z.zone_id === editingZone.zone_id
              ? { ...z, ...formData }
              : z
          )
        );
      } else if (drawnGeometry) {
        // Create new
        const result = await api.venues.saveCustomZone(venueId, {
          name: formData.name,
          zone_type: formData.zone_type as any,
          capacity: formData.capacity,
          color: formData.color,
          geometry: drawnGeometry,
        });
        const newZone: CustomZone = {
          zone_id: result.properties.zone_id || "temp-id",
          name: formData.name,
          zone_type: formData.zone_type as any,
          capacity: formData.capacity,
          color: formData.color,
          geometry: drawnGeometry,
        };
        onZonesUpdated([...customZones, newZone]);
        onGeometryConsumed();
      }

      setShowPanel(false);
      setEditingZone(null);
      if (drawMode) onToggleDrawMode();
    } catch (err) {
      console.error("Failed to save zone:", err);
    } finally {
      setSaving(false);
    }
  }, [formData, editingZone, drawnGeometry, venueId, customZones, onZonesUpdated, onGeometryConsumed, drawMode, onToggleDrawMode]);

  const handleDelete = useCallback(async (zoneId: string) => {
    setDeletingId(zoneId);
    try {
      await api.venues.deleteCustomZone(venueId, zoneId);
      onZonesUpdated(customZones.filter(z => z.zone_id !== zoneId));
    } catch (err) {
      console.error("Failed to delete zone:", err);
    } finally {
      setDeletingId(null);
    }
  }, [venueId, customZones, onZonesUpdated]);

  const handleEdit = useCallback((zone: CustomZone) => {
    setEditingZone(zone);
    setFormData({
      name: zone.name,
      zone_type: zone.zone_type,
      capacity: zone.capacity,
      color: zone.color,
    });
    setShowPanel(true);
  }, []);

  const handleCancel = useCallback(() => {
    setShowPanel(false);
    setEditingZone(null);
    onGeometryConsumed();
    if (drawMode) onToggleDrawMode();
  }, [drawMode, onToggleDrawMode, onGeometryConsumed]);

  return (
    <>
      {/* Draw toolbar */}
      <div className={styles.toolbar}>
        <button
          className={`${styles.toolBtn} ${drawMode && drawType === "Polygon" ? styles.active : ""}`}
          onClick={() => onToggleDrawMode("Polygon")}
          title="Draw a zone polygon"
        >
          <span className={styles.toolIcon}>✏️</span>
          Zone
        </button>
        <button
          className={`${styles.toolBtn} ${drawMode && drawType === "Point" ? styles.active : ""}`}
          onClick={() => onToggleDrawMode("Point")}
          title="Place temporary infrastructure (medical, police, ambulance, etc.)"
        >
          <span className={styles.toolIcon}>🚑</span>
          Place
        </button>
        {drawMode && (
          <button className={styles.toolBtn} onClick={() => onToggleDrawMode()} style={{ color: "var(--color-critical)" }}>
            Cancel
          </button>
        )}
        {customZones.length > 0 && (
          <div className={styles.zoneCount}>
            {customZones.length} zone{customZones.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Draw Instruction Banner */}
      {drawMode && (
        <div className={styles.drawInstructionBanner}>
          <span className={styles.toolIcon}>ℹ️</span>
          {drawType === "Polygon" ? (
            <span><strong>Click</strong> to outline area • <strong>Double-click</strong> to finish</span>
          ) : (
            <span><strong>Click</strong> on map to place infrastructure marker (ambulance, police, medical, etc.)</span>
          )}
        </div>
      )}

      {/* Zone list */}
      {customZones.length > 0 && (
        <div className={styles.zoneList}>
          <div className={styles.zoneListTitle}>Custom Zones</div>
          {customZones.map(z => {
            const typeInfo = ZONE_TYPES.find(t => t.value === z.zone_type);
            return (
              <div key={z.zone_id} className={styles.zoneItem}>
                <div className={styles.zoneItemInfo}>
                  <span className={styles.zoneItemIcon}>{typeInfo?.icon || "📍"}</span>
                  <div className={styles.zoneItemText}>
                    <span className={styles.zoneItemName}>{z.name}</span>
                    <span className={styles.zoneItemMeta}>
                      {z.zone_type.replace(/_/g, " ")} · {z.capacity.toLocaleString()} cap
                    </span>
                  </div>
                </div>
                <div className={styles.zoneItemActions}>
                  <button
                    className={styles.zoneActionBtn}
                    onClick={() => handleEdit(z)}
                    title="Edit zone"
                  >
                    ✎
                  </button>
                  <button
                    className={`${styles.zoneActionBtn} ${styles.deleteBtn}`}
                    onClick={() => handleDelete(z.zone_id)}
                    disabled={deletingId === z.zone_id}
                    title="Delete zone"
                  >
                    {deletingId === z.zone_id ? "…" : "✕"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Properties panel */}
      {showPanel && (
        <div className={styles.propertiesPanel}>
          <div className={styles.panelHeader}>
            <h3>{editingZone ? "Edit Zone" : "New Zone"}</h3>
            <button className={styles.panelClose} onClick={handleCancel}>✕</button>
          </div>

          <div className={styles.panelBody}>
            {/* Name */}
            <label className={styles.fieldLabel}>
              Name
              <input
                type="text"
                className={styles.fieldInput}
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Gate A Entrance"
                autoFocus
              />
            </label>

            {/* Type */}
            <label className={styles.fieldLabel}>
              Zone Type
              <div className={styles.typeGrid}>
                {ZONE_TYPES.filter(t => {
                  const geomType = drawnGeometry ? drawnGeometry.type : (editingZone ? editingZone.geometry.type : null);
                  return !geomType || t.geometryType === geomType;
                }).map(t => (
                  <button
                    key={t.value}
                    className={`${styles.typeOption} ${formData.zone_type === t.value ? styles.selected : ""}`}
                    onClick={() => setFormData(prev => ({ ...prev, zone_type: t.value }))}
                    style={{ "--type-color": t.color } as React.CSSProperties}
                  >
                    <span>{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </label>

            {/* Capacity */}
            <label className={styles.fieldLabel}>
              Max Capacity
              <input
                type="number"
                className={styles.fieldInput}
                value={formData.capacity}
                onChange={e => setFormData(prev => ({ ...prev, capacity: Math.max(0, parseInt(e.target.value) || 0) }))}
                min={0}
                step={100}
              />
            </label>

            {/* Color */}
            <label className={styles.fieldLabel}>
              Color
              <div className={styles.colorRow}>
                <input
                  type="color"
                  className={styles.colorPicker}
                  value={formData.color}
                  onChange={e => setFormData(prev => ({ ...prev, color: e.target.value }))}
                />
                <span className={styles.colorHex}>{formData.color}</span>
              </div>
            </label>
          </div>

          <div className={styles.panelFooter}>
            <button className={styles.cancelBtn} onClick={handleCancel}>
              Cancel
            </button>
            <button
              className={styles.saveBtn}
              onClick={handleSave}
              disabled={!formData.name.trim() || saving}
            >
              {saving ? "Saving…" : editingZone ? "Update Zone" : "Save Zone"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
