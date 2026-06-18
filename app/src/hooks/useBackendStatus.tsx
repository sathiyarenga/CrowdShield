/**
 * useBackendStatus — detects whether the CrowdShield backend is online.
 *
 * On Render's free tier the backend spins down after 15 min of inactivity.
 * Cold starts take 30-60 seconds. This hook:
 * 1. Pings /api/health on mount
 * 2. If it fails, retries every 3s up to 10 times (≈30s)
 * 3. Exposes status so the UI can show a "waking up" toast
 */

"use client";

import { useEffect, useState, useRef, createContext, useContext } from "react";
import { API_BASE } from "@/lib/api/client";

export type BackendStatus = "checking" | "waking" | "online" | "offline";

interface BackendStatusCtx {
  status: BackendStatus;
  isOnline: boolean;
  isWaking: boolean;
}

const BackendStatusContext = createContext<BackendStatusCtx>({
  status: "checking",
  isOnline: false,
  isWaking: false,
});

export function useBackendStatus(): BackendStatusCtx {
  return useContext(BackendStatusContext);
}

const MAX_RETRIES = 10;
const RETRY_INTERVAL = 3000;

export function BackendStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<BackendStatus>("checking");
  const retriesRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Skip in demo mode
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      setStatus("online");
      return;
    }

    let cancelled = false;

    async function ping() {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(`${API_BASE}/api/health`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok && !cancelled) {
          setStatus("online");
        } else {
          throw new Error("not ok");
        }
      } catch {
        if (cancelled) return;

        retriesRef.current += 1;

        if (retriesRef.current === 1) {
          setStatus("waking"); // First failure: probably waking up
        }

        if (retriesRef.current < MAX_RETRIES) {
          timerRef.current = setTimeout(ping, RETRY_INTERVAL);
        } else {
          setStatus("offline");
        }
      }
    }

    ping();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const ctx: BackendStatusCtx = {
    status,
    isOnline: status === "online",
    isWaking: status === "waking",
  };

  return (
    <BackendStatusContext.Provider value={ctx}>
      {children}
      {status === "waking" && <WakeUpToast />}
    </BackendStatusContext.Provider>
  );
}

/* -- Toast Component ---------------------------------------------------- */

function WakeUpToast() {
  const [visible, setVisible] = useState(false);
  const { status } = useContext(BackendStatusContext);

  useEffect(() => {
    // Slight delay to avoid flash
    const t = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (status === "online" || status === "offline") {
      // Fade out then unmount
      const t = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(t);
    }
  }, [status]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1.5rem",
        right: "1.5rem",
        zIndex: 9999,
        background: "rgba(30, 41, 59, 0.95)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(148, 163, 184, 0.2)",
        borderRadius: "0.75rem",
        padding: "1rem 1.25rem",
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        color: "#e2e8f0",
        fontSize: "0.8rem",
        maxWidth: "420px",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
        animation: "fadeInUp 0.3s ease-out",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: "1rem",
          height: "1rem",
          border: "2px solid #94a3b8",
          borderTopColor: "#60a5fa",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
          flexShrink: 0,
        }}
      />
      <div>
        <div style={{ fontWeight: 600, marginBottom: "0.15rem" }}>
          Backend is waking up…
        </div>
        <div style={{ color: "#94a3b8", fontSize: "0.7rem" }}>
          Free tier spins down after inactivity. Usually takes 20–40 seconds.
        </div>
      </div>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
