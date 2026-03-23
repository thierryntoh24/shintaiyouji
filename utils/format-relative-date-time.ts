import { defaultLocale, Locale } from "@/i18n/config";
import { createFormatter } from "next-intl";

type FormatStyle = boolean | "verbose" | "date" | "date-full";

interface FormatDateOptions {
  extended?: FormatStyle;
  minimal?: boolean;
  locale?: Locale;
}

/**
 * Formats a date input (timestamp or ISO or UTC string) into a human-readable string.
 *
 * - For past dates:
 *   - Returns relative time if within 48 hours (e.g., "5 mins ago", "1 day ago").
 *   - Otherwise, returns a formatted date (short, extended, or verbose).
 *
 * - For future dates:
 *   - Returns relative time if within 48 hours (e.g., "in 5 mins", "in 2 hours").
 *   - Otherwise, returns a formatted future date.
 *
 * @param dateinput - A date in number or string format.
 * @param options.extended - Optional formatting style:
 *   - false (default): returns a short date like "10/02/25"
 *   - true: returns a full timestamp like "11:23 am, 10/02/2025"
 *   - "verbose": returns a more readable format like "06:03 pm, 01 Apr 2025"
 * @returns A formatted time string.
 */
export function formatRelativeDateTime(
  dateinput: number | string,
  options: FormatDateOptions = {},
): string {
  const { extended = false, minimal, locale } = options;
  const date = new Date(dateinput);
  const now = new Date();
  const format = createFormatter({ locale: locale || defaultLocale });

  const diffinMs = date.getTime() - now.getTime();
  const isFuture = diffinMs > 0;

  const absDiff = Math.abs(diffinMs);
  const seconds = Math.floor(absDiff / 1000);

  if (minimal) {
    if (seconds < 60) return isFuture ? "a few secs" : "Just now";
    return format.relativeTime(date, { now, style: "narrow" });
  }

  if (!extended) {
    if (seconds < 60) return isFuture ? "in a few seconds" : "Just now";
    return format.relativeTime(date, { now, style: "short" });
  }

  // Extended formats
  if (extended === "verbose") {
    // e.g. "06:03 pm, 01 Apr 2025"
    return date
      .toLocaleString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        // hour12: true,
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .toLowerCase();
  }

  if (extended === "date") {
    // e.g. "01 Apr 2025"
    return date
      .toLocaleString(locale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .toLowerCase();
  }

  if (extended === "date-full") {
    // e.g. "Wednesday, Dec 30, 2023"
    return date.toLocaleDateString(locale, {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (extended === true) {
    // e.g. "11:23 am, 10/02/2025"
    const time = date
      .toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
      .toLowerCase();

    const shortDate = date.toLocaleDateString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    return `${time}, ${shortDate}`;
  }

  // Fallback: short date like "10/02/25"
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}
