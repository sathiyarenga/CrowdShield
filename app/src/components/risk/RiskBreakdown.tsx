"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { HazardRiskItem } from "@/lib/api/client";
import styles from "./RiskBreakdown.module.css";

interface Props {
  data: HazardRiskItem[];
}

function getScoreColor(score: number): string {
  if (score >= 75) return "#ef4444";
  if (score >= 50) return "#f97316";
  if (score >= 25) return "#eab308";
  return "#22c55e";
}

export default function RiskBreakdown({ data }: Props) {
  const sorted = [...data].sort((a, b) => b.risk_score - a.risk_score);

  return (
    <div className={styles.container}>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.04)"
            horizontal={false}
          />
          <XAxis
            type="number"
            domain={[0, 100]}
            stroke="#64748b"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="category"
            stroke="#64748b"
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            width={120}
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
            formatter={(value: any) => [
              `${Number(value ?? 0).toFixed(1)}`,
              "Risk Score",
            ]}
          />
          <Bar dataKey="risk_score" radius={[0, 4, 4, 0]} barSize={16}>
            {sorted.map((entry, i) => (
              <Cell
                key={entry.category}
                fill={getScoreColor(entry.risk_score)}
                fillOpacity={0.8}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
