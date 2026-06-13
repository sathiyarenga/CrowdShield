"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import { api, type UllevaalSummaryRecord } from "@/lib/api/client";
import styles from "./EventCurveChart.module.css";

// Colors per date for multi-overlay
const DATE_COLORS: Record<string, string> = {
  "2025-09-03": "#64748b", // Non-event: muted gray
  "2025-09-04": "#3b82f6", // Blue
  "2025-09-09": "#ef4444", // Red (highest peak)
  "2025-10-11": "#8b5cf6", // Purple
  "2025-10-12": "#94a3b8", // Non-event: light gray
};

const DATE_LABELS: Record<string, string> = {
  "2025-09-03": "Sep 3 (No Event)",
  "2025-09-04": "Sep 4 (Match)",
  "2025-09-09": "Sep 9 (Match — Peak)",
  "2025-10-11": "Oct 11 (Match)",
  "2025-10-12": "Oct 12 (No Event)",
};

interface TimeSlot {
  time: string;
  hour: number;
  [key: string]: number | string;
}

export default function EventCurveChart() {
  const [data, setData] = useState<TimeSlot[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await api.ullevaal.summary();
        const availableDates = res.dates_available;
        setDates(availableDates);

        // Group data by time-of-day and pivot dates into columns
        const timeMap = new Map<string, TimeSlot>();

        for (const row of res.data) {
          const ts = new Date(row.timestamp);
          const h = ts.getUTCHours();
          const m = ts.getUTCMinutes();
          const timeKey = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          const dateKey = row.timestamp.slice(0, 10);

          if (!timeMap.has(timeKey)) {
            timeMap.set(timeKey, { time: timeKey, hour: h });
          }
          const slot = timeMap.get(timeKey)!;
          // If multiple areas, sum them; otherwise just use the value
          const existing = (slot[dateKey] as number) || 0;
          slot[dateKey] = Math.max(existing, row.people);
        }

        // Sort by time
        const sorted = Array.from(timeMap.values()).sort((a, b) => {
          const [ah, am] = a.time.split(":").map(Number);
          const [bh, bm] = b.time.split(":").map(Number);
          return ah * 60 + am - (bh * 60 + bm);
        });

        setData(sorted);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <span>Loading Ullevaal crowd data…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        <p>⚠ {error}</p>
        <p className={styles.errorHint}>
          Ensure the backend is running: <code>uvicorn src.api.main:app --port 8000</code>
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <ResponsiveContainer width="100%" height={340}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            {dates.map((d) => (
              <linearGradient key={d} id={`grad-${d}`} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={DATE_COLORS[d] || "#3b82f6"}
                  stopOpacity={0.25}
                />
                <stop
                  offset="95%"
                  stopColor={DATE_COLORS[d] || "#3b82f6"}
                  stopOpacity={0.02}
                />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.04)"
            vertical={false}
          />
          <XAxis
            dataKey="time"
            stroke="#64748b"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            interval={Math.floor(data.length / 8)}
          />
          <YAxis
            stroke="#64748b"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
            }
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
            formatter={(value: any, name: any) => [
              Number(value ?? 0).toLocaleString() + " people",
              DATE_LABELS[String(name)] || String(name),
            ]}
            labelFormatter={(label: any) => `Time: ${label} UTC`}
          />
          <Legend
            formatter={(value: any) => (
              <span style={{ color: "#94a3b8", fontSize: "11px" }}>
                {DATE_LABELS[String(value)] || String(value)}
              </span>
            )}
          />
          <ReferenceLine
            y={3500}
            stroke="#22c55e"
            strokeDasharray="6 4"
            strokeOpacity={0.5}
            label={{
              value: "Baseline ~3,500",
              fill: "#22c55e",
              fontSize: 10,
              position: "right",
            }}
          />
          {dates.map((d) => (
            <Area
              key={d}
              type="monotone"
              dataKey={d}
              stroke={DATE_COLORS[d] || "#3b82f6"}
              strokeWidth={d === "2025-09-09" ? 2.5 : 1.5}
              fill={`url(#grad-${d})`}
              fillOpacity={d === "2025-09-09" ? 1 : 0.3}
              dot={false}
              connectNulls
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
