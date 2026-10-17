// Field extraction for imported documents — Word, PDF and OCR alike.
//
// Works on plain lines (reading order) and tables (rows of cell strings), so
// every source goes through the same deterministic rules. No AI, no network:
// the result is instant, and every field it fills is marked "from file" in
// the review screen for the user to check.

export type ImportItem = {
  no: string | null;
  descAr: string | null;
  descEn: string | null;
  unit: string | null;
  qty: number | null;
  price: number | null;
  total: number | null;
};

export type ImportFields = {
  docType: string | null;
  title: string | null;
  number: string | null;
  issueDate: string | null;
  validUntil: string | null;
  currency: string | null;
  lang: "ar" | "en";
  client: {
    nameAr: string | null;
    nameEn: string | null;
    attn: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    taxNumber: string | null;
  };
  items: ImportItem[];
};

export type FieldsInput = {
  lines: string[];
  tables: string[][][];
  fileName?: string;
  /**
   * Lines of the body only — without the original letterhead. The client's
   * details are read from here, so the sender's own phone, email and VAT
   * number (printed in its letterhead) are never taken for the client's.
   */
  bodyLines?: string[];
};

const ARABIC = /[؀-ۿ]/;
const isAr = (s: string) => ARABIC.test(s);

const clean = (s: string) =>
  s.replace(/\u00A0/g, " ").replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();

/**
 * Like `clean`, but a wide gap (two or more spaces, or a table cell divider)
 * stays a two-space gap: it separates a label's value from the next column
 * ("Tel: +963 933 945 346  Payment: 30 days").
 */
const cleanLine = (s: string) =>
  s.replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\s*\|\s*/g, "  ")
    .split(/\s{2,}/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("  ");

const PHONE = /\+?\d[\d\s\-()]{6,}\d/;
/** A tax/VAT number: one run of 8\u201320 digits (spaces or dashes inside allowed). */
const TAX_DIGITS = /\d(?:[\d\s-]{6,22})\d/;

/* ── numbers & dates ──────────────────────────────────────────── */

const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

/** "1,250.50", "1.250,50", "١٢٥٠" → number. */
export function parseNum(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let t = toLatinDigits(String(raw)).replace(/[٬،]/g, ",").replace(/٫/g, ".").replace(/[^\d.,-]/g, "");
  if (!t || !/\d/.test(t)) return null;
  // The last separator followed by 1–2 digits is the decimal point.
  const dec = /[.,](\d{1,2})$/.exec(t);
  if (dec) t = `${t.slice(0, dec.index).replace(/[.,]/g, "")}.${dec[1]}`;
  else t = t.replace(/[.,]/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const AR_MONTHS: [RegExp, number][] = [
  [/كانون\s*الثاني|يناير/, 1], [/شباط|فبراير/, 2], [/آذار|مارس/, 3], [/نيسان|أبريل|ابريل/, 4],
  [/أيار|ايار|مايو/, 5], [/حزيران|يونيو/, 6], [/تموز|يوليو/, 7], [/آب|أغسطس|اغسطس/, 8],
  [/أيلول|ايلول|سبتمبر/, 9], [/تشرين\s*الأول|تشرين\s*الاول|أكتوبر|اكتوبر/, 10],
  [/تشرين\s*الثاني|نوفمبر/, 11], [/كانون\s*الأول|كانون\s*الاول|ديسمبر/, 12],
];

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Common date shapes → ISO (yyyy-mm-dd). Day-first is the house style. */
export function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = toLatinDigits(String(raw));
  let m = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/.exec(t);
  if (m) {
    let [d, mo] = [+m[1]!, +m[2]!];
    if (d <= 12 && mo > 12) [d, mo] = [mo, d];
    return iso(+m[3]!, mo, d);
  }
  m = /(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})/.exec(t);
  if (m) { const i = MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase()); if (i >= 0) return iso(+m[3]!, i + 1, +m[1]!); }
  m = /([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(t);
  if (m) { const i = MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase()); if (i >= 0) return iso(+m[3]!, i + 1, +m[2]!); }
  m = /(\d{1,2})\s+([؀-ۿ ]{2,16}?)\s+(\d{4})/.exec(t);
  if (m) { const hit = AR_MONTHS.find(([re]) => re.test(m![2]!)); if (hit) return iso(+m[3]!, hit[1], +m[1]!); }
  return null;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ── type, number, currency ───────────────────────────────────── */

const TYPE_RULES: Array<{ type: string; re: RegExp }> = [
  { type: "proforma_invoice", re: /(proforma|pro\s*forma|فاتورة\s*(?:مبدئية|أولية|اولية))/i },
  { type: "purchase_order", re: /(purchase\s*order|أمر\s*شراء|امر\s*شراء|طلب\s*شراء)/i },
  { type: "rfq", re: /(request\s*for\s*(?:a\s*)?quot|\bRFQ\b|طلب\s*عرض\s*(?:سعر|أسعار))/i },
  { type: "invoice", re: /(\binvoice\b|فاتورة)/i },
  { type: "quotation", re: /(quotation|\bquote\b|عرض\s*(?:سعر|أسعار|اسعار))/i },
  { type: "offer", re: /(\boffer\b|عرض\s*(?:فني|تجاري|فني\s*ومالي))/i },
];

const FILE_TYPE: Record<string, string> = { QT: "quotation", QUO: "quotation", INV: "invoice", PI: "proforma_invoice", PO: "purchase_order", RFQ: "rfq", OF: "offer" };

/** "Mktro_QT_014_06_09_26.docx" → { code: "QT", num: "014", date: "2026-09-06" }. */
export function parseFileName(fileName: string): { code: string | null; number: string | null; date: string | null } {
  const base = fileName.replace(/\.[^.]+$/, "");
  const m = /(?:^|[_\-\s])([A-Z]{2,4})[_\-\s]?(\d{2,6})(?:[_\-\s](\d{1,2})[_\-.](\d{1,2})[_\-.](\d{2,4}))?(?=$|[_\-\s])/.exec(base);
  if (!m) return { code: null, number: null, date: null };
  const date = m[3] ? iso(+m[5]!, +m[4]!, +m[3]!) : null;
  return { code: m[1]!, number: `${m[1]}-${m[2]}`, date };
}

const CURRENCY_RULES: Array<{ code: string; re: RegExp }> = [
  { code: "SAR", re: /(\bSAR\b|\bS\.?R\.?\b|ر\.\s?س|ريال\s*سعودي|﷼)/i },
  { code: "SYP", re: /(\bSYP\b|\bS\.?P\.?\b|ل\.\s?س|ليرة\s*سوري)/i },
  { code: "AED", re: /(\bAED\b|درهم)/i },
  { code: "TRY", re: /(\bTRY\b|₺|ليرة\s*تركي)/i },
  { code: "EUR", re: /(\bEUR\b|€|يورو)/i },
  { code: "USD", re: /(\bUSD\b|US\s?\$|\$|دولار)/i },
];

/* ── labelled values ──────────────────────────────────────────── */

/** Value written after a label on the same line, else the next line. */
function afterLabel(lines: string[], label: RegExp): string | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = label.exec(line);
    if (!m) continue;
    const rest = clean(line.slice(m.index + m[0].length).replace(/^[\s:：\-–—|/]+/, "").split(/\s{2,}|\s\|\s/)[0] ?? "");
    if (rest) return rest;
    const next = clean(lines[i + 1] ?? "");
    if (next && !label.test(next)) return next;
  }
  return null;
}

