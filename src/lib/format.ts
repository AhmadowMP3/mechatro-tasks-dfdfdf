import type { Lang } from "@/i18n/dict";

const AR_DIGITS = ["٠","١","٢","٣","٤","٥","٦","٧","٨","٩"];

export function toLocalDigits(s: string | number, lang: Lang): string {
  const str = String(s);
  if (lang !== "ar") return str;
  return str.replace(/\d/g, (d) => AR_DIGITS[+d]);
}

export function formatDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const formatted = d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
  return formatted;
}

export function isOverdue(due: string | null | undefined, status?: string): boolean {
  if (!due || status === "done") return false;
  const d = new Date(due);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return d < now;
}

export function relativeTime(iso: string, lang: Lang): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang === "ar" ? "ar" : "en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000], ["month", 2592000], ["day", 86400],
    ["hour", 3600], ["minute", 60], ["second", 1],
  ];
  for (const [u, s] of units) {
    if (Math.abs(diff) >= s || u === "second") return rtf.format(-Math.round(diff / s), u);
  }
  return "";
}

export function formatMinutes(mins: number, lang: Lang): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hLabel = lang === "ar" ? "س" : "h";
  const mLabel = lang === "ar" ? "د" : "m";
  const parts: string[] = [];
  if (h > 0) parts.push(`${toLocalDigits(h, lang)}${hLabel}`);
  parts.push(`${toLocalDigits(m, lang)}${mLabel}`);
  return parts.join(" ");
}
