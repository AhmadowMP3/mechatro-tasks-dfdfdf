export type RefIcon = "figma" | "drive" | "docs" | "sheets" | "slides" | "youtube" | "notion" | "github" | "gitlab" | "trello" | "slack" | "dropbox" | "onedrive" | "loom" | "canva" | "generic";

export function detectIconFromUrl(url: string): { icon: RefIcon; gradient: string; label: string } {
  let host = "";
  try { host = new URL(url).host.replace(/^www\./, "").toLowerCase(); } catch { /* noop */ }
  const map: Array<[RegExp, RefIcon, string, string]> = [
    [/figma\.com/, "figma", "linear-gradient(135deg,#F24E1E,#A259FF)", "Figma"],
    [/docs\.google\.com\/document/, "docs", "linear-gradient(135deg,#3b82f6,#1e40af)", "Google Docs"],
    [/docs\.google\.com\/spreadsheets/, "sheets", "linear-gradient(135deg,#22c55e,#166534)", "Google Sheets"],
    [/docs\.google\.com\/presentation/, "slides", "linear-gradient(135deg,#f59e0b,#b45309)", "Google Slides"],
    [/(drive|docs)\.google\.com/, "drive", "linear-gradient(135deg,#FFC107,#0F9D58,#4285F4)", "Google Drive"],
    [/(youtube\.com|youtu\.be)/, "youtube", "linear-gradient(135deg,#FF0000,#7a0000)", "YouTube"],
    [/notion\.so/, "notion", "linear-gradient(135deg,#e5e5e5,#111)", "Notion"],
    [/github\.com/, "github", "linear-gradient(135deg,#4b5563,#0f172a)", "GitHub"],
    [/gitlab\.com/, "gitlab", "linear-gradient(135deg,#FC6D26,#6f42c1)", "GitLab"],
    [/trello\.com/, "trello", "linear-gradient(135deg,#0079BF,#026AA7)", "Trello"],
    [/slack\.com/, "slack", "linear-gradient(135deg,#E01E5A,#ECB22E,#36C5F0,#2EB67D)", "Slack"],
    [/dropbox\.com/, "dropbox", "linear-gradient(135deg,#0061FF,#003ea4)", "Dropbox"],
    [/onedrive\.live\.com|1drv\.ms/, "onedrive", "linear-gradient(135deg,#0364B8,#0078D4)", "OneDrive"],
    [/loom\.com/, "loom", "linear-gradient(135deg,#625DF5,#4b46d4)", "Loom"],
    [/canva\.com/, "canva", "linear-gradient(135deg,#00C4CC,#7D2AE8)", "Canva"],
  ];
  for (const [re, icon, gradient, label] of map) {
    if (re.test(host) || re.test(url)) return { icon, gradient, label };
  }
  return { icon: "generic", gradient: "linear-gradient(135deg,#189FD1,#E7B03A)", label: host || "Link" };
}

export function isValidHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}

export function faviconFor(url: string): string {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
  } catch { return ""; }
}
