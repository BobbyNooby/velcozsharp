/**
 * Shared date formatters — no dependencies, SSR-safe.
 *
 * All formatters use a fixed locale (en-US) so output is deterministic between
 * server and client. The now-dependent output of formatRelative is only ever
 * rendered after client-side data fetches in this app, so it does not
 * participate in hydration.
 */

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const shortDateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** e.g. "Sep 14, 2:44 PM" */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? dateTimeFormat.format(date) : "—";
}

/** e.g. "Sep 14, 2026" */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? dateFormat.format(date) : "—";
}

/** e.g. "just now", "3 min ago", "2 h ago", "Sep 12" (year added when not the current year) */
export function formatRelative(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";

  const elapsedSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (elapsedSeconds < 60) return "just now";

  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const isCurrentYear = date.getFullYear() === new Date().getFullYear();
  return isCurrentYear ? shortDateFormat.format(date) : dateFormat.format(date);
}
