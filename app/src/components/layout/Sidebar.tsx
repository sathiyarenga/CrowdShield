"use client";

import { Shield } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Sidebar.module.css";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: string;
}

const mainNav: NavItem[] = [
  { href: "/", label: "Command Center", icon: "◉" },
  { href: "/analytics", label: "Event Analytics", icon: "◈" },
  { href: "/monitoring", label: "Live Monitoring", icon: "◎" },
  { href: "/documents", label: "Document Intelligence", icon: "◇", badge: "AI" },
  { href: "/risk", label: "Risk Intelligence", icon: "🛡️" },
];

const insightsNav: NavItem[] = [
  {
    href: "/galway",
    label: "Galway Pilot",
    icon: "☘",
    badge: "NEW",
  },
  {
    href: "/historical",
    label: "Historical Intelligence",
    icon: "★",
    badge: "USP",
  },
  { href: "/benchmarks", label: "Benchmarks", icon: "◆" },
  { href: "/stakeholders", label: "Stakeholder Matrix", icon: "◫" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar">
      <div className="logo">
        <div className="logo__icon"><Shield size={20} /></div>
        <div>
          <div className="logo__text">CROWDSHIELD</div>
          <div className="logo__sub">Event Risk Intelligence</div>
        </div>
      </div>

      <div className="section-label">Operations</div>
      {mainNav.map((item) => (
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

      <div className="section-label">Intelligence</div>
      {insightsNav.map((item) => (
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

      <div className={styles.sidebarFooter}>
        <div className={styles.eventBadge}>
          <div className={styles.eventBadgeDot} />
          <div>
            <div className={styles.eventName}>Ullevaal Stadion</div>
            <div className={styles.eventDetail}>5 match days · Sep–Oct 2025</div>
          </div>
        </div>
        <div className={styles.eventBadge}>
          <div className={`${styles.eventBadgeDot} ${styles.eventBadgeDotPilot}`} />
          <div>
            <div className={styles.eventName}>The Whale Street</div>
            <div className={styles.eventDetail}>GIAF Galway · Jul 17-18, 2026</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
