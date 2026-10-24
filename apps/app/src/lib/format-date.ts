/**
 * "1 Haziran 2025". A date without a time ("2025-06-01") is read as UTC so it never shifts a day
 * west of Greenwich; a moment ("2025-06-01T21:30:00Z") is shown on the visitor's own calendar.
 */
export function formatDate(iso: string): string {
  const dateOnly = iso.length === 10;
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(dateOnly ? { timeZone: "UTC" } : {}),
  });
}
