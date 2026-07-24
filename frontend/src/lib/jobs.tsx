"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useOrg, useApiFetch } from "./api";
import { useSignalR } from "./signalr";

type ScanJob = {
  id: string;
  type: string;
  status: "Queued" | "Running" | "Completed" | "Failed";
  totalAssets: number;
  processedAssets: number;
  newVulnerabilitiesFound: number;
  useAi: boolean;
  currentAssetName?: string;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
};

type JobContextValue = {
  jobs: ScanJob[];
  activeJobs: ScanJob[];
  loading: boolean;
  refresh: () => void;
  trackJob: (jobId: string) => void;
};

const JobContext = createContext<JobContextValue>({
  jobs: [],
  activeJobs: [],
  loading: false,
  refresh: () => {},
  trackJob: () => {},
});

const NORMAL_ACTIVE_INTERVAL = 3000;
const NORMAL_IDLE_INTERVAL = 10000;
const SIGNALR_ACTIVE_INTERVAL = 30000;
const SIGNALR_IDLE_INTERVAL = 60000;

export function JobProvider({ children }: { children: React.ReactNode }) {
  const { orgId, authReady } = useOrg();
  const { connected } = useSignalR();
  const apiFetch = useApiFetch();
  const mountedRef = useRef(true);

  const [jobs, setJobs] = useState<ScanJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [trackedIds, setTrackedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchJobs = useCallback(async (signal?: AbortSignal) => {
    if (!orgId) return;

    setLoading(true);
    try {
      const res = await apiFetch("/scan/jobs?pageSize=50", { signal });
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        setJobs(data.items ?? []);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      // ignore polling errors
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [orgId, apiFetch]);

  // Poll every 3 seconds when there are active jobs, otherwise every 10 seconds.
  // While SignalR is connected we trust live messages and slow polling way down.
  const activeJobs = jobs.filter((j) => j.status === "Queued" || j.status === "Running");
  const hasTrackedActive = activeJobs.some((j) => trackedIds.has(j.id));
  const hasActive = hasTrackedActive || activeJobs.length > 0;
  const pollInterval = connected
    ? (hasActive ? SIGNALR_ACTIVE_INTERVAL : SIGNALR_IDLE_INTERVAL)
    : (hasActive ? NORMAL_ACTIVE_INTERVAL : NORMAL_IDLE_INTERVAL);
  const pollIntervalRef = useRef(pollInterval);
  pollIntervalRef.current = pollInterval;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<() => void>(() => {});

  useEffect(() => {
    const controller = new AbortController();
    if (!authReady || !orgId) return () => controller.abort();

    const tick = () => {
      fetchJobs(controller.signal).finally(() => {
        if (mountedRef.current) {
          timeoutRef.current = setTimeout(tick, pollIntervalRef.current);
        }
      });
    };
    tickRef.current = tick;

    tick();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      controller.abort();
    };
  }, [orgId, authReady, fetchJobs]);

  // When the polling interval changes (e.g. SignalR connects/disconnects),
  // restart the pending timer with the new interval without triggering an
  // immediate fetch.
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(tickRef.current, pollIntervalRef.current);
    }
  }, [pollInterval]);

  const trackJob = useCallback((jobId: string) => {
    setTrackedIds((prev) => new Set(prev).add(jobId));
  }, []);

  const refresh = useCallback(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Refresh immediately when SignalR tells us a job reached a terminal state.
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("velcoz:job-changed", handler);
    return () => window.removeEventListener("velcoz:job-changed", handler);
  }, [refresh]);

  return (
    <JobContext.Provider value={{ jobs, activeJobs, loading, refresh, trackJob }}>
      {children}
    </JobContext.Provider>
  );
}

export function useJobs() {
  return useContext(JobContext);
}
