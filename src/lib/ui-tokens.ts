export const STATUS_STYLES: Record<string, { bg: string; text: string; ring: string }> = {
  todo:        { bg: "rgba(134,161,183,.15)", text: "#86A1B7", ring: "rgba(134,161,183,.35)" },
  in_progress: { bg: "rgba(24,159,209,.18)",  text: "#42C2EE", ring: "rgba(24,159,209,.4)" },
  paused:      { bg: "rgba(232,115,46,.15)",  text: "#FF9255", ring: "rgba(232,115,46,.35)" },
  in_review:   { bg: "rgba(168,85,247,.18)",  text: "#C084FC", ring: "rgba(168,85,247,.45)" },
  done:        { bg: "rgba(78,154,51,.18)",   text: "#73C94E", ring: "rgba(78,154,51,.4)" },
};

export const PRIORITY_STYLES: Record<string, { bg: string; text: string }> = {
  low:    { bg: "rgba(134,161,183,.15)", text: "#86A1B7" },
  normal: { bg: "rgba(24,159,209,.15)",  text: "#42C2EE" },
  high:   { bg: "rgba(232,115,46,.18)",  text: "#FF9255" },
  urgent: { bg: "rgba(240,103,106,.18)", text: "#F0676A" },
};

export const ROLE_STYLES: Record<string, { bg: string; text: string }> = {
  admin:   { bg: "rgba(232,115,46,.18)",  text: "#FF9255" },
  manager: { bg: "rgba(24,159,209,.18)",  text: "#42C2EE" },
  member:  { bg: "rgba(78,154,51,.18)",   text: "#73C94E" },
  viewer:  { bg: "rgba(134,161,183,.18)", text: "#86A1B7" },
};

export const PROJECT_COLORS: Record<string, string> = {
  blue: "linear-gradient(135deg,#189FD1,#39C0EC)",
  orange: "linear-gradient(135deg,#E8732E,#FF9C5A)",
  green: "linear-gradient(135deg,#3F782A,#67BD42)",
  red: "linear-gradient(135deg,#D9484B,#F0676A)",
};

export function initials(name: string | null | undefined): string {
  const s = (name ?? "").trim();
  if (!s) return "?";
  return s.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}


export function avatarColor(id: string): string {
  const hash = Array.from(id).reduce((a, c) => a + c.charCodeAt(0), 0);
  const palette = ["#189FD1", "#E8732E", "#4E9A33", "#F0676A", "#42C2EE", "#FF9255"];
  return palette[hash % palette.length];
}

export function isDriveUrl(url: string): boolean {
  return /^https?:\/\/(drive|docs)\.google\.com\//.test(url.trim());
}

export function driveFileType(url: string): string {
  if (url.includes("/document/")) return "doc";
  if (url.includes("/spreadsheets/")) return "sheet";
  if (url.includes("/presentation/")) return "slides";
  if (url.includes("/folders/")) return "folder";
  return "file";
}
