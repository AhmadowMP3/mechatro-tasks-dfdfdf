import type { Lang } from "@/i18n/dict";

// Numbers are always rendered in Latin/English digits across the app,
// regardless of the active language.
export function toLocalDigits(s: string | number, _lang: Lang): string {
  return String(s).replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

export function formatDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "—";
  const d = new Date(iso);
  // `-u-nu-latn` forces Latin digits while keeping Arabic month names in AR.
  const locale = lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
  return d.toLocaleDateString(locale, {
    day: "2-digit", month: "short", year: "numeric",
  });
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
