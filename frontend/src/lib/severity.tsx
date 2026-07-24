import { cn } from "@/lib/utils";

export const severityBadgeClass: Record<string, string> = {
  CRITICAL: "bg-red-500/12 text-red-700 dark:text-red-400 ring-red-500/20",
  HIGH: "bg-orange-500/12 text-orange-700 dark:text-orange-400 ring-orange-500/20",
  MEDIUM: "bg-amber-500/12 text-amber-700 dark:text-amber-400 ring-amber-500/20",
  LOW: "bg-blue-500/12 text-blue-700 dark:text-blue-400 ring-blue-500/20",
};

export const criticalityBadgeClass: Record<string, string> = {
  Critical: "bg-red-500/12 text-red-700 dark:text-red-400 ring-red-500/20",
  High: "bg-orange-500/12 text-orange-700 dark:text-orange-400 ring-orange-500/20",
  Medium: "bg-amber-500/12 text-amber-700 dark:text-amber-400 ring-amber-500/20",
  Low: "bg-blue-500/12 text-blue-700 dark:text-blue-400 ring-blue-500/20",
};

export const severityColorClass: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700 hover:bg-red-100",
  HIGH: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  MEDIUM: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
  LOW: "bg-blue-100 text-blue-700 hover:bg-blue-100",
};

export const criticalityColorClass: Record<string, string> = {
  Critical: "bg-red-100 text-red-700 hover:bg-red-100",
  High: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  Medium: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
  Low: "bg-blue-100 text-blue-700 hover:bg-blue-100",
};

export function severityClass(severity?: string) {
  if (!severity) return "";
  return severityBadgeClass[severity.toUpperCase()] ?? "";
}

export function criticalityClass(criticality?: string) {
  if (!criticality) return "";
  return criticalityBadgeClass[criticality] ?? "";
}

const severityBorderClass: Record<string, string> = {
  CRITICAL: "border-red-300",
  HIGH: "border-orange-300",
  MEDIUM: "border-yellow-300",
  LOW: "border-blue-300",
};

const criticalityBorderClass: Record<string, string> = {
  Critical: "border-red-300",
  High: "border-orange-300",
  Medium: "border-yellow-300",
  Low: "border-blue-300",
};

export function severityColor(severity?: string, opts?: { border?: boolean }) {
  if (!severity) return "";
  const base = severityColorClass[severity.toUpperCase()] ?? "";
  if (!base || !opts?.border) return base;
  return cn(base, "border", severityBorderClass[severity.toUpperCase()] ?? "");
}

export function criticalityColor(criticality?: string, opts?: { border?: boolean }) {
  if (!criticality) return "";
  const base = criticalityColorClass[criticality] ?? "";
  if (!base || !opts?.border) return base;
  return cn(base, "border", criticalityBorderClass[criticality] ?? "");
}

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

export function severityRank(severity: string) {
  return SEVERITY_ORDER[severity.toUpperCase()] ?? 0;
}

export function sortBySeverity<T extends Record<string, unknown>>(
  items: T[],
  key: keyof T
): T[] {
  return [...items].sort(
    (a, b) => severityRank(String(b[key])) - severityRank(String(a[key]))
  );
}

export function SeverityBadge({ severity, score, className }: { severity: string; score?: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        severityClass(severity),
        className
      )}
    >
      {severity}
      {score != null && <span className="ml-1 tabular-nums opacity-80">{score}</span>}
    </span>
  );
}

export function CriticalityBadge({ criticality, isAuto, className }: { criticality: string; isAuto?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        criticalityColor(criticality),
        className
      )}
    >
      {criticality}
      {isAuto && <span className="ml-1 text-[10px] opacity-70">auto</span>}
    </span>
  );
}
