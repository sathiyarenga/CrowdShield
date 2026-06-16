"use client";

import { useEvent } from "@/context/EventContext";
import styles from "./Header.module.css";
import { ThemeToggle } from "../ThemeToggle";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { activeEvent } = useEvent();

  return (
    <header className="app-header">
      <div>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        <p className={styles.eventBreadcrumb}>
          <span className={styles.eventBreadcrumbIcon}>{activeEvent.icon}</span>
          {activeEvent.name} · {activeEvent.location}
        </p>
      </div>
      <div className={styles.headerRight}>
        <ThemeToggle />
        <div className={styles.liveIndicator}>
          <span
            className={styles.liveDot}
            style={{
              background: activeEvent.dataMode === "Pre-Event Planning"
                ? "var(--color-elevated)"
                : "var(--color-data-3)",
            }}
          />
          <span className={styles.liveText}>{activeEvent.dataMode}</span>
        </div>
      </div>
    </header>
  );
}