const NUMBER_LABEL = /(?:رقم\s*(?:العرض|الفاتورة|المستند|المرجع|الطلب|أمر\s*الشراء)|المرجع|الرقم\s*المرجعي|(?:Quotation|Quote|Invoice|Offer|Order|PO|Ref(?:erence)?|Doc(?:ument)?)\s*(?:No\.?|Number|#)|Ref\.?\s*:)/i;
const DATE_LABEL = /(?:التاريخ|تاريخ\s*(?:العرض|الفاتورة|الإصدار|الاصدار)|\bDate\b|Issue\s*Date|Dated)/i;
const VALID_LABEL = /(?:صالح\s*(?:حتى|لغاية|إلى)|تاريخ\s*الانتهاء|ينتهي|Valid\s*(?:until|till|to|thru)|Expiry(?:\s*Date)?|Expires)/i;
const VALID_DAYS = /(?:صالح|صلاحية|سريان)[^\d٠-٩]{0,25}([0-9٠-٩]{1,3})\s*(?:يوم|أيام|ايام)|valid(?:ity)?\s*(?:for|period)?[^\d]{0,12}(\d{1,3})\s*days?/i;

/** "السادة شركة البنيان للمقاولات المحترمون،" → "شركة البنيان للمقاولات". */
// Trailing punctuation is any mix of marks: OCR often reads "،" as "+" or "؛".
const SALUTATION = /^(?:إلى\s*:?\s*)?(?:السادة|السيدة|حضرة\s*السادة)\s*[:/-]?\s*(.+?)\s*(?:المحترمين|المحترمون|المحترم|المحترمة|الكرام|حفظهم\s*الله|حفظه\s*الله)?[\s،؛,.:;+*'"!?_-]*$/;
const CLIENT_LABEL = /(?:اسم\s*العميل|العميل|الجهة\s*الطالبة|المطلوب\s*من|Client(?:\s*Name)?|Customer(?:\s*Name)?|Bill\s*To|Messrs\.?|M\/s\.?|^To\s*:)/i;
const PERSON = /^(?:السيد|السيدة|المهندس|المهندسة|م\.|الأستاذ|الاستاذ|الدكتور|د\.|Mr\.?|Mrs\.?|Ms\.?|Eng\.?|Dr\.?)\s+/;
/** An honorific and whatever punctuation follows it (OCR included). */
const HONORIFIC = /\s*(?:المحترم|المحترمة|المحترمين|حفظه\s*الله)[\s،؛,.:;+*'"!?_-]*$/;
/** Stray trailing marks — never a full stop, which ends "Co." / "Ltd.". */
const TRAILING_MARKS = /[\s،؛,:;+*'"!?_-]+$/;
const stripHonorific = (s: string) => s.replace(HONORIFIC, "").replace(TRAILING_MARKS, "").trim();
const ATTN_LABEL = /(?:لعناية|عناية|بعناية|Attn\.?|Attention)/i;

function detectClient(lines: string[]): { name: string | null; attn: string | null } {
  const head = lines.slice(0, 40);
  for (let i = 0; i < head.length; i++) {
    const m = SALUTATION.exec(clean(head[i]!));
    if (!m) continue;
    const name = clean(m[1]!).replace(/[،,]+$/, "");
    const next = clean(head[i + 1] ?? "");
    const attn = PERSON.test(next) ? stripHonorific(clean(next)) : null;
    if (name.length >= 3) return { name, attn };
  }
  const labelled = afterLabel(head, CLIENT_LABEL);
  return { name: labelled ? stripHonorific(clean(labelled)) : null, attn: null };
}

/* ── items table ──────────────────────────────────────────────── */

const H_DESC = /(الوصف|البيان|التفاصيل|الصنف|البند|المادة|description|item|details|particulars|product)/i;
const H_QTY = /(الكمية|العدد|qty|quantity|q'?ty)/i;
const H_PRICE = /(سعر\s*الوحدة|السعر|الافرادي|الإفرادي|unit\s*price|u\.?\s*price|price|rate)/i;
const H_UNIT = /^(الوحدة|وحدة|unit|uom)$/i;
const H_TOTAL = /(الإجمالي|الاجمالي|المجموع|القيمة|total|amount)/i;
const H_NO = /^(#|م|ت|رقم|الرقم|no\.?|s\/?n|sr\.?|item\s*no\.?)$/i;
// Whole words only: "Network switch" is an item, "Net total" is not.
const TOTAL_ROW = /^(?:الإجمالي|الاجمالي|المجموع|الصافي|ضريبة|الخصم|(?:sub\s*-?\s*|grand\s+)?total|vat|tax|discount|net)(?![A-Za-z])/i;

function extractItems(tables: string[][][]): ImportItem[] {
  for (const table of tables) {
    for (let h = 0; h < Math.min(3, table.length - 1); h++) {
      const header = table[h]!.map(clean);
      const find = (re: RegExp, not: number[] = []) => header.findIndex((c, i) => !not.includes(i) && re.test(c));
      const iDesc = find(H_DESC);
      const iQty = find(H_QTY, [iDesc]);
      const iPrice = find(H_PRICE, [iDesc, iQty]);
      if (iDesc < 0 || (iQty < 0 && iPrice < 0)) continue;
      const iTotal = find(H_TOTAL, [iDesc, iQty, iPrice]);
      const iUnit = find(H_UNIT, [iDesc, iQty, iPrice, iTotal]);
      const iNo = header.findIndex((c) => H_NO.test(c));

      const items: ImportItem[] = [];
      for (const row of table.slice(h + 1)) {
        const cells = row.map(clean);
        const desc = cells[iDesc] ?? "";
        if (!desc && cells.every((c) => !c)) continue;
        if (TOTAL_ROW.test(desc) || cells.some((c, i) => i !== iDesc && TOTAL_ROW.test(c) && !parseNum(c))) continue;
        const qty = iQty >= 0 ? parseNum(cells[iQty]) : null;
        const price = iPrice >= 0 ? parseNum(cells[iPrice]) : null;
        if (!desc && qty == null && price == null) continue;
        items.push({
          no: iNo >= 0 ? cells[iNo] || null : null,
          descAr: isAr(desc) ? desc : null,
          descEn: desc && !isAr(desc) ? desc : null,
          unit: iUnit >= 0 ? cells[iUnit] || null : null,
          qty,
          price,
          total: iTotal >= 0 ? parseNum(cells[iTotal]) : null,
        });
      }
      if (items.length > 0) return items;
    }
  }
  return [];
}

/* ── main ─────────────────────────────────────────────────────── */

export function extractFields(input: FieldsInput): ImportFields {
  const lines = input.lines.map(cleanLine).filter(Boolean);
  const body = (input.bodyLines ?? input.lines).map(cleanLine).filter(Boolean);
  const text = lines.join("\n");
  const bodyText = body.join("\n");
  const file = parseFileName(input.fileName ?? "");
  const head = lines.slice(0, 25).join("\n");

  const docType =
    TYPE_RULES.find((r) => r.re.test(head))?.type ??
    (file.code ? FILE_TYPE[file.code] ?? null : null) ??
    TYPE_RULES.find((r) => r.re.test(text))?.type ??
    null;

  const labelledNo = afterLabel(lines, NUMBER_LABEL);
  const number =
    (labelledNo && /([A-Za-z]{0,6}[-_/]?\d[\w\-/]*)/.exec(toLatinDigits(labelledNo))?.[1]) ||
    /\b([A-Z]{2,5}[-/]\d{2,6}(?:[-/]\d{2,6})?)\b/.exec(toLatinDigits(text))?.[1] ||
    file.number;

  const issueDate = parseDate(afterLabel(lines, DATE_LABEL)) ?? file.date ?? parseDate(lines.slice(0, 30).join(" "));
  let validUntil = parseDate(afterLabel(lines, VALID_LABEL));
  if (!validUntil && issueDate) {
    const days = VALID_DAYS.exec(toLatinDigits(text));
    const n = days ? Number(days[1] ?? days[2]) : NaN;
    if (Number.isFinite(n) && n > 0 && n <= 365) validUntil = addDays(issueDate, n);
  }

  // The client's details come from the body only (never the sender's letterhead).
  const { name, attn } = detectClient(body);
  const labelledAttn = afterLabel(body.slice(0, 40), ATTN_LABEL);
  const phoneRaw = afterLabel(body, /(?:الهاتف|هاتف|الجوال|جوال|موبايل|Tel\.?|Phone|Mobile|Mob\.?)\s*[:：]/i);
  const phone = phoneRaw ? PHONE.exec(toLatinDigits(phoneRaw))?.[0]?.trim() ?? null : null;
  const email = /[\w.+-]+@[\w-]+\.[\w.]{2,}/.exec(bodyText)?.[0] ?? null;
  const address = afterLabel(body, /(?:العنوان|Address)\s*[:：]/i);
  const taxRaw = afterLabel(body, /(?:الرقم\s*الضريبي|الرقم\s*الضريبى|VAT\s*(?:No\.?|Number|Reg)|Tax\s*(?:No\.?|Number|ID))/i);
  const taxDigits = taxRaw ? (TAX_DIGITS.exec(toLatinDigits(taxRaw))?.[0] ?? "").replace(/\D/g, "") : "";

  // Title: the first early line naming the document type, else the first heading-like line.
  const title =
    lines.slice(0, 20).find((l) => l.length >= 4 && l.length <= 160 && TYPE_RULES.some((r) => r.re.test(l))) ??
    lines.slice(0, 8).find((l) => l.length >= 6 && l.length <= 120 && !SALUTATION.test(l) && !NUMBER_LABEL.test(l)) ??
    null;

  const arabic = (text.match(/[؀-ۿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;

  return {
    docType,
    title,
    number: number ? number.replace(/_/g, "-") : null,
    issueDate,
    validUntil,
    currency: CURRENCY_RULES.find((r) => r.re.test(text))?.code ?? null,
    lang: arabic > latin * 0.5 ? "ar" : "en",
    client: {
      nameAr: name && isAr(name) ? name : null,
      nameEn: name && !isAr(name) ? name : null,
      attn: attn ?? labelledAttn,
      phone,
      email,
      address,
      taxNumber: taxDigits.length >= 8 && taxDigits.length <= 20 ? taxDigits : null,
    },
    items: extractItems(input.tables),
  };
}

/** Field keys the review screen marks as "not found in the file". */
export function missingFields(f: ImportFields): string[] {
  const out: string[] = [];
  if (!f.number) out.push("number");
  if (!f.issueDate) out.push("issueDate");
  if (!f.client.nameAr && !f.client.nameEn) out.push("client");
  return out;
}
