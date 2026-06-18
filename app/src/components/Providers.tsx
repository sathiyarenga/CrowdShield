"use client";

import { BackendStatusProvider } from "@/hooks/useBackendStatus";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <BackendStatusProvider>{children}</BackendStatusProvider>;
}
