import { useState, useCallback, useRef } from "react";
import type { KbStatus } from "@/types/chat";

export function useKbStatus() {
  const [kbStatus, setKbStatus] = useState<KbStatus | null>(null);
  const [kbExpanded, setKbExpanded] = useState(true);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    pollCountRef.current = 0;
  }, []);

  const fetchKbStatus = useCallback(async (includeUser = false) => {
    try {
      const url = includeUser
        ? "/api/knowledge-base/status?user=true"
        : "/api/knowledge-base/status";
      const res = await fetch(url);
      if (res.ok) {
        const data: KbStatus = await res.json();
        setKbStatus(data);
        return data;
      }
    } catch {
      // Silently fail — status is informational
    }
    return null;
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollCountRef.current = 0;

    pollIntervalRef.current = setInterval(async () => {
      pollCountRef.current += 1;
      if (pollCountRef.current > 40) {
        stopPolling();
        return;
      }
      const data = await fetchKbStatus();
      if (data?.status === "synced") {
        stopPolling();
      }
    }, 3000);
  }, [stopPolling, fetchKbStatus]);

  return { kbStatus, kbExpanded, setKbExpanded, fetchKbStatus, startPolling, stopPolling };
}
