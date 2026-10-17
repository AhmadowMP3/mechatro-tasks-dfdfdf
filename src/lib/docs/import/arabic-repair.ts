// Repair of the Arabic lam-alef ligature in text extracted from PDFs.
//
// Arabic fonts draw "لا" (lam + alef, and its hamza/madda forms) as a single
// ligature glyph. Most PDF writers (Word, LibreOffice) map that glyph to the
// two letters "لا"; the PDF reader then reverses the right-to-left run
// character by character, so the pair comes out swapped: "للمقاولات" reads
// "للمقاوالت", "الإلكتروميكانيك" reads "اإللكتروميكانيك".
//
// Two rules undo it:
//  1. Two alef-type letters in a row never occur in Arabic, so "XYل" (X, Y
//     alefs) is always a swapped ligature: "اإل" → "الإ", "حاالت" → "حالات".
//     Safe on any text.
//  2. In a document that shows the swap (it contains no genuine "لا" at all),
//     a word ending in "الت"/"الن" is the plural/noun ending "لات"/"لان",
//     and the bare word "ال" is "لا".

const ALEFS = "اأإآ";
const AR_LETTER = "ء-يٱ-ۓ";

const DOUBLE_ALEF = new RegExp(`([${ALEFS}])([${ALEFS}])ل`, "g");
const LAM_ALEF = new RegExp(`ل[${ALEFS}]`, "g");
const SWAPPED_ENDING = new RegExp(`(?<=[${AR_LETTER}])(?<![${ALEFS}])ال([تن])(?![${AR_LETTER}])`, "g");
const BARE_AL = new RegExp(`(?<![${AR_LETTER}])ال(?![${AR_LETTER}])`, "g");

/**
 * True when the text bears the reversed-ligature fingerprint: plenty of
 * Arabic, "ال" everywhere, yet not a single lam followed by alef.
 */
export function hasSwappedLamAlef(text: string): boolean {
  // Two alefs in a row cannot occur in Arabic — one is proof on its own.
  if ((text.match(DOUBLE_ALEF) ?? []).length > 0) return true;
  if (/[ً-ْ]ال/.test(text)) return true;
  const arabic = (text.match(/[؀-ۿ]/g) ?? []).length;
  if (arabic < 40) return false;
  const lamAlef = (text.match(LAM_ALEF) ?? []).length;
  const alLam = (text.match(/ال/g) ?? []).length;
  return lamAlef === 0 && alLam >= 3;
}

/** Undo swapped lam-alef ligatures. `swapped` enables the document-level rules. */
export function repairLamAlef(text: string, swapped: boolean): string {
  if (!/[؀-ۿ]/.test(text)) return text;
  let out = text.replace(DOUBLE_ALEF, "$1ل$2");
  // Tanween on the ligature: "أو ًال" → "أولاً" (the mark ends up before it, often after a space).
  out = out.replace(new RegExp(`(?<=[${AR_LETTER}])\\s?([\\u064B-\\u0652])ال(?![${AR_LETTER}])`, "g"), "لا$1");
  if (swapped) {
    // "ريال" set in a left-to-right run comes out fully reversed.
    out = out.replace(new RegExp(`(?<![${AR_LETTER}])لاير(?![${AR_LETTER}])`, "g"), "ريال");
    out = out.replace(SWAPPED_ENDING, "لا$1").replace(BARE_AL, "لا");
    // "ألن" → "لأن" (because) is the one common hamza case outside rule 1.
    out = out.replace(new RegExp(`(?<![${AR_LETTER}])ألن(?![${AR_LETTER}])`, "g"), "لأن");
    for (const [from, to] of MID_WORD) out = out.split(from).join(to);
  }
  return out;
}

/**
 * Frequent quotation/invoice words with lam-alef inside the word, where no
 * general rule can tell the swap from a genuine "ال". Each stem is specific
 * enough not to occur in correct Arabic text.
 */
const MID_WORD: [string, string][] = [
  ["مالحظ", "ملاحظ"],   // ملاحظات، ملاحظة
  ["ستالم", "ستلام"],   // استلام، الاستلام
  ["صالحي", "صلاحي"],   // صلاحية، صلاحيات
  ["عالقة", "علاقة"],
  ["عالقات", "علاقات"],
  ["سالمة", "سلامة"],   // السلامة
  ["إطالق", "إطلاق"],
  ["اطالق", "اطلاق"],
  ["إخالء", "إخلاء"],
  ["غالف", "غلاف"],
  ["خالل", "خلال"],     // خلال (during) — very common in terms
  // Not "بالغ" → "بلاغ": it would break "مبالغ" (amounts).
];
