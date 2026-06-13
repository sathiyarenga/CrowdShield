"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
  Cell,
} from "recharts";
import type { EventFingerprint, EventDetection } from "@/lib/api/client";
import styles from "./IngresEgressChart.module.css";

interface Props {
  fingerprints: EventFingerprint[];
  detections: EventDetection[];
}

const DATE_COLORS: Record<string, string> = {
  "2025-09-03": "#64748b",
  "2025-09-04": "#3b82f6",
  "2025-09-09": "#ef4444",
  "2025-10-11": "#8b5cf6",
  "2025-10-12": "#94a3b8",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface BubbleData {
  x: number;
  y: number;
  z: number;
  date: string;
  label: string;
  isEvent: boolean;
}

export default function IngresEgressChart({ fingerprints, detections }: Props) {
  const data: BubbleData[] = fingerprints.map((fp) => {
    const det = detections.find((d) => d.date === fp.event_date);
    return {
      x: fp.ingress_duration_minutes,
      y: fp.egress_duration_minutes,
      z: fp.peak_count,
      date: fp.event_date,
      label: formatDate(fp.event_date),
      isEvent: fp.is_event_day,
    };
  });

  const maxPeak = Math.max(...data.map((d) => d.z), 1);

  return (
    <div className={styles.container}>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 10, left: 10 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.04)"
          />
          <XAxis
            type="number"
            dataKey="x"
            name="Ingress Duration"
            unit="min"
            stroke="#64748b"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            label={{
              value: "Ingress Duration (min)",
              position: "insideBottom",
              offset: -5,
              fill: "#64748b",
              fontSize: 11,
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Egress Duration"
            unit="min"
            stroke="#64748b"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            label={{
              value: "Egress Duration (min)",
              angle: -90,
              position: "insideLeft",
              offset: 10,
              fill: "#64748b",
              fontSize: 11,
            }}
          />
          <ZAxis
            type="number"
            dataKey="z"
            range={[200, 1200]}
            name="Peak Count"
          />
          <Tooltip
            contentStyle={{
              background: "#1a2236",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#f0f4f8",
            }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any, name: any) => {
              const v = Number(value ?? 0);
              const n = String(name ?? "");
              if (n === "Peak Count") return [v.toLocaleString(), n];
              return [`${Math.round(v)} min`, n];
            }}
            labelFormatter={() => ""}
            cursor={{ strokeDasharray: "3 3" }}
          />
          <Scatter name="Events" data={data}>
            {data.map((entry, i) => (
              <Cell
                key={entry.date}
                fill={DATE_COLORS[entry.date] || "#3b82f6"}
                fillOpacity={0.7}
                stroke={DATE_COLORS[entry.date] || "#3b82f6"}
                strokeWidth={1.5}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div className={styles.legend}>
        {data.map((d) => (
          <div key={d.date} className={styles.legendItem}>
            <span
              className={styles.legendDot}
              style={{ background: DATE_COLORS[d.date] || "#3b82f6" }}
            />
            <span>{d.label}</span>
            <span className={styles.legendPeak}>
              {d.z.toLocaleString()} peak
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
