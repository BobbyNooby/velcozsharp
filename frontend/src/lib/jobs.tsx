"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useOrg, useApiFetch } from "./api";

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

export function JobProvider({ children }: { children: React.ReactNode }) {
  const { orgId, authReady } = useOrg();
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

  const fetchJobs = useCallback(async () => {
    if (!orgId) return;

    setLoading(true);
    try {
      const res = await apiFetch("/scan/jobs?pageSize=50");
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        setJobs(data.items ?? []);
      }
    } catch {
      // ignore polling errors
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [orgId, apiFetch]);

  // Poll every 3 seconds when there are active jobs, otherwise every 10 seconds
  const activeJobs = jobs.filter((j) => j.status === "Queued" || j.status === "Running");
  const hasTrackedActive = activeJobs.some((j) => trackedIds.has(j.id));
  const pollInterval = hasTrackedActive || activeJobs.length > 0 ? 3000 : 10000;

  useEffect(() => {
    if (!authReady || !orgId) return;

    fetchJobs();
    const interval = setInterval(fetchJobs, pollInterval);
    return () => clearInterval(interval);
  }, [orgId, authReady, fetchJobs, pollInterval]);

  const trackJob = useCallback((jobId: string) => {
    setTrackedIds((prev) => new Set(prev).add(jobId));
  }, []);

  const refresh = useCallback(() => {
    fetchJobs();
  }, [fetchJobs]);

  return (
    <JobContext.Provider value={{ jobs, activeJobs, loading, refresh, trackJob }}>
      {children}
    </JobContext.Provider>
  );
}

export function useJobs() {
  return useContext(JobContext);
}
