// PDF report themes. Each theme controls cover gradient, page background,
// text color, accent, and card style. Content section builders read from
// the currently active theme via getTheme().

export type ThemeId = "aurora" | "executive" | "minimal" | "creative";

export type Theme = {
  id: ThemeId;
  name: { ar: string; en: string };
  tagline: { ar: string; en: string };
  // Page (content page)
  paper: string;         // page background
  ink: string;           // body text
  ink2: string;
  muted: string;         // secondary text
  line: string;          // dividers / borders
  soft: string;          // soft surface (table headers, sidebar rows)
  card: string;          // card background
  // Accents
  blue: string;
  blueDark: string;
  green: string;
  orange: string;
  red: string;
  gold: string;
  // Cover page
  coverBg: string;       // CSS background (gradient allowed)
  coverInk: string;      // cover text color
  coverSub: string;      // secondary cover text
  coverGlow: string;     // radial glow overlay
  // Pills / status colors (fallbacks; content builders keep their own map)
  statusOverride?: Partial<Record<string, string>>;
  // Chart palette (arrays of colors used by charts)
  chartPalette: string[];
};

export const THEMES: Record<ThemeId, Theme> = {
  aurora: {
    id: "aurora",
    name: { ar: "شفق داكن", en: "Aurora Dark" },
    tagline: { ar: "مستوحى من واجهة التطبيق", en: "Matches the app dark theme" },
    paper: "#0B1728",
    ink: "#EAF2F9",
    ink2: "#D5E2F0",
    muted: "#8AA0B5",
    line: "#1E2F45",
    soft: "#122236",
    card: "#101E31",
    blue: "#42C2EE",
    blueDark: "#189FD1",
    green: "#3ECF8E",
    orange: "#F5A623",
    red: "#F0676A",
    gold: "#F5D06A",
    coverBg: "linear-gradient(135deg,#050D17 0%,#0B2540 45%,#0E4A6B 100%)",
    coverInk: "#FFFFFF",
    coverSub: "rgba(255,255,255,.75)",
    coverGlow: "radial-gradient(circle at 85% 15%,rgba(66,194,238,.35),transparent 45%),radial-gradient(circle at 12% 90%,rgba(245,208,106,.28),transparent 45%)",
    chartPalette: ["#42C2EE", "#3ECF8E", "#F5A623", "#F0676A", "#A855F7", "#F5D06A"],
  },
  executive: {
    id: "executive",
    name: { ar: "تنفيذي فاخر", en: "Executive Light" },
    tagline: { ar: "أبيض راقٍ للطباعة", en: "Print-friendly corporate" },
    paper: "#FFFFFF",
    ink: "#0A2540",
    ink2: "#132D50",
    muted: "#5A6B7D",
    line: "#E4E9F2",
    soft: "#F5F8FC",
    card: "#FFFFFF",
    blue: "#0A2540",
    blueDark: "#061729",
    green: "#3F782A",
    orange: "#B8710C",
    red: "#B33438",
    gold: "#C8A24B",
    coverBg: "linear-gradient(135deg,#0A2540 0%,#132D50 50%,#0A2540 100%)",
    coverInk: "#FFFFFF",
    coverSub: "rgba(255,255,255,.72)",
    coverGlow: "radial-gradient(circle at 88% 12%,rgba(200,162,75,.22),transparent 45%)",
    chartPalette: ["#0A2540", "#C8A24B", "#3F782A", "#B8710C", "#5A6B7D", "#B33438"],
  },
  minimal: {
    id: "minimal",
    name: { ar: "أنيق بسيط", en: "Bold Minimal" },
    tagline: { ar: "فراغات وأرقام كبيرة", en: "Whitespace + big numbers" },
    paper: "#FCFCFC",
    ink: "#111111",
    ink2: "#222222",
    muted: "#8A8A8A",
    line: "#EFEFEF",
    soft: "#F8F8F8",
    card: "#FFFFFF",
    blue: "#111111",
    blueDark: "#000000",
    green: "#0C7C4A",
    orange: "#D97706",
    red: "#DC2626",
    gold: "#D4A017",
    coverBg: "#FCFCFC",
    coverInk: "#111111",
    coverSub: "#8A8A8A",
    coverGlow: "none",
    chartPalette: ["#111111", "#8A8A8A", "#D4A017", "#0C7C4A", "#D97706", "#DC2626"],
  },
  creative: {
    id: "creative",
    name: { ar: "إبداعي بسيط", en: "Creative Minimal" },
    tagline: { ar: "تحريري ثنائي اللغة", en: "Editorial bilingual" },
    paper: "#FCFCFC",
    ink: "#0B0B0B",
    ink2: "#1A1A1A",
    muted: "#8A8A8A",
    line: "#ECECEC",
    soft: "#F6F7F9",
    card: "#FFFFFF",
    blue: "#42C2EE",
    blueDark: "#189FD1",
    green: "#0C7C4A",
    orange: "#D97706",
    red: "#DC2626",
    gold: "#D4A017",
    coverBg: "#FCFCFC",
    coverInk: "#0B0B0B",
    coverSub: "#8A8A8A",
    coverGlow: "none",
    chartPalette: ["#42C2EE", "#0B0B0B", "#D4A017", "#0C7C4A", "#D97706", "#DC2626"],
  },
};

export const DEFAULT_THEME: ThemeId = "aurora";

let CURRENT: Theme = THEMES[DEFAULT_THEME];

/** Set the active theme for subsequent report builds. Call before buildReportHtml. */
export function setTheme(id: ThemeId): void {
  CURRENT = THEMES[id] ?? THEMES[DEFAULT_THEME];
}

/** Returns the currently active theme. */
export function getTheme(): Theme {
  return CURRENT;
}
