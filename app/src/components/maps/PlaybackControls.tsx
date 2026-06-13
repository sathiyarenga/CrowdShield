"use client";

import { useEffect, useRef, useCallback } from "react";
import styles from "./PlaybackControls.module.css";

/* -- Types -------------------------------------------------------------- */
export interface TimeSeriesPoint {
  timestamp: string;
  people: number;
}

interface PlaybackControlsProps {
  /* Data */
  dates: string[];
  selectedDate: string;
  onDateChange: (date: string) => void;

  /* Playback state */
  timeSeriesData: TimeSeriesPoint[];
  currentIndex: number;
  onIndexChange: (index: number) => void;

  /* Playback controls */
  isPlaying: boolean;
  onTogglePlay: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;

  /* Current metrics */
  currentPeople: number;
  riskLevel: string;
  riskColor: string;
}

const SPEEDS = [1, 5, 10];

export default function PlaybackControls({
  dates,
  selectedDate,
  onDateChange,
  timeSeriesData,
  currentIndex,
  onIndexChange,
  isPlaying,
  onTogglePlay,
  speed,
  onSpeedChange,
  currentPeople,
  riskLevel,
  riskColor,
}: PlaybackControlsProps) {
  const totalFrames = timeSeriesData.length;
  const currentPoint = timeSeriesData[currentIndex];

  /* -- Format timestamp for display --------------------------------- */
  const formatTime = useCallback((ts?: string) => {
    if (!ts) return "--:--";
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return ts.slice(11, 16);
    }
  }, []);

  /* -- Keyboard shortcuts ------------------------------------------- */
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          onTogglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          onIndexChange(Math.min(currentIndex + 1, totalFrames - 1));
          break;
        case "ArrowLeft":
          e.preventDefault();
          onIndexChange(Math.max(currentIndex - 1, 0));
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentIndex, totalFrames, onTogglePlay, onIndexChange]);

  const progressPercent = totalFrames > 1 ? (currentIndex / (totalFrames - 1)) * 100 : 0;

  return (
    <div className={styles.controlsBar}>
      {/* Date selector */}
      <select
        className={styles.dateSelect}
        value={selectedDate}
        onChange={(e) => onDateChange(e.target.value)}
      >
        {dates.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      <div className={styles.divider} />

      {/* Play/Pause */}
      <button
        className={styles.playBtn}
        onClick={onTogglePlay}
        title={isPlaying ? "Pause (Space)" : "Play (Space)"}
      >
        {isPlaying ? "⏸" : "▶"}
      </button>

      {/* Timeline slider */}
      <div className={styles.sliderWrap}>
        <div
          className={styles.sliderProgress}
          style={{ width: `${progressPercent}%` }}
        />
        <input
          type="range"
          className={styles.slider}
          min={0}
          max={Math.max(totalFrames - 1, 0)}
          value={currentIndex}
          onChange={(e) => onIndexChange(Number(e.target.value))}
        />
      </div>

      {/* Time display */}
      <div className={styles.timeDisplay}>
        {formatTime(currentPoint?.timestamp)}
      </div>

      <div className={styles.divider} />

      {/* People count */}
      <div className={styles.peopleCount}>
        <span className={styles.peopleIcon}>👥</span>
        <span className={styles.peopleValue} style={{ color: riskColor }}>
          {(currentPeople ?? 0).toLocaleString()}
        </span>
      </div>

      {/* Risk badge */}
      <span
        className={styles.riskBadgeInline}
        style={{
          backgroundColor: `${riskColor}18`,
          color: riskColor,
        }}
      >
        {riskLevel}
      </span>

      <div className={styles.divider} />

      {/* Speed controls */}
      <div className={styles.speedGroup}>
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={s === speed ? styles.speedBtnActive : styles.speedBtn}
            onClick={() => onSpeedChange(s)}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
