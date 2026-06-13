"use client";

import { useMemo } from "react";
import styles from "./CompositeRiskGauge.module.css";

interface Props {
  score: number;
  level: string;
}

function getLevelColor(level: string): string {
  switch (level.toLowerCase()) {
    case "critical":
      return "#ef4444";
    case "high":
      return "#f97316";
    case "elevated":
      return "#eab308";
    default:
      return "#22c55e";
  }
}

export default function CompositeRiskGauge({ score, level }: Props) {
  const color = getLevelColor(level);

  // Semicircular arc — generous viewBox for clarity
  const cx = 160;
  const cy = 140;
  const radius = 110;
  const strokeWidth = 18;
  const startAngle = Math.PI; // left (180°)
  const totalAngle = Math.PI; // sweep to 0° (right)
  const scoreAngle = startAngle - (score / 100) * totalAngle;

  const bgArc = useMemo(() => {
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy - radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(0);
    const y2 = cy - radius * Math.sin(0);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;
  }, []);

  const scoreArc = useMemo(() => {
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy - radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(scoreAngle);
    const y2 = cy - radius * Math.sin(scoreAngle);
    // Always 0: our arc is at most 180° (the full semicircle), never the long way around
    return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;
  }, [score, scoreAngle]);

  // Needle tip position (on the arc)
  const needleX = cx + radius * Math.cos(scoreAngle);
  const needleY = cy - radius * Math.sin(scoreAngle);

  // Tick marks at 0, 25, 50, 75, 100
  const ticks = [0, 25, 50, 75, 100].map((val) => {
    const angle = startAngle - (val / 100) * totalAngle;
    const outerR = radius + strokeWidth / 2 + 4;
    const labelR = radius + strokeWidth / 2 + 18;
    return {
      val,
      x1: cx + outerR * Math.cos(angle),
      y1: cy - outerR * Math.sin(angle),
      lx: cx + labelR * Math.cos(angle),
      ly: cy - labelR * Math.sin(angle),
    };
  });

  return (
    <div className={styles.container}>
      <svg viewBox="0 0 320 190" className={styles.svg}>
        <defs>
          <linearGradient id="gaugeGrad" gradientUnits="userSpaceOnUse" x1="50" y1="140" x2="270" y2="140">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="25%" stopColor="#eab308" />
            <stop offset="60%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
          <filter id="gaugeGlow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="dotGlow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background arc */}
        <path
          d={bgArc}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Score arc with gradient */}
        <path
          d={scoreArc}
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Tick marks */}
        {ticks.map((t) => (
          <text
            key={t.val}
            x={t.lx}
            y={t.ly}
            textAnchor="middle"
            dominantBaseline="central"
            fill="rgba(148,163,184,0.6)"
            fontSize="10"
            fontFamily="var(--font-sans)"
          >
            {t.val}
          </text>
        ))}

        {/* Needle line from center to arc */}
        <line
          x1={cx}
          y1={cy}
          x2={needleX}
          y2={needleY}
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          opacity={0.9}
        />

        {/* Center hub */}
        <circle cx={cx} cy={cy} r={6} fill={color} opacity={0.8} />
        <circle cx={cx} cy={cy} r={3} fill="#0a0e1a" />

        {/* Needle tip dot */}
        <circle
          cx={needleX}
          cy={needleY}
          r={7}
          fill={color}
          filter="url(#dotGlow)"
        />

        {/* Center score text */}
        <text
          x={cx}
          y={cy - 30}
          textAnchor="middle"
          fill={color}
          fontSize="42"
          fontWeight="800"
          fontFamily="var(--font-sans)"
        >
          {Math.round(score)}
        </text>
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          fill="rgba(148,163,184,0.7)"
          fontSize="10"
          letterSpacing="0.15em"
          fontFamily="var(--font-sans)"
        >
          COMPOSITE SCORE
        </text>

        {/* Scale labels */}
        <text
          x={cx - radius - strokeWidth / 2 - 4}
          y={cy + 16}
          textAnchor="middle"
          fill="#22c55e"
          fontSize="9"
          fontWeight="700"
          letterSpacing="0.1em"
          fontFamily="var(--font-sans)"
        >
          LOW
        </text>
        <text
          x={cx + radius + strokeWidth / 2 + 4}
          y={cy + 16}
          textAnchor="middle"
          fill="#ef4444"
          fontSize="9"
          fontWeight="700"
          letterSpacing="0.1em"
          fontFamily="var(--font-sans)"
        >
          HIGH
        </text>
      </svg>

      <div
        className={styles.levelBadge}
        style={{
          color,
          borderColor: color,
          boxShadow: `0 0 20px ${color}33`,
        }}
      >
        {level.toUpperCase()}
      </div>
    </div>
  );
}
