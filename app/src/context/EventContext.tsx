"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

// ── Event feature flags ────────────────────────────────────────────────────
export interface EventFeatures {
  commandCenter: boolean;
  analytics: boolean;
  liveMonitoring: boolean;
  documents: boolean;
  riskIntelligence: boolean;
  historical: boolean;
  benchmarks: boolean;
  stakeholders: boolean;
}

// ── Event configuration ────────────────────────────────────────────────────
export interface EventConfig {
  id: string;
  name: string;
  shortName: string;
  location: string;
  dates: string;
  icon: string;
  venueId: string | null;
  color: string;
  features: EventFeatures;
}

// ── Event registry ─────────────────────────────────────────────────────────
export const EVENT_REGISTRY: EventConfig[] = [
  {
    id: "ullevaal",
    name: "Ullevål Stadion",
    shortName: "Ullevål",
    location: "Oslo, Norway",
    dates: "Sep–Oct 2025",
    icon: "🏟️",
    venueId: "ullevaal",
    color: "#3b82f6",
    features: {
      commandCenter: true,
      analytics: false,
      liveMonitoring: true,
      documents: false,
      riskIntelligence: true,
      historical: true,
      benchmarks: true,
      stakeholders: false,
    },
  },
  {
    id: "galway",
    name: "Galway International Arts Festival",
    shortName: "GIAF Galway",
    location: "Galway, Ireland",
    dates: "Jul 17–18, 2026",
    icon: "🎭",
    venueId: "galway",
    color: "#8b5cf6",
    features: {
      commandCenter: true,
      analytics: false,
      liveMonitoring: true,
      documents: true,
      riskIntelligence: true,
      historical: false,
      benchmarks: false,
      stakeholders: true,
    },
  },
  {
    id: "fredrikstad",
    name: "Fredrikstad City Monitoring",
    shortName: "Fredrikstad",
    location: "Fredrikstad, Norway",
    dates: "Jul 2023",
    icon: "📡",
    venueId: null,
    color: "#06b6d4",
    features: {
      commandCenter: false,
      analytics: true,
      liveMonitoring: false,
      documents: false,
      riskIntelligence: false,
      historical: false,
      benchmarks: false,
      stakeholders: false,
    },
  },
];

// ── Navigation definition ──────────────────────────────────────────────────
export interface NavItem {
  href: string;
  label: string;
  icon: string;
  featureKey: keyof EventFeatures;
  badge?: string;
}

export const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Command Center", icon: "◉", featureKey: "commandCenter" },
  { href: "/analytics", label: "Event Analytics", icon: "◈", featureKey: "analytics" },
  { href: "/monitoring", label: "Live Monitoring", icon: "◎", featureKey: "liveMonitoring" },
  { href: "/documents", label: "Document Intelligence", icon: "◇", featureKey: "documents", badge: "AI" },
  { href: "/risk", label: "Risk Intelligence", icon: "🛡️", featureKey: "riskIntelligence" },
  { href: "/historical", label: "Historical Intelligence", icon: "★", featureKey: "historical" },
  { href: "/benchmarks", label: "Benchmarks", icon: "◆", featureKey: "benchmarks" },
  { href: "/stakeholders", label: "Stakeholder Matrix", icon: "◫", featureKey: "stakeholders" },
];

// ── Context ────────────────────────────────────────────────────────────────
interface EventContextValue {
  activeEvent: EventConfig;
  setActiveEvent: (eventId: string) => void;
  events: EventConfig[];
  navItems: NavItem[];
}

const EventContext = createContext<EventContextValue | undefined>(undefined);

const STORAGE_KEY = "crowdshield_active_event";

export function EventProvider({ children }: { children: ReactNode }) {
  const [activeEventId, setActiveEventId] = useState<string>("ullevaal");
  const [hydrated, setHydrated] = useState(false);

  // Restore from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && EVENT_REGISTRY.some((e) => e.id === stored)) {
      setActiveEventId(stored);
    }
    setHydrated(true);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (hydrated) {
      localStorage.setItem(STORAGE_KEY, activeEventId);
    }
  }, [activeEventId, hydrated]);

  const activeEvent =
    EVENT_REGISTRY.find((e) => e.id === activeEventId) ?? EVENT_REGISTRY[0];

  const navItems = ALL_NAV_ITEMS.filter(
    (item) => activeEvent.features[item.featureKey]
  );

  const setActiveEvent = (eventId: string) => {
    if (EVENT_REGISTRY.some((e) => e.id === eventId)) {
      setActiveEventId(eventId);
    }
  };

  return (
    <EventContext.Provider
      value={{
        activeEvent,
        setActiveEvent,
        events: EVENT_REGISTRY,
        navItems,
      }}
    >
      {children}
    </EventContext.Provider>
  );
}

export function useEvent(): EventContextValue {
  const ctx = useContext(EventContext);
  if (!ctx) {
    throw new Error("useEvent must be used within an EventProvider");
  }
  return ctx;
}
