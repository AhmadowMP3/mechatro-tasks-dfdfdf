// Single source of truth for the brand logo per language.
// Arabic UI / documents use the Arabic wordmark; English keeps the original.

import logoEn from "@/assets/mechatro-logo.png";
import logoAr from "@/assets/mechatro-logo-ar.png";

export type BrandLang = "ar" | "en" | string | null | undefined;

export const LOGO_EN = logoEn;
export const LOGO_AR = logoAr;

/** Pick the logo asset URL that matches a language ("ar" → Arabic wordmark). */
export function logoFor(lang: BrandLang): string {
  return lang === "ar" ? logoAr : logoEn;
}
