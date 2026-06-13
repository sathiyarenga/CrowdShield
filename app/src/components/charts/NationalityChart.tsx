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
} from "recharts";
import { api } from "@/lib/api/client";
import styles from "./NationalityChart.module.css";

const COUNTRY_COLORS: Record<string, string> = {
  NO: "#3b82f6",
  REST: "#8b5cf6",
  DE: "#06b6d4",
  NL: "#f59e0b",
  UA: "#10b981",
  PL: "#ec4899",
  DK: "#6366f1",
  IT: "#14b8a6",
  GB: "#f97316",
  FR: "#a855f7",
};

const COUNTRY_NAMES: Record<string, string> = {
  NO: "Norway",
  REST: "Other",
  DE: "Germany",
  NL: "Netherlands",
  UA: "Ukraine",
  PL: "Poland",
  DK: "Denmark",
  IT: "Italy",
  GB: "United Kingdom",
  FR: "France",
};

interface TimeSlot {
  time: string;
  total: number;
  [country: string]: number | string;
}

interface PeakComposition {
  country: string;
  people: number;
  pct: number;
}

interface Props {
  date?: string;
}

export default function NationalityChart({ date = "2025-09-09" }: Props) {
  const [data, setData] = useState<TimeSlot[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(date);
  const [peakComposition, setPeakComposition] = useState<PeakComposition[]>([]);
  const [peakTotal, setPeakTotal] = useState(0);
  const [internationalPct, setInternationalPct] = useState(0);

  const availableDates = [
    "2025-09-03",
    "2025-09-04",
    "2025-09-09",
    "2025-10-11",
    "2025-10-12",
  ];

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const res = await api.ullevaal.breakdown(selectedDate);

        // Get top countries by total
        const topCountries = res.countries
          .slice(0, 8)
          .map((c) => c.country);
        setCountries(topCountries);

        // Pivot timeseries data: group by timestamp, spread countries
        const timeMap = new Map<string, TimeSlot>();

        for (const row of res.timeseries) {
          const ts = new Date(row.timestamp);
          const h = ts.getUTCHours();
          const m = ts.getUTCMinutes();
          const timeKey = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

          if (!timeMap.has(timeKey)) {
            timeMap.set(timeKey, { time: timeKey, total: 0 });
          }
          const slot = timeMap.get(timeKey)!;
          if (topCountries.includes(row.country)) {
            slot[row.country] = (slot[row.country] as number || 0) + row.people;
          }
          slot.total = (slot.total as number || 0) + row.people;
        }

        const sorted = Array.from(timeMap.values()).sort((a, b) => {
          const [ah, am] = a.time.split(":").map(Number);
          const [bh, bm] = b.time.split(":").map(Number);
          return ah * 60 + am - (bh * 60 + bm);
        });

        // Find peak time slot and compute composition
        let peakSlot = sorted[0];
        for (const slot of sorted) {
          if ((slot.total as number) > (peakSlot.total as number)) {
            peakSlot = slot;
          }
        }

        const peakTotalVal = peakSlot.total as number;
        setPeakTotal(peakTotalVal);

        const composition: PeakComposition[] = topCountries
          .map((c) => ({
            country: c,
            people: (peakSlot[c] as number) || 0,
            pct: peakTotalVal > 0 ? ((peakSlot[c] as number || 0) / peakTotalVal * 100) : 0,
          }))
          .filter((c) => c.people > 0)
          .sort((a, b) => b.people - a.people);

        setPeakComposition(composition);

        // Calculate international percentage at peak
        const noAtPeak = (peakSlot["NO"] as number) || 0;
        setInternationalPct(
          peakTotalVal > 0
            ? ((peakTotalVal - noAtPeak) / peakTotalVal * 100)
            : 0
        );

        setData(sorted);
        setLoading(false);
      } catch {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedDate]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <span>Loading nationality data…</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <select
          className={styles.dateSelect}
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        >
          {availableDates.map((d) => (
            <option key={d} value={d}>
              {new Date(d).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </option>
          ))}
        </select>

        {/* Peak composition — actual per-snapshot numbers */}
        <div className={styles.peakInfo}>
          <span className={styles.peakLabel}>Peak composition</span>
          <span className={styles.peakValue}>
            {peakTotal.toLocaleString()} people
          </span>
          <span className={styles.intlBadge}>
            {internationalPct.toFixed(1)}% international
          </span>
        </div>
      </div>

      {/* Country composition at peak */}
      <div className={styles.compositionBar}>
        {peakComposition.map((c) => (
          <div
            key={c.country}
            className={styles.compositionSegment}
            style={{
              width: `${Math.max(c.pct, 0.5)}%`,
              background: COUNTRY_COLORS[c.country] || "#64748b",
            }}
            title={`${COUNTRY_NAMES[c.country] || c.country}: ${c.people.toLocaleString()} (${c.pct.toFixed(1)}%)`}
          />
        ))}
      </div>
      <div className={styles.compositionLegend}>
        {peakComposition.slice(0, 6).map((c) => (
          <div key={c.country} className={styles.legendItem}>
            <span
              className={styles.legendDot}
              style={{ background: COUNTRY_COLORS[c.country] || "#64748b" }}
            />
            <span className={styles.legendCountry}>
              {COUNTRY_NAMES[c.country] || c.country}
            </span>
            <span className={styles.legendPct}>
              {c.pct.toFixed(1)}%
            </span>
            <span className={styles.legendCount}>
              ({c.people.toLocaleString()})
            </span>
          </div>
        ))}
      </div>

      {/* Stacked area chart */}
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            {countries.map((c) => (
              <linearGradient key={c} id={`nat-grad-${c}`} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={COUNTRY_COLORS[c] || "#64748b"}
                  stopOpacity={0.6}
                />
                <stop
                  offset="95%"
                  stopColor={COUNTRY_COLORS[c] || "#64748b"}
                  stopOpacity={0.05}
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
            formatter={(value: any, name: any) => {
              return [
                `${Number(value ?? 0).toLocaleString()} people`,
                COUNTRY_NAMES[String(name)] || String(name),
              ];
            }}
            labelFormatter={(label: any) => `Time: ${label} UTC`}
          />
          {countries.map((c) => (
            <Area
              key={c}
              type="monotone"
              dataKey={c}
              stackId="1"
              stroke={COUNTRY_COLORS[c] || "#64748b"}
              fill={`url(#nat-grad-${c})`}
              strokeWidth={c === "NO" ? 1.5 : 1}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <p className={styles.chartCaption}>
        Each point shows the <strong>simultaneous count</strong> of people detected by nationality
        at that 5-minute interval. Norway dominates (&gt;95% at peak) but international mix
        shifts at ingress/egress — valuable for wayfinding, emergency comms, and transport planning.
      </p>
    </div>
  );
}
