"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import type { RiskTimelinePoint } from "@/lib/api/client";
import styles from "./RiskTimeline.module.css";

interface Props {
  data: RiskTimelinePoint[];
}

export default function RiskTimeline({ data }: Props) {
  return (
    <div className={styles.container}>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
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
            interval={Math.max(Math.floor(data.length / 8), 1)}
          />
          <YAxis
            domain={[0, 100]}
            stroke="#64748b"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
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
              Number(value ?? 0).toFixed(1),
              String(name ?? "")
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c: string) => c.toUpperCase()),
            ]}
          />
          <Legend
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any) => (
              <span style={{ color: "#94a3b8", fontSize: "11px" }}>
                {String(value ?? "")
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (c: string) => c.toUpperCase())}
              </span>
            )}
          />
          <ReferenceLine
            y={75}
            stroke="var(--color-critical)"
            strokeDasharray="6 4"
            strokeOpacity={0.4}
            label={{
              value: "Critical Threshold",
              fill: "#ef4444",
              fontSize: 10,
              position: "right",
            }}
          />
          <ReferenceLine
            y={50}
            stroke="var(--color-high)"
            strokeDasharray="6 4"
            strokeOpacity={0.3}
          />
          <Line
            type="monotone"
            dataKey="composite_score"
            stroke="#ef4444"
            strokeWidth={2.5}
            dot={false}
            name="composite_score"
          />
          <Line
            type="monotone"
            dataKey="document_risk"
            stroke="#8b5cf6"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="4 2"
            name="document_risk"
          />
          <Line
            type="monotone"
            dataKey="historical_anomaly"
            stroke="#3b82f6"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="4 2"
            name="historical_anomaly"
          />
          <Line
            type="monotone"
            dataKey="density_prediction"
            stroke="#10b981"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="4 2"
            name="density_prediction"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
