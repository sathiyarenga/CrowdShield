"use client";

import { Shield, ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useEvent } from "@/context/EventContext";
import styles from "./Sidebar.module.css";

export default function Sidebar() {
  const pathname = usePathname();
  const { activeEvent, setActiveEvent, events, navItems } = useEvent();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
        setSelectorOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleEventChange = (eventId: string) => {
    setActiveEvent(eventId);
    setSelectorOpen(false);
  };

  return (
    <aside className="app-sidebar">
      <div className="logo">
        <div className="logo__icon"><Shield size={20} /></div>
        <div>
          <div className="logo__text">CROWDSHIELD</div>
          <div className="logo__sub">Event Risk Intelligence</div>
        </div>
      </div>

      {/* Event Selector */}
      <div className={styles.eventSelector} ref={selectorRef}>
        <button
          className={styles.eventSelectorButton}
          onClick={() => setSelectorOpen(!selectorOpen)}
          aria-expanded={selectorOpen}
        >
          <span className={styles.eventSelectorIcon}>{activeEvent.icon}</span>
          <div className={styles.eventSelectorInfo}>
            <span className={styles.eventSelectorName}>{activeEvent.shortName}</span>
            <span className={styles.eventSelectorLocation}>{activeEvent.location}</span>
          </div>
          <ChevronDown
            size={14}
            className={`${styles.eventSelectorChevron} ${selectorOpen ? styles.eventSelectorChevronOpen : ""}`}
          />
        </button>

        {selectorOpen && (
          <div className={styles.eventDropdown}>
            <div className={styles.eventDropdownLabel}>Switch Event</div>
            {events.map((event) => (
              <button
                key={event.id}
                className={`${styles.eventDropdownItem} ${event.id === activeEvent.id ? styles.eventDropdownItemActive : ""}`}
                onClick={() => handleEventChange(event.id)}
              >
                <span className={styles.eventDropdownIcon}>{event.icon}</span>
                <div className={styles.eventDropdownInfo}>
                  <span className={styles.eventDropdownName}>{event.name}</span>
                  <span className={styles.eventDropdownMeta}>
                    {event.location} · {event.dates}
                  </span>
                </div>
                {event.id === activeEvent.id && (
                  <span className={styles.eventDropdownCheck}>✓</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Dynamic Navigation */}
      <div className="section-label">Navigation</div>
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`nav-item ${pathname === item.href ? "nav-item--active" : ""}`}
        >
          <span className={styles.navIcon}>{item.icon}</span>
          <span>{item.label}</span>
          {item.badge && <span className="usp-badge">{item.badge}</span>}
        </Link>
      ))}
    </aside>
  );
}
