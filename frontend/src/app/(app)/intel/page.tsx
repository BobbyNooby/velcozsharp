"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useOrg, useApiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/skeletons";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Radar,
  ExternalLink,
  Sparkles,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowLeft,
  Download,
} from "lucide-react";

type IntelStatus = { valyuConfigured: boolean; aiEnabled: boolean };

type Finding = {
  title: string;
  url: string | null;
  snippet: string | null;
  source: string | null;
  publicationDate: string | null;
  relevanceScore: number | null;
  aiRelevanceScore: number | null;
  preset: string;
  matchedCves: string[];
  matchedAssets: string[];
};

type Brief = {
  generatedAt: string;
  sinceDays: number;
  queries: { query: string; preset: string; resultCount: number; error: string | null }[];
  findings: Finding[];
  totalCostUsd: number;
  aiRerankApplied: boolean;
  notice: string | null;
};

type IntelReportItem = {
  id: string;
  title: string;
  mode: string;
  status: string;
  currentStep: number | null;
  totalSteps: number | null;
  startedAt: string;
  completedAt: string | null;
  costUsd: number | null;
  sourceCount: number | null;
  errorMessage: string | null;
};

type IntelReportDetail = IntelReportItem & {
  reportMarkdown: string | null;
  pdfUrl: string | null;
};

function scoreBadgeClass(score: number) {
  if (score >= 85) return "bg-red-500/12 text-red-700 dark:text-red-400 ring-red-500/20";
  if (score >= 70) return "bg-orange-500/12 text-orange-700 dark:text-orange-400 ring-orange-500/20";
  if (score >= 50) return "bg-amber-500/12 text-amber-700 dark:text-amber-400 ring-amber-500/20";
  return "bg-blue-500/12 text-blue-700 dark:text-blue-400 ring-blue-500/20";
}

function fmtDuration(fromMs: number) {
  const total = Math.max(0, Math.floor(fromMs / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Human-readable stage for the DeepResearch pipeline, driven by step progress. */
function stageLabel(step: number | null, total: number | null) {
  if (step == null || total == null || total === 0) return "Queued at Valyu…";
  const pct = step / total;
  if (pct < 0.35) return "Researching sources…";
  if (pct < 0.6) return "Cross-checking findings…";
  if (pct < 0.9) return "Verifying claims and citations…";
  return "Writing the report…";
}

export default function IntelPage() {
  const { orgId, authReady } = useOrg();
  const [tab, setTab] = useState<"brief" | "reports">("brief");

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <PageHeader
        title="Threat Intel"
        description="Cited intelligence scoped to your inventoried assets, via Valyu search"
      />

      {/* Tab switcher */}
      <div className="inline-flex rounded-lg border p-1 gap-1">
        <button
          onClick={() => setTab("brief")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "brief" ? "bg-primary/12 text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Live Brief
        </button>
        <button
          onClick={() => setTab("reports")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "reports" ? "bg-primary/12 text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Audit Reports
        </button>
      </div>

      {tab === "brief" ? <BriefPanel /> : <ReportsPanel enabled={authReady && !!orgId} />}
    </div>
  );
}

/* ---------------------------------- Live brief ---------------------------------- */

function BriefPanel() {
  const { orgId, authReady } = useOrg();
  const apiFetch = useApiFetch();
  const mountedRef = useRef(true);

  const [status, setStatus] = useState<IntelStatus | null>(null);
  const [sinceDays, setSinceDays] = useState("7");
  const [useAiRerank, setUseAiRerank] = useState(true);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Rerank can only actually run when AI is enabled for the org; keep the checkbox
  // from looking checked when the backend would ignore it anyway.
  const aiReady = !!status?.aiEnabled;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!orgId) return;
    apiFetch("/intel/status")
      .then(async (res) => {
        if (!mountedRef.current) return;
        if (res.ok) setStatus(await res.json());
      })
      .catch(() => {});
  }, [orgId, apiFetch]);

  const generateBrief = async () => {
    setLoading(true);
    setMessage("");
    setBrief(null);
    try {
      const res = await apiFetch("/intel/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sinceDays: Number(sinceDays), useAiRerank: aiReady && useAiRerank, maxQueries: 6 }),
      });
      const data = await res.json();
      if (!mountedRef.current) return;
      if (res.ok) {
        setBrief(data);
        if (data.aiRerankApplied) setUseAiRerank(true);
      } else {
        setMessage(data.message ?? "Failed to generate brief");
      }
    } catch {
      if (mountedRef.current) setMessage("Network error");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 border rounded-lg p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Look back</span>
          <Select value={sinceDays} onValueChange={(v) => v != null && setSinceDays(v)}>
            <SelectTrigger className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="14">14 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={aiReady && useAiRerank}
            onCheckedChange={(v) => setUseAiRerank(v === true)}
            disabled={!status?.aiEnabled}
          />
          <Sparkles className="size-4 text-muted-foreground" />
          AI rerank
          {!status?.aiEnabled && (
            <span className="text-xs text-muted-foreground">(requires AI setup in Settings)</span>
          )}
        </label>
        <Button
          onClick={generateBrief}
          disabled={loading || !status?.valyuConfigured}
          className="ml-auto"
        >
          <Radar className="size-4" />
          {loading ? "Generating..." : "Generate Brief"}
        </Button>
      </div>

      {status && !status.valyuConfigured && (
        <div className="bg-amber-500/12 text-amber-700 dark:text-amber-400 px-3 py-2 rounded text-sm ring-1 ring-inset ring-amber-500/20">
          Valyu API key is not configured. Add it in backend user-secrets as{" "}
          <code className="font-mono">Valyu:ApiKey</code> (get one at platform.valyu.ai), then reload.
        </div>
      )}

      {message && (
        <div className="bg-blue-50 dark:bg-blue-500/12 text-blue-700 dark:text-blue-400 px-3 py-2 rounded text-sm">
          {message}
        </div>
      )}

      {loading && (
        <div className="space-y-4" aria-busy="true">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Sweeping sources for fresh intel on your inventory&hellip;
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="border rounded-lg p-4 space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      )}

      {brief && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>Brief &middot; {new Date(brief.generatedAt).toLocaleString()}</span>
            <span>{brief.queries.length} queries</span>
            <span>${brief.totalCostUsd.toFixed(4)}</span>
            {brief.aiRerankApplied && (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="size-3.5" /> AI reranked
              </span>
            )}
          </div>

          {brief.notice && (
            <div className="bg-muted text-muted-foreground px-3 py-2 rounded text-sm">
              {brief.notice}
            </div>
          )}

          {brief.findings.map((finding, i) => {
            const score =
              finding.aiRelevanceScore ??
              (finding.relevanceScore != null ? Math.round(finding.relevanceScore * 100) : null);
            return (
              <div key={finding.url ?? i} className="border rounded-lg p-4 space-y-2">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    {finding.url ? (
                      <a
                        href={finding.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold hover:underline"
                      >
                        {finding.title}
                      </a>
                    ) : (
                      <span className="font-semibold">{finding.title}</span>
                    )}
                    <div className="text-sm text-muted-foreground">
                      {finding.source ?? "web"}
                      {finding.publicationDate && ` · ${finding.publicationDate}`}
                      {" · "}
                      {finding.preset}
                    </div>
                  </div>
                  {score != null && (
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset tabular-nums ${scoreBadgeClass(score)}`}
                    >
                      {score}%{finding.aiRelevanceScore != null ? " AI" : ""}
                    </span>
                  )}
                </div>

                {finding.snippet && (
                  <p className="text-sm text-muted-foreground">{finding.snippet}</p>
                )}

                {(finding.matchedCves.length > 0 || finding.matchedAssets.length > 0) && (
                  <div className="flex flex-wrap gap-2">
                    {finding.matchedCves.map((cve) => (
                      <span
                        key={cve}
                        className="text-xs bg-red-500/12 text-red-700 dark:text-red-400 px-2 py-0.5 rounded ring-1 ring-inset ring-red-500/20"
                      >
                        {cve}
                      </span>
                    ))}
                    {finding.matchedAssets.map((asset) => (
                      <span key={asset} className="text-xs bg-muted px-2 py-0.5 rounded">
                        {asset}
                      </span>
                    ))}
                  </div>
                )}

                {finding.url && (
                  <a
                    href={finding.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Source <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            );
          })}

          {brief.findings.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Radar className="size-10 mx-auto mb-3 opacity-40" />
              <div className="text-lg mb-2">No findings</div>
              <div className="text-sm max-w-md mx-auto">
                No findings for your inventory in the last {brief.sinceDays} days — try a longer
                range.
              </div>
            </div>
          )}
        </div>
      )}

      {!brief && !loading && authReady && !message && (
        <div className="text-center py-12 text-muted-foreground">
          <Radar className="size-10 mx-auto mb-3 opacity-40" />
          <div className="text-lg mb-2">No brief yet</div>
          <div className="text-sm max-w-md mx-auto">
            Generate a brief to sweep fresh CVE exploitation news, vendor advisories, and
            compliance changes for the products in your asset inventory — every finding cited.
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Audit reports --------------------------------- */

function ReportsPanel({ enabled }: { enabled: boolean }) {
  const apiFetch = useApiFetch();
  const mountedRef = useRef(true);

  const [status, setStatus] = useState<IntelStatus | null>(null);
  const [mode, setMode] = useState("fast");
  const [reports, setReports] = useState<IntelReportItem[]>([]);
  const [selected, setSelected] = useState<IntelReportDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [hasFetched, setHasFetched] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const active = reports.some((r) => r.status === "Queued" || r.status === "Running");

  const fetchReports = useCallback(async () => {
    try {
      const res = await apiFetch("/intel/reports");
      if (!mountedRef.current) return;
      if (res.ok) {
        setReports(await res.json());
        setHasFetched(true);
      }
    } catch {}
  }, [apiFetch]);

  // Config status (free)
  useEffect(() => {
    apiFetch("/intel/status")
      .then(async (res) => {
        if (res.ok) setStatus(await res.json());
      })
      .catch(() => {});
  }, [apiFetch]);

  // Initial list load
  useEffect(() => {
    if (!enabled) return;
    apiFetch("/intel/reports")
      .then(async (res) => {
        if (res.ok) {
          setReports(await res.json());
          setHasFetched(true);
        }
      })
      .catch(() => {});
  }, [enabled, apiFetch]);

  // Poll while something is in flight
  useEffect(() => {
    if (!active) return;
    const t = setInterval(fetchReports, 8000);
    return () => clearInterval(t);
  }, [active, fetchReports]);

  // Ticking clock for the elapsed counter
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  const createAudit = async () => {
    setCreating(true);
    setMessage("");
    setSelected(null);
    try {
      const res = await apiFetch("/intel/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, sinceDays: 30 }),
      });
      const data = await res.json();
      if (res.status === 202 || res.ok) {
        await fetchReports();
      } else if (mountedRef.current) {
        setMessage(data.message ?? "Failed to start audit");
      }
    } catch {
      if (mountedRef.current) setMessage("Network error");
    }
    if (mountedRef.current) setCreating(false);
  };

  const viewReport = async (id: string) => {
    try {
      const res = await apiFetch(`/intel/reports/${id}`);
      if (!mountedRef.current) return;
      if (res.ok) setSelected(await res.json());
    } catch {}
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 border rounded-lg p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Depth</span>
          <Select value={mode} onValueChange={(v) => v != null && setMode(v)}>
            <SelectTrigger className="w-[230px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fast">fast · ~5 min · ~$0.10</SelectItem>
              <SelectItem value="standard">standard · 10–20 min · ~$0.50</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={createAudit} disabled={creating || !status?.valyuConfigured} className="ml-auto">
          {creating ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
          {creating ? "Starting..." : "Audit Current Situation"}
        </Button>
      </div>

      {status && !status.valyuConfigured && (
        <div className="bg-amber-500/12 text-amber-700 dark:text-amber-400 px-3 py-2 rounded text-sm ring-1 ring-inset ring-amber-500/20">
          Valyu API key is not configured — audits cannot start. Add it in backend user-secrets
          as <code className="font-mono">Valyu:ApiKey</code>.
        </div>
      )}

      {message && (
        <div className="bg-blue-50 dark:bg-blue-500/12 text-blue-700 dark:text-blue-400 px-3 py-2 rounded text-sm">
          {message}
        </div>
      )}

      {selected ? (
        <ReportView report={selected} onBack={() => setSelected(null)} />
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              now={now}
              onOpen={r.status === "Completed" ? () => viewReport(r.id) : undefined}
            />
          ))}
          {reports.length === 0 && hasFetched && (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="size-10 mx-auto mb-3 opacity-40" />
              <div className="text-lg mb-2">No audit reports yet</div>
              <div className="text-sm max-w-md mx-auto">
                Run &ldquo;Audit Current Situation&rdquo; and a DeepResearch agent will sweep
                exploitation evidence, vendor advisories, and compliance changes for your exact
                stack — then write a cited, timestamped report you can share.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ report }: { report: IntelReportItem }) {
  switch (report.status) {
    case "Completed":
      return (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
          <CheckCircle2 className="size-3" /> Completed
        </span>
      );
    case "Failed":
      return (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-500/12 text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-500/20">
          <XCircle className="size-3" /> Failed
        </span>
      );
    case "Running":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium bg-violet-500/12 text-violet-700 dark:text-violet-400 ring-1 ring-inset ring-violet-500/20">
          <Loader2 className="size-3 animate-spin" /> Running
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-500/12 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20">
          <Clock className="size-3 animate-pulse" /> Queued
        </span>
      );
  }
}

function ProgressPulse({ report, now }: { report: IntelReportItem; now: number }) {
  const elapsed = now - new Date(report.startedAt).getTime();
  const pct =
    report.currentStep != null && report.totalSteps
      ? Math.min(100, Math.round((report.currentStep / report.totalSteps) * 100))
      : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-medium text-violet-700 dark:text-violet-400">
          <span className="inline-block size-2 rounded-full bg-violet-500 intel-ring" />
          {stageLabel(report.currentStep, report.totalSteps)}
        </span>
        <span className="tabular-nums">
          elapsed {fmtDuration(elapsed)}
          {pct != null && ` · step ${report.currentStep}/${report.totalSteps}`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden relative">
        {pct != null ? (
          <div
            className="h-full rounded-full bg-violet-500/70 transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        ) : null}
        <div className="absolute inset-y-0 w-1/3 intel-shimmer bg-gradient-to-r from-transparent via-violet-500/30 to-transparent rounded-full" />
      </div>
    </div>
  );
}

function ReportCard({
  report,
  now,
  onOpen,
}: {
  report: IntelReportItem;
  now: number;
  onOpen?: () => void;
}) {
  const inFlight = report.status === "Queued" || report.status === "Running";

  return (
    <div
      className={`border rounded-lg p-4 space-y-2 transition-all ${
        inFlight ? "border-violet-500/40 bg-violet-500/[0.04]" : "hover:bg-muted/40"
      }`}
    >
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <div className="font-semibold truncate">{report.title}</div>
          <div className="text-sm text-muted-foreground">
            {report.mode} mode
            {report.completedAt &&
              ` · finished ${new Date(report.completedAt).toLocaleString()}`}
            {report.costUsd != null && ` · $${Number(report.costUsd).toFixed(2)}`}
            {report.sourceCount != null && ` · ${report.sourceCount} sources`}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge report={report} />
          {onOpen && (
            <Button variant="outline" size="sm" onClick={onOpen}>
              View
            </Button>
          )}
        </div>
      </div>

      {inFlight && <ProgressPulse report={report} now={now} />}

      {report.status === "Failed" && report.errorMessage && (
        <div className="text-sm text-red-700 dark:text-red-400">{report.errorMessage}</div>
      )}
    </div>
  );
}

const markdownComponents: Record<
  string,
  React.ComponentType<React.HTMLAttributes<HTMLElement>>
> = {
  h1: (p) => <h1 className="text-xl font-semibold mt-6 mb-3 first:mt-0" {...p} />,
  h2: (p) => <h2 className="text-lg font-semibold mt-6 mb-3 border-b pb-1" {...p} />,
  h3: (p) => <h3 className="text-base font-semibold mt-4 mb-2" {...p} />,
  p: (p) => <p className="text-sm leading-relaxed my-2" {...p} />,
  ul: (p) => <ul className="list-disc pl-5 my-2 space-y-1 text-sm" {...p} />,
  ol: (p) => <ol className="list-decimal pl-5 my-2 space-y-1 text-sm" {...p} />,
  li: (p) => <li className="leading-relaxed" {...p} />,
  a: (p) => (
    <a className="text-primary underline underline-offset-2 hover:opacity-80" target="_blank" rel="noopener noreferrer" {...p} />
  ),
  blockquote: (p) => (
    <blockquote className="border-l-2 border-primary/40 pl-3 my-3 text-muted-foreground" {...p} />
  ),
  pre: (p) => (
    <pre
      className="overflow-x-auto rounded-lg border bg-muted/40 dark:bg-muted/20 p-3 my-3 font-mono text-xs leading-snug"
      {...p}
    />
  ),
  code: (p) => <code className="font-mono text-xs" {...p} />,
  table: (p) => (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-xs border-collapse" {...p} />
    </div>
  ),
  th: (p) => <th className="border px-2 py-1 text-left font-semibold bg-muted/60" {...p} />,
  td: (p) => <td className="border px-2 py-1 align-top" {...p} />,
  hr: () => <hr className="my-4 border-border" />,
};

function nodeText(node: unknown): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (node && typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: unknown } }).props;
    return nodeText(props?.children);
  }
  return "";
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

type TocItem = { level: number; text: string; id: string };

/** Parses ## / ### headings out of the raw markdown for the table of contents. */
function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  const seen = new Map<string, number>();
  for (const line of markdown.split("\n")) {
    const m = /^(#{2,3})\s+(.*)$/.exec(line.trim());
    if (!m) continue;
    const text = m[2]
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_`]/g, "")
      .trim();
    if (!text) continue;
    const base = slugify(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    items.push({ level: m[1].length, text, id: n > 0 ? `${base}-${n}` : base });
  }
  return items;
}

function ReportView({ report, onBack }: { report: IntelReportDetail; onBack: () => void }) {
  const toc = report.reportMarkdown ? extractToc(report.reportMarkdown) : [];

  const headingComponents = {
    ...markdownComponents,
    h2: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h2
        id={slugify(nodeText(p.children))}
        className="text-lg font-semibold mt-6 mb-3 border-b pb-1 scroll-mt-4"
        {...p}
      />
    ),
    h3: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h3
        id={slugify(nodeText(p.children))}
        className="text-base font-semibold mt-4 mb-2 scroll-mt-4"
        {...p}
      />
    ),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="size-4" /> All reports
        </Button>
        {report.pdfUrl && (
          <a
            href={report.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted/60 transition-colors"
          >
            <Download className="size-4" /> Download PDF
          </a>
        )}
      </div>

      <div className="border rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b">
          <div>
            <div className="font-semibold">{report.title}</div>
            <div className="text-xs text-muted-foreground">
              started {new Date(report.startedAt).toLocaleString()}
              {report.completedAt &&
                ` · completed ${new Date(report.completedAt).toLocaleString()}`}
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <StatusBadge report={report} />
            {report.costUsd != null && <span>${Number(report.costUsd).toFixed(2)}</span>}
            {report.sourceCount != null && <span>{report.sourceCount} sources</span>}
          </div>
        </div>

        {report.reportMarkdown ? (
          <div className="max-w-none">
            {toc.length > 1 && (
              <nav className="mb-6 rounded-lg border bg-muted/30 p-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Contents
                </div>
                <ul className="space-y-1">
                  {toc.map((item) => (
                    <li
                      key={item.id}
                      className={item.level === 3 ? "pl-4" : ""}
                    >
                      <a
                        href={`#${item.id}`}
                        className="text-sm text-muted-foreground hover:text-primary transition-colors"
                      >
                        {item.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <Markdown remarkPlugins={[remarkGfm]} components={headingComponents}>
              {report.reportMarkdown}
            </Markdown>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground animate-pulse">
            Report content is still downloading…
          </div>
        )}
      </div>
    </div>
  );
}
